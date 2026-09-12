/**
 * Admin DB Panel Routes — VigilOS V3
 *
 * SUPER_ADMIN-only endpoints for direct database management.
 * Provides generic CRUD operations across all tenant-scoped models.
 */

import express from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { db } from '../../services/databaseService.js';

const router = express.Router();

// All routes require SUPER_ADMIN
router.use(authenticateToken, requireRole('SUPER_ADMIN'));

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE REGISTRY — Models exposed to the admin panel
// ═══════════════════════════════════════════════════════════════════════════════

const TABLES = {
  users: {
    model: 'user',
    label: 'Users',
    columns: ['id', 'email', 'name', 'role', 'status', 'tenantId', 'createdAt'],
    searchable: ['email', 'name'],
    sortable: ['name', 'email', 'role', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  vehicles: {
    model: 'vehicle',
    label: 'Vehicles',
    columns: ['id', 'code', 'name', 'type', 'status', 'driver', 'speedLimit', 'lat', 'lng', 'tenantId', 'createdAt'],
    searchable: ['id', 'code', 'name', 'driver'],
    sortable: ['code', 'name', 'type', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: true,
  },
  drivers: {
    model: 'driver',
    label: 'Drivers',
    columns: ['id', 'name', 'licenseNo', 'phone', 'vehicleId', 'safetyScore', 'status', 'tenantId', 'createdAt'],
    searchable: ['name', 'licenseNo', 'phone'],
    sortable: ['name', 'licenseNo', 'safetyScore', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: true,
  },
  officers: {
    model: 'officer',
    label: 'Officers',
    columns: ['id', 'name', 'badgeNumber', 'rank', 'phone', 'status', 'tenantId', 'createdAt'],
    searchable: ['name', 'badgeNumber', 'rank'],
    sortable: ['name', 'badgeNumber', 'rank', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: true,
  },
  incidents: {
    model: 'incident',
    label: 'Incidents',
    columns: ['id', 'type', 'severity', 'status', 'description', 'vehicleId', 'lat', 'lng', 'tenantId', 'createdAt'],
    searchable: ['type', 'description'],
    sortable: ['type', 'severity', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  device_tokens: {
    model: 'deviceToken',
    label: 'Device Tokens',
    columns: ['id', 'deviceId', 'tokenHash', 'vehicleId', 'status', 'tenantId', 'expiresAt', 'lastUsedAt', 'createdAt'],
    searchable: ['deviceId', 'tokenHash'],
    sortable: ['deviceId', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  api_keys: {
    model: 'aPIKey',
    label: 'API Keys',
    columns: ['id', 'name', 'keyHash', 'permissions', 'status', 'tenantId', 'expiresAt', 'lastUsedAt', 'createdAt'],
    searchable: ['name'],
    sortable: ['name', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  audit_logs: {
    model: 'auditLog',
    label: 'Audit Logs',
    columns: ['id', 'userId', 'action', 'resource', 'resourceId', 'details', 'ipAddress', 'tenantId', 'createdAt'],
    searchable: ['action', 'resource', 'resourceId'],
    sortable: ['action', 'resource', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  security_events: {
    model: 'securityEvent',
    label: 'Security Events',
    columns: ['id', 'eventType', 'deviceId', 'ipAddress', 'details', 'createdAt'],
    searchable: ['eventType', 'deviceId', 'ipAddress', 'details'],
    sortable: ['eventType', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  tenants: {
    model: 'tenant',
    label: 'Tenants',
    columns: ['id', 'name', 'slug', 'status', 'plan', 'contactEmail', 'createdAt'],
    searchable: ['name', 'slug', 'contactEmail'],
    sortable: ['name', 'slug', 'status', 'plan', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  subscriptions: {
    model: 'subscription',
    label: 'Subscriptions',
    columns: ['id', 'tenantId', 'plan', 'status', 'pricePerMonth', 'currency', 'deviceLimit', 'currentPeriodEnd', 'createdAt'],
    searchable: ['plan'],
    sortable: ['plan', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  invoices: {
    model: 'invoice',
    label: 'Invoices',
    columns: ['id', 'tenantId', 'subscriptionId', 'amount', 'currency', 'status', 'issuedAt', 'dueAt', 'paidAt'],
    searchable: ['id'],
    sortable: ['amount', 'status', 'issuedAt'],
    defaultSort: 'issuedAt',
    softDelete: false,
  },
  invitations: {
    model: 'invitation',
    label: 'Invitations',
    columns: ['id', 'email', 'role', 'status', 'tenantId', 'expiresAt', 'createdAt'],
    searchable: ['email'],
    sortable: ['email', 'role', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  field_reports: {
    model: 'fieldReport',
    label: 'Field Reports',
    columns: ['id', 'title', 'content', 'type', 'status', 'officerId', 'vehicleId', 'tenantId', 'createdAt'],
    searchable: ['title', 'content', 'type'],
    sortable: ['title', 'type', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  tenant_settings: {
    model: 'tenantSetting',
    label: 'Tenant Settings',
    columns: ['id', 'tenantId', 'category', 'key', 'value', 'createdAt'],
    searchable: ['category', 'key', 'value'],
    sortable: ['category', 'key', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
  tenant_features: {
    model: 'tenantFeature',
    label: 'Tenant Features',
    columns: ['id', 'tenantId', 'feature', 'enabled', 'config', 'createdAt'],
    searchable: ['feature'],
    sortable: ['feature', 'enabled', 'createdAt'],
    defaultSort: 'createdAt',
    softDelete: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /admin/db/tables — List all tables with record counts
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/db/tables', async (req, res) => {
  try {
    const prisma = db.getClient();
    const tableList = await Promise.all(
      Object.entries(TABLES).map(async ([key, cfg]) => {
        const count = await prisma[cfg.model].count();
        return { id: key, label: cfg.label, count, columns: cfg.columns.length };
      })
    );
    res.json({ success: true, data: tableList });
  } catch (error) {
    console.error('[Admin] List tables error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list tables' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /admin/db/:table — List records with pagination, search, sort
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/db/:table', async (req, res) => {
  try {
    const cfg = TABLES[req.params.table];
    if (!cfg) return res.status(404).json({ success: false, error: 'Unknown table' });

    const prisma = db.getClient();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 50));
    const search = (req.query.search || '').trim();
    const sortField = req.query.sort || cfg.defaultSort;
    const sortOrder = req.query.order === 'asc' ? 'asc' : 'desc';
    const tenantFilter = req.query.tenantId || undefined;

    // Build where clause
    const where = {};

    // Soft delete filter
    if (cfg.softDelete) {
      where.deletedAt = null;
    }

    // Tenant filter
    if (tenantFilter) {
      where.tenantId = tenantFilter;
    }

    // Search filter
    if (search && cfg.searchable.length > 0) {
      where.OR = cfg.searchable.map((field) => ({
        [field]: { contains: search, mode: 'insensitive' },
      }));
    }

    // Validate sort field
    const orderField = cfg.sortable.includes(sortField) ? sortField : cfg.defaultSort;

    const [records, total] = await Promise.all([
      prisma[cfg.model].findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [orderField]: sortOrder },
      }),
      prisma[cfg.model].count({ where }),
    ]);

    // Sanitize: mask token hashes
    const sanitized = records.map((r) => {
      const row = { ...r };
      if (row.tokenHash) row.tokenHash = row.tokenHash.slice(0, 12) + '...';
      if (row.keyHash) row.keyHash = row.keyHash.slice(0, 8) + '...';
      return row;
    });

    res.json({
      success: true,
      data: sanitized,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error(`[Admin] List ${req.params.table} error:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /admin/db/:table/:id — Get single record
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/db/:table/:id', async (req, res) => {
  try {
    const cfg = TABLES[req.params.table];
    if (!cfg) return res.status(404).json({ success: false, error: 'Unknown table' });

    const prisma = db.getClient();
    const record = await prisma[cfg.model].findUnique({
      where: { id: req.params.id },
    });

    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    // Sanitize sensitive fields
    const row = { ...record };
    if (row.tokenHash) row.tokenHash = row.tokenHash.slice(0, 12) + '...';
    if (row.keyHash) row.keyHash = row.keyHash.slice(0, 8) + '...';

    res.json({ success: true, data: row });
  } catch (error) {
    console.error(`[Admin] Get ${req.params.table}/${req.params.id} error:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /admin/db/:table/:id — Update record
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/db/:table/:id', async (req, res) => {
  try {
    const cfg = TABLES[req.params.table];
    if (!cfg) return res.status(404).json({ success: false, error: 'Unknown table' });

    const prisma = db.getClient();
    const { id, createdAt, updatedAt, ...updateData } = req.body;

    // Prevent overwriting protected fields
    delete updateData.id;
    delete updateData.createdAt;

    const record = await prisma[cfg.model].update({
      where: { id: req.params.id },
      data: updateData,
    });

    // Audit log
    await db.createAuditLog({
      tenantId: req.user.tenantId || 'system',
      userId: req.user.id,
      action: 'ADMIN_UPDATE',
      resource: cfg.model,
      resourceId: record.id,
      details: { table: req.params.table, updatedFields: Object.keys(updateData) },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: record });
  } catch (error) {
    console.error(`[Admin] Update ${req.params.table}/${req.params.id} error:`, error.message);
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /admin/db/:table/:id — Delete record (hard or soft)
// ═══════════════════════════════════════════════════════════════════════════════

router.delete('/db/:table/:id', async (req, res) => {
  try {
    const cfg = TABLES[req.params.table];
    if (!cfg) return res.status(404).json({ success: false, error: 'Unknown table' });

    const prisma = db.getClient();

    if (cfg.softDelete) {
      await prisma[cfg.model].update({
        where: { id: req.params.id },
        data: { deletedAt: new Date() },
      });
    } else {
      await prisma[cfg.model].delete({
        where: { id: req.params.id },
      });
    }

    // Audit log
    await db.createAuditLog({
      tenantId: req.user.tenantId || 'system',
      userId: req.user.id,
      action: 'ADMIN_DELETE',
      resource: cfg.model,
      resourceId: req.params.id,
      details: { table: req.params.table, softDelete: cfg.softDelete },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Record deleted' });
  } catch (error) {
    console.error(`[Admin] Delete ${req.params.table}/${req.params.id} error:`, error.message);
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /admin/db/:table — Create record
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/db/:table', async (req, res) => {
  try {
    const cfg = TABLES[req.params.table];
    if (!cfg) return res.status(404).json({ success: false, error: 'Unknown table' });

    const prisma = db.getClient();
    const record = await prisma[cfg.model].create({
      data: req.body,
    });

    // Audit log
    await db.createAuditLog({
      tenantId: req.user.tenantId || 'system',
      userId: req.user.id,
      action: 'ADMIN_CREATE',
      resource: cfg.model,
      resourceId: record.id,
      details: { table: req.params.table },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    console.error(`[Admin] Create ${req.params.table} error:`, error.message);
    if (error.code === 'P2002') {
      const target = error.meta?.target?.join(', ') || 'unique field';
      return res.status(409).json({ success: false, error: `Duplicate: ${target} already exists` });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
