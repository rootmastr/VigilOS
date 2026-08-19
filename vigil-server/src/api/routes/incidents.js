/**
 * Incident Management Routes — PRD §3.4
 * 
 * Handles incident CRUD, timeline, acknowledgment, and resolution.
 * Integrates with WebSocket for real-time updates.
 */

import express from 'express';
import { db } from '../../services/databaseService.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';

const router = express.Router();

// MQTT broker instance (injected via server.js)
let mqttBroker = null;

export function setMqttBroker(broker) {
  mqttBroker = broker;
}

/**
 * GET /incidents
 * List incidents with filtering and pagination
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const { status, type, severity, from, to, page = 1, limit = 10, search } = req.query;

    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (severity) where.severity = severity;

    // Date range filtering
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(100, parseInt(limit));

    const [incidents, total] = await Promise.all([
      db.listIncidents({ skip, take, where, orderBy: { createdAt: 'desc' } }),
      db.prisma.incident.count({ where }),
    ]);

    res.json({
      success: true,
      count: incidents.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / take),
      limit: take,
      data: incidents,
    });
  } catch (error) {
    console.error('List incidents error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /incidents/:id
 * Get incident by ID
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const incident = await db.getIncidentById(req.params.id);
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== incident.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: incident });
  } catch (error) {
    console.error('Get incident error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /incidents/:id/timeline
 * Get incident timeline
 */
router.get('/:id/timeline', authenticateToken, async (req, res) => {
  try {
    const incident = await db.getIncidentById(req.params.id);
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== incident.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Build timeline
    const timeline = [
      {
        time: incident.createdAt,
        event: 'TRIGGERED',
        actor: 'System',
        description: `${incident.type} alert triggered. Severity: ${incident.severity}.`,
      },
    ];

    if (incident.acknowledgedAt) {
      timeline.push({
        time: incident.acknowledgedAt,
        event: 'ACKNOWLEDGED',
        actor: incident.acknowledgedBy || 'Operator',
        description: `Incident acknowledged by ${incident.acknowledgedBy}.`,
      });
    }

    if (incident.resolvedAt) {
      timeline.push({
        time: incident.resolvedAt,
        event: 'RESOLVED',
        actor: incident.acknowledgedBy || 'Operator',
        description: 'Incident resolved.',
      });
    }

    res.json({
      success: true,
      incidentId: incident.id,
      status: incident.status,
      timeline,
    });
  } catch (error) {
    console.error('Get incident timeline error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /incidents/:id/acknowledge
 * Acknowledge incident
 */
router.post('/:id/acknowledge', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN', 'COMMAND_CENTER_OPERATOR'), async (req, res) => {
  const { operatorId } = req.body;

  try {
    const incident = await db.getIncidentById(req.params.id);
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== incident.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (incident.status !== 'OPEN') {
      return res.status(400).json({ success: false, error: 'Incident is not in OPEN status' });
    }

    const updated = await db.updateIncident(req.params.id, {
      status: 'ACKNOWLEDGED',
      acknowledgedBy: req.user.name || operatorId || 'Operator',
      acknowledgedAt: new Date(),
    });

    // Broadcast via WebSocket
    if (mqttBroker?.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('incident_acknowledged', updated);
    }

    // Log acknowledgment
    await db.createAuditLog({
      tenantId: incident.tenantId,
      userId: req.user.id,
      action: 'INCIDENT_ACKNOWLEDGED',
      resource: 'incident',
      resourceId: incident.id,
      details: { acknowledgedBy: req.user.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Acknowledge incident error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /incidents/:id/resolve
 * Resolve incident
 */
router.post('/:id/resolve', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN', 'COMMAND_CENTER_OPERATOR'), async (req, res) => {
  const { operatorId, fieldReport } = req.body;

  try {
    const incident = await db.getIncidentById(req.params.id);
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== incident.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (!['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(incident.status)) {
      return res.status(400).json({ success: false, error: 'Incident cannot be resolved in current status' });
    }

    const updated = await db.updateIncident(req.params.id, {
      status: 'RESOLVED',
      resolvedAt: new Date(),
    });

    // Broadcast via WebSocket
    if (mqttBroker?.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('incident_resolved', updated);
    }

    // Log resolution
    await db.createAuditLog({
      tenantId: incident.tenantId,
      userId: req.user.id,
      action: 'INCIDENT_RESOLVED',
      resource: 'incident',
      resourceId: incident.id,
      details: { resolvedBy: req.user.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Resolve incident error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /incidents/export
 * Export incidents as CSV
 */
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const { format = 'csv', status, type, severity, from, to } = req.query;

    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (severity) where.severity = severity;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const incidents = await db.listIncidents({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000, // Limit for export
    });

    if (format === 'csv') {
      const headers = ['ID', 'Type', 'Severity', 'Status', 'Created At', 'Acknowledged By', 'Resolved At'];
      const rows = incidents.map(i => [
        i.id,
        i.type,
        i.severity,
        i.status,
        i.createdAt,
        i.acknowledgedBy || '',
        i.resolvedAt || '',
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="incidents-${Date.now()}.csv"`);
      return res.send(csv);
    }

    res.json({ success: true, count: incidents.length, data: incidents });
  } catch (error) {
    console.error('Export incidents error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
