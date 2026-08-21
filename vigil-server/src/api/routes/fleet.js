/**
 * Fleet Management Routes — Vehicles & Drivers
 * 
 * Handles vehicle and driver CRUD operations.
 * Integrates with MQTT broker for real-time updates.
 */

import express from 'express';
import { db } from '../../services/databaseService.js';
import { postgresDB } from '../../database/postgresAdapter.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';

const router = express.Router();

// MQTT broker instance (injected via server.js)
let mqttBroker = null;

export function setMqttBroker(broker) {
  mqttBroker = broker;
}

/**
 * GET /vehicles
 * List all vehicles for tenant
 */
router.get('/vehicles', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const { status, type, skip = 0, take = 50 } = req.query;

    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;
    if (type) where.type = type;

    const vehicles = await db.listVehicles({
      skip: parseInt(skip),
      take: parseInt(take),
      where,
    });

    res.json({
      success: true,
      count: vehicles.length,
      data: vehicles,
    });
  } catch (error) {
    console.error('List vehicles error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /vehicles/:id
 * Get vehicle by ID
 */
router.get('/vehicles/:id', authenticateToken, async (req, res) => {
  try {
    const vehicle = await db.getVehicleById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== vehicle.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: vehicle });
  } catch (error) {
    console.error('Get vehicle error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /vehicles
 * Create new vehicle
 */
router.post('/vehicles', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const { code, name, type, lat, lng, speedLimit } = req.body;

  try {
    if (!code || !name) {
      return res.status(400).json({
        success: false,
        error: 'Code and name are required',
      });
    }

    const tenantId = req.user.tenantId;

    // Check if vehicle code already exists for this tenant
    const existing = await db.getVehicleByCode(tenantId, code);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Vehicle code already exists',
      });
    }

    const vehicle = await db.createVehicle({
      id: code,
      tenantId,
      code,
      name,
      type: type || 'BUS',
      lat: lat || -6.9666,
      lng: lng || 110.4196,
      speedLimit: speedLimit || 50,
      status: 'OFFLINE',
    });

    // Sync to in-memory store for MQTT simulator
    postgresDB.vehicles.push(vehicle);

    // Broadcast via MQTT
    if (mqttBroker?.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('vehicle_added', vehicle);
    }

    // Log vehicle creation
    await db.createAuditLog({
      tenantId,
      userId: req.user.id,
      action: 'VEHICLE_CREATED',
      resource: 'vehicle',
      resourceId: vehicle.id,
      details: { code, name, type },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: vehicle });
  } catch (error) {
    console.error('Create vehicle error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PATCH /vehicles/:id
 * Partial update vehicle (e.g., status)
 */
router.patch('/vehicles/:id', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const vehicle = await db.getVehicleById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== vehicle.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const updated = await db.updateVehicle(req.params.id, req.body);
    const idx = postgresDB.vehicles.findIndex(v => v.id === req.params.id);
    if (idx !== -1) Object.assign(postgresDB.vehicles[idx], req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Patch vehicle error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /vehicles/:id
 * Update vehicle
 */
router.put('/vehicles/:id', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const vehicle = await db.getVehicleById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== vehicle.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { name, type, lat, lng, speedLimit, status } = req.body;
    const updated = await db.updateVehicle(req.params.id, {
      name,
      type,
      lat,
      lng,
      speedLimit,
      status,
    });

    // Sync to in-memory store
    const idx = postgresDB.vehicles.findIndex(v => v.id === updated.id);
    if (idx >= 0) postgresDB.vehicles[idx] = { ...postgresDB.vehicles[idx], ...updated };

    // Broadcast via MQTT
    if (mqttBroker?.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('vehicle_updated', updated);
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update vehicle error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * DELETE /vehicles/:id
 * Delete vehicle (soft delete)
 */
router.delete('/vehicles/:id', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const vehicle = await db.getVehicleById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== vehicle.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await db.deleteVehicle(req.params.id);

    // Sync to in-memory store
    postgresDB.vehicles = postgresDB.vehicles.filter(v => v.id !== req.params.id);

    // Broadcast via MQTT
    if (mqttBroker?.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('vehicle_deleted', { id: req.params.id });
    }

    // Log vehicle deletion
    await db.createAuditLog({
      tenantId: vehicle.tenantId,
      userId: req.user.id,
      action: 'VEHICLE_DELETED',
      resource: 'vehicle',
      resourceId: vehicle.id,
      details: { code: vehicle.code, name: vehicle.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Vehicle deleted' });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /drivers
 * List all drivers for tenant
 */
router.get('/drivers', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const { status, skip = 0, take = 50 } = req.query;

    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;

    const drivers = await db.listDrivers({
      skip: parseInt(skip),
      take: parseInt(take),
      where,
    });

    res.json({
      success: true,
      count: drivers.length,
      data: drivers,
    });
  } catch (error) {
    console.error('List drivers error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /drivers/:id
 * Get driver by ID
 */
router.get('/drivers/:id', authenticateToken, async (req, res) => {
  try {
    const driver = await db.getDriverById(req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== driver.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: driver });
  } catch (error) {
    console.error('Get driver error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /drivers
 * Create new driver
 */
router.post('/drivers', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const { id: requestId, name, licenseNo, phone, vehicleId, safetyScore } = req.body;

  try {
    if (!name || !licenseNo) {
      return res.status(400).json({
        success: false,
        error: 'Name and license number are required',
      });
    }

    const tenantId = req.user.tenantId;

    // Generate D#### ID if not provided
    let driverId = requestId;
    if (!driverId) {
      const count = await db.prisma.driver.count({ where: { tenantId } });
      driverId = `D${String(count + 1).padStart(4, '0')}`;
    }

    const driver = await db.createDriver({
      id: driverId,
      tenantId,
      name,
      licenseNo,
      phone,
      vehicleId,
      safetyScore: Number(safetyScore) || 90,
    });

    // Sync to in-memory store
    postgresDB.drivers.push(driver);

    // Broadcast via MQTT
    if (mqttBroker?.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('driver_added', driver);
    }

    // Log driver creation
    await db.createAuditLog({
      tenantId,
      userId: req.user.id,
      action: 'DRIVER_CREATED',
      resource: 'driver',
      resourceId: driver.id,
      details: { name, licenseNo },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: driver });
  } catch (error) {
    console.error('Create driver error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /drivers/:id
 * Update driver
 */
router.put('/drivers/:id', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const driver = await db.getDriverById(req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== driver.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { name, licenseNo, phone, vehicleId, status } = req.body;
    const updated = await db.updateDriver(req.params.id, {
      name,
      licenseNo,
      phone,
      vehicleId,
      status,
    });

    // Sync to in-memory store
    const dIdx = postgresDB.drivers.findIndex(d => d.id === updated.id);
    if (dIdx >= 0) postgresDB.drivers[dIdx] = { ...postgresDB.drivers[dIdx], ...updated };

    // Broadcast via MQTT
    if (mqttBroker?.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('driver_updated', updated);
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update driver error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * DELETE /drivers/:id
 * Delete driver (soft delete)
 */
router.delete('/drivers/:id', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const driver = await db.getDriverById(req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== driver.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await db.deleteDriver(req.params.id);

    // Sync to in-memory store
    postgresDB.drivers = postgresDB.drivers.filter(d => d.id !== req.params.id);

    // Broadcast via MQTT

    // Log driver deletion
    await db.createAuditLog({
      tenantId: driver.tenantId,
      userId: req.user.id,
      action: 'DRIVER_DELETED',
      resource: 'driver',
      resourceId: driver.id,
      details: { name: driver.name, licenseNo: driver.licenseNo },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Driver deleted' });
  } catch (error) {
    console.error('Delete driver error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
