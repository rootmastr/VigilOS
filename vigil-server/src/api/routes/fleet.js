/**
 * Fleet Management Routes — Vehicles & Drivers
 * 
 * Handles vehicle and driver CRUD operations.
 * Integrates with MQTT broker for real-time updates.
 */

import express from 'express';
import crypto from 'crypto';
import { db } from '../../services/databaseService.js';
import { postgresDB } from '../../database/postgresAdapter.js';
import { requireRole } from '../../middleware/auth.js';

const router = express.Router();

// Decode %2F in :id params (vehicle/driver IDs may contain slashes)
router.use((req, res, next) => {
  if (req.params.id) {
    try {
      req.params.id = decodeURIComponent(req.params.id);
    } catch {}
  }
  next();
});

// MQTT broker instance (injected via server.js)
let mqttBroker = null;

export function setMqttBroker(broker) {
  mqttBroker = broker;
}

/**
 * GET /vehicles
 * List all vehicles for tenant
 */
router.get('/vehicles', async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;

    const where = {};
    if (tenantId) where.tenantId = tenantId;

    const { status, type, skip = 0, take = 200 } = req.query;
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
router.get('/vehicles/:id', async (req, res) => {
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
router.post('/vehicles', requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const { id: requestedId, code, name, type, lat, lng, speedLimit } = req.body;

  try {
    if (!code || !name) {
      return res.status(400).json({
        success: false,
        error: 'Code and name are required',
      });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      console.error('Create vehicle error: tenantId is missing from JWT token');
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required. Your account may not be assigned to a tenant.',
      });
    }

    // Check if vehicle code already exists for this tenant
    const existing = await db.getVehicleByCode(tenantId, code);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Vehicle code already exists',
      });
    }

    // Use the provided vehicle ID (e.g. BUS-102) as the device identifier.
    // Falls back to code if no explicit ID was supplied.
    // If that ID is taken (e.g. by another tenant), generate a unique one.
    let vehicleId = requestedId || code;

    // Check if the chosen ID already exists globally (id is PK, not tenant-scoped)
    const existingById = await db.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (existingById) {
      // Append a short random suffix to avoid collision
      const suffix = crypto.randomBytes(3).toString('hex');
      vehicleId = `${vehicleId}-${suffix}`;
    }

    const vehicle = await db.createVehicle({
      id: vehicleId,
      tenantId,
      code,
      name,
      type: type || 'BUS',
      lat: lat || -6.9666,
      lng: lng || 110.4196,
      speedLimit: speedLimit || 50,
      status: 'OFFLINE',
    });

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
    console.error('Create vehicle error:', error.message, error.stack);
    if (error.code) {
      console.error('Prisma error code:', error.code);
    }
    // Handle Prisma unique constraint error (P2002)
    if (error.code === 'P2002') {
      const target = error.meta?.target?.join(', ') || 'id';
      return res.status(409).json({
        success: false,
        error: `A vehicle with this ${target} already exists`,
      });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PATCH /vehicles/:id
 * Partial update vehicle (e.g., status)
 */
router.patch('/vehicles/:id', requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const vehicle = await db.getVehicleById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== vehicle.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const updated = await db.updateVehicle(req.params.id, req.body);
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
router.put('/vehicles/:id', requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
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
router.delete('/vehicles/:id', requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const vehicle = await db.getVehicleById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== vehicle.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Soft delete in PostgreSQL
    await db.deleteVehicle(req.params.id);

    // Stop simulation if running
    if (mqttBroker?.stopDeviceTelemetry) {
      mqttBroker.stopDeviceTelemetry(vehicle.id);
    }

    // Broadcast via MQTT
    if (mqttBroker?.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('vehicle_deleted', { id: req.params.id });
    }

    // Revoke any active device tokens for this vehicle
    try {
      const tokens = await postgresDB.getDeviceTokens();
      for (const t of tokens) {
        if (t.deviceId === vehicle.id || t.deviceId === vehicle.code) {
          if (typeof postgresDB.revokeDeviceToken === 'function') {
            await postgresDB.revokeDeviceToken(t.id);
          } else {
            await db.prisma.deviceToken.update({
              where: { id: t.id },
              data: { status: 'REVOKED', revokedAt: new Date() },
            }).catch(() => {});
          }
        }
      }
    } catch (_) {}

    // Log vehicle deletion
    try {
      await db.createAuditLog({
        tenantId: vehicle.tenantId,
        userId: req.user.id,
        action: 'VEHICLE_DELETED',
        resource: 'vehicle',
        resourceId: vehicle.id,
        details: { code: vehicle.code, name: vehicle.name },
        ipAddress: req.ip,
      });
    } catch (_) {}

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
router.get('/drivers', async (req, res) => {
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
router.get('/drivers/:id', async (req, res) => {
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
router.post('/drivers', requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const { id: requestId, name, licenseNo, phone, vehicleId, safetyScore } = req.body;

  try {
    if (!name || !licenseNo) {
      return res.status(400).json({
        success: false,
        error: 'Name and license number are required',
      });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      console.error('Create driver error: tenantId is missing from JWT token');
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required. Your account may not be assigned to a tenant.',
      });
    }

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
    console.error('Create driver error:', error.message, error.stack);
    if (error.code) {
      console.error('Prisma error code:', error.code);
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /drivers/:id
 * Update driver
 */
router.put('/drivers/:id', requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
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
router.delete('/drivers/:id', requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const driver = await db.getDriverById(req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== driver.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Soft delete in PostgreSQL
    await db.deleteDriver(req.params.id);

    // Broadcast via MQTT
    if (mqttBroker?.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('driver_deleted', { id: req.params.id });
    }

    // Log driver deletion
    try {
      await db.createAuditLog({
        tenantId: driver.tenantId,
        userId: req.user.id,
        action: 'DRIVER_DELETED',
        resource: 'driver',
        resourceId: driver.id,
        details: { name: driver.name, licenseNo: driver.licenseNo },
        ipAddress: req.ip,
      });
    } catch (_) {}

    res.json({ success: true, message: 'Driver deleted' });
  } catch (error) {
    console.error('Delete driver error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
