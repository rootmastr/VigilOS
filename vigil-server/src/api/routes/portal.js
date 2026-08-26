/**
 * Portal Routes — Tenant Self-Service Portal
 * 
 * Handles dashboard stats, team management, API keys, SLA, and audit logs.
 */

import express from 'express';
import crypto from 'crypto';
import { db } from '../../services/databaseService.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';

const router = express.Router();

/**
 * GET /portal/dashboard
 * Get tenant dashboard stats
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || req.user.tenantId) : req.user.tenantId;

    const stats = await db.getTenantStats(tenantId);

    // Get recent incidents
    const recentIncidents = await db.listIncidents({
      where: { tenantId },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    // Get recent audit logs
    const recentAuditLogs = await db.listAuditLogs({
      where: { tenantId },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        stats,
        recentIncidents,
        recentAuditLogs,
      },
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /portal/tenants
 * List all tenants (SUPER_ADMIN only)
 */
router.get('/tenants', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenants = await db.listTenants({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: tenants });
  } catch (error) {
    console.error('List portal tenants error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /portal/users
 * List users for tenant
 */
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const { role, status, skip = 0, take = 50 } = req.query;

    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (role) where.role = role;
    if (status) where.status = status;

    const users = await db.listUsers({
      skip: parseInt(skip),
      take: parseInt(take),
      where,
    });

    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /portal/users/invite
 * Invite a new user
 */
router.post('/users/invite', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const { email, role } = req.body;

  try {
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        error: 'Email and role are required',
      });
    }

    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await db.createInvitation({
      tenantId: req.user.tenantId,
      email,
      roleId: role,
      invitedById: req.user.id,
      token,
      expiresAt,
    });

    // Log invitation
    await db.createAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'USER_INVITED',
      resource: 'invitation',
      resourceId: invitation.id,
      details: { email, role },
      ipAddress: req.ip,
    });

    // TODO: Send invitation email

    res.status(201).json({ success: true, data: invitation });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /portal/invitations
 * List pending invitations
 */
router.get('/invitations', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.tenantId;
    const where = tenantId ? { tenantId } : {};

    const invitations = await db.listInvitations({ where });

    res.json({
      success: true,
      count: invitations.length,
      data: invitations,
    });
  } catch (error) {
    console.error('List invitations error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /portal/invitations/:id/revoke
 * Revoke invitation
 */
router.post('/invitations/:id/revoke', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const invitation = await db.prisma.invitation.findUnique({
      where: { id: req.params.id },
    });

    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== invitation.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updated = await db.updateInvitation(req.params.id, { status: 'REVOKED' });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Revoke invitation error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /portal/users/:id/suspend
 * Suspend user
 */
router.put('/users/:id/suspend', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updated = await db.suspendUser(req.params.id);

    // Log suspension
    await db.createAuditLog({
      tenantId: user.tenantId,
      userId: req.user.id,
      action: 'USER_SUSPENDED',
      resource: 'user',
      resourceId: user.id,
      details: { email: user.email },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { id: updated.id, email: updated.email, status: updated.status },
    });
  } catch (error) {
    console.error('Suspend user error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /portal/users/:id/activate
 * Activate user
 */
router.put('/users/:id/activate', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updated = await db.activateUser(req.params.id);

    res.json({
      success: true,
      data: { id: updated.id, email: updated.email, status: updated.status },
    });
  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /portal/api-keys
 * List API keys
 */
router.get('/api-keys', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const where = tenantId ? { tenantId } : {};

    const apiKeys = await db.listApiKeys({ where });

    // Don't expose key hashes
    const safeKeys = apiKeys.map(key => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      permissions: key.permissions,
      status: key.status,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    }));

    res.json({
      success: true,
      count: safeKeys.length,
      data: safeKeys,
    });
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /portal/api-keys
 * Create API key
 */
router.post('/api-keys', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const { name, permissions, expiresAt } = req.body;

  try {
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
      });
    }

    // Generate API key
    const rawKey = `ak_${crypto.randomBytes(20).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 12) + '...';

    const apiKey = await db.createApiKey({
      tenantId: req.user.tenantId,
      keyHash,
      prefix,
      name,
      permissions: permissions || ['vehicles:read'],
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    // Log API key creation
    await db.createAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'API_KEY_CREATED',
      resource: 'api_key',
      resourceId: apiKey.id,
      details: { name, permissions },
      ipAddress: req.ip,
    });

    // Return the raw key only once
    res.status(201).json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey, // Only shown once!
        prefix: apiKey.prefix,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt,
      },
      message: 'Save this API key securely. It will not be shown again.',
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /portal/api-keys/:id/revoke
 * Revoke API key
 */
router.post('/api-keys/:id/revoke', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const apiKey = await db.prisma.aPIKey.findUnique({
      where: { id: req.params.id },
    });

    if (!apiKey) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== apiKey.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updated = await db.updateApiKey(req.params.id, { status: 'REVOKED' });

    // Log revocation
    await db.createAuditLog({
      tenantId: apiKey.tenantId,
      userId: req.user.id,
      action: 'API_KEY_REVOKED',
      resource: 'api_key',
      resourceId: apiKey.id,
      details: { name: apiKey.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: { id: updated.id, name: updated.name, status: updated.status } });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /portal/sla
 * Get SLA documents
 */
router.get('/sla', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const where = tenantId ? { tenantId } : {};

    const documents = await db.listSlaDocuments({ where });

    res.json({
      success: true,
      count: documents.length,
      data: documents,
    });
  } catch (error) {
    console.error('Get SLA documents error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /portal/roles
 * List roles
 */
router.get('/roles', authenticateToken, async (req, res) => {
  try {
    const roles = await db.listRoles();

    res.json({
      success: true,
      count: roles.length,
      data: roles,
    });
  } catch (error) {
    console.error('List roles error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /portal/audit-logs
 * Get audit logs
 */
router.get('/audit-logs', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_AUDITOR'), async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const { action, userId, skip = 0, take = 50 } = req.query;

    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (action) where.action = action;
    if (userId) where.userId = userId;

    const logs = await db.listAuditLogs({
      skip: parseInt(skip),
      take: parseInt(take),
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /portal/quota
 * Get tenant quota status
 */
router.get('/quota', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || req.user.tenantId) : req.user.tenantId;

    const { getTenantQuotaStatus } = await import('../../cache/tenantQuotaService.js');
    const quotaStatus = await getTenantQuotaStatus(tenantId);

    res.json({
      success: true,
      data: quotaStatus,
    });
  } catch (error) {
    console.error('Get quota status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /portal/quota/alerts
 * Get quota alerts (tenants approaching limits)
 */
router.get('/quota/alerts', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const threshold = parseInt(req.query.threshold) || 80;

    const { getQuotaAlerts } = await import('../../cache/tenantQuotaService.js');
    const alerts = await getQuotaAlerts(tenantId, threshold);

    res.json({
      success: true,
      count: alerts.length,
      data: alerts,
    });
  } catch (error) {
    console.error('Get quota alerts error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
