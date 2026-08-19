/**
 * Tenant Management Routes — PRD §2.1 & §5
 *
 * Handles tenant CRUD, settings management, feature flags, and audit trail.
 * Super Admin can manage all tenants; Tenant Admin can manage their own.
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../../services/databaseService.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import {
  getAllSettings,
  getSettingsByCategory,
  getSetting,
  updateSetting,
  bulkUpdateSettings,
  validateSettings,
  exportSettings,
  importSettings,
  resetCategoryToDefaults,
  getSettingsAuditLog,
  seedDefaultSettings,
} from '../../services/tenantSettingService.js';
import {
  getAllFeatures,
  getFeature,
  toggleFeature,
  updateFeatureConfig,
  isFeatureEnabled,
  getAvailableFeaturesByPlan,
  seedFeaturesForPlan,
} from '../../services/tenantFeatureService.js';
import subscriptionService from '../../services/subscriptionService.js';
const { PLANS, createTrialSubscription } = subscriptionService;

const router = express.Router();

// Helper: check tenant access
function assertTenantAccess(req, tenantId) {
  if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== tenantId) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
}

// Helper: extract audit metadata
function auditMeta(req) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

/**
 * GET /tenants/check — Check slug/email uniqueness (for wizard validation)
 */
router.get('/check', authenticateToken, async (req, res) => {
  try {
    const { slug, email } = req.query;
    const result = {};

    if (slug) {
      const existing = await db.getTenantBySlug(slug);
      result.slug = { available: !existing };
    }
    if (email) {
      const existing = await db.getUserByEmail(email);
      result.email = { available: !existing };
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Check uniqueness error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT CRUD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /tenants — List all tenants (Super Admin only)
 */
router.get('/', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { skip = 0, take = 50, status } = req.query;
    const where = status ? { status } : {};
    const tenants = await db.listTenants({ skip: parseInt(skip), take: parseInt(take), where });
    res.json({ success: true, count: tenants.length, data: tenants });
  } catch (error) {
    console.error('List tenants error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /tenants/stats — Platform-wide tenant statistics (Super Admin only)
 */
router.get('/stats', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const [total, active, suspended, pending] = await Promise.all([
      db.prisma.tenant.count({ where: { deletedAt: null } }),
      db.prisma.tenant.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      db.prisma.tenant.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
      db.prisma.tenant.count({ where: { deletedAt: null, status: 'PENDING' } }),
    ]);

    res.json({
      success: true,
      data: { total, active, suspended, pending },
    });
  } catch (error) {
    console.error('Get tenant stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /tenants/:id — Get tenant details with stats
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const [stats, subscription] = await Promise.all([
      db.getTenantStats(req.params.id),
      db.getSubscriptionByTenantId(req.params.id),
    ]);

    res.json({ success: true, data: { ...tenant, stats, subscription } });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Get tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /tenants — Create new tenant with auto-provisioning (Super Admin only)
 */
router.post('/', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { name, slug, region, industry, contactEmail, phone, address, planTier, activate } = req.body;
  try {
    if (!name || !slug || !contactEmail) {
      return res.status(400).json({ success: false, error: 'Name, slug, and contactEmail are required' });
    }

    const existing = await db.getTenantBySlug(slug);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Tenant slug already exists' });
    }

    const plan = planTier || 'TRIAL';

    // 1. Create tenant
    const tenant = await db.createTenant({
      name, slug, region, industry, contactEmail, phone, address,
      planTier: plan,
      status: 'PENDING',
    });

    // 2. Create subscription
    let subscription;
    if (plan === 'TRIAL') {
      subscription = await createTrialSubscription(tenant.id);
    } else {
      const planConfig = PLANS[plan];
      subscription = await db.createSubscription({
        tenantId: tenant.id,
        plan,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pricePerMonth: planConfig?.pricePerMonth || 0,
        deviceLimit: planConfig?.maxDevices || 10,
      });
    }

    // 3. Auto-provision settings & features
    const settingsCount = await seedDefaultSettings(tenant.id);
    const featuresCount = await seedFeaturesForPlan(tenant.id, plan);

    // 4. Activate tenant if requested
    const finalStatus = activate !== false ? 'ACTIVE' : 'PENDING';
    if (activate !== false) {
      await db.updateTenant(tenant.id, { status: 'ACTIVE' });
    }

    // 5. Audit log
    await db.createAuditLog({
      tenantId: tenant.id,
      userId: req.user.id,
      action: 'TENANT_CREATED',
      resource: 'tenant',
      resourceId: tenant.id,
      details: { name, slug, plan, settingsCount, featuresCount },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        tenant: { ...tenant, status: finalStatus },
        subscription: subscription.data || subscription,
        provisioning: { settingsCreated: settingsCount, featuresCreated: featuresCount },
      },
    });
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /tenants/:id — Update tenant (Super Admin or Tenant Admin)
 */
router.put('/:id', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    if (req.user.role === 'TENANT_ADMIN' && req.user.tenantId !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { name, region, contactEmail, phone, address, config } = req.body;
    const updated = await db.updateTenant(req.params.id, { name, region, contactEmail, phone, address, config });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /tenants/:id/status — Activate/Suspend/Cancel tenant (Super Admin only)
 */
router.put('/:id/status', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const { status, reason } = req.body;
    const allowedTransitions = {
      PENDING: ['ACTIVE'],
      ACTIVE: ['SUSPENDED', 'CANCELLED'],
      SUSPENDED: ['ACTIVE', 'CANCELLED'],
    };

    if (!allowedTransitions[tenant.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot transition from ${tenant.status} to ${status}`,
      });
    }

    const updateData = { status };
    if (status === 'SUSPENDED') {
      updateData.suspendedAt = new Date();
      updateData.suspendReason = reason;
    }

    const updated = await db.updateTenant(req.params.id, updateData);

    // Update subscription status
    if (status === 'SUSPENDED' || status === 'CANCELLED') {
      await db.prisma.subscription.updateMany({
        where: { tenantId: req.params.id, status: { in: ['ACTIVE', 'TRIAL'] } },
        data: { status: status === 'SUSPENDED' ? 'SUSPENDED' : 'CANCELLED' },
      });
    }

    // Audit log
    await db.createAuditLog({
      tenantId: req.params.id,
      userId: req.user.id,
      action: `TENANT_${status}`,
      resource: 'tenant',
      resourceId: req.params.id,
      details: { from: tenant.status, to: status, reason },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update tenant status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * DELETE /tenants/:id — Soft delete tenant (Super Admin only)
 */
router.delete('/:id', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    await db.prisma.tenant.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });

    await db.prisma.subscription.updateMany({
      where: { tenantId: req.params.id, status: { in: ['ACTIVE', 'TRIAL'] } },
      data: { status: 'CANCELLED' },
    });

    await db.createAuditLog({
      tenantId: req.params.id,
      userId: req.user.id,
      action: 'TENANT_DELETED',
      resource: 'tenant',
      resourceId: req.params.id,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Tenant deleted' });
  } catch (error) {
    console.error('Delete tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /tenants/:id/provision-status — Check provisioning completeness
 */
router.get('/:id/provision-status', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const [settingsCount, featuresCount, usersCount, subscription] = await Promise.all([
      db.prisma.tenantSetting.count({ where: { tenantId: req.params.id } }),
      db.prisma.tenantFeature.count({ where: { tenantId: req.params.id } }),
      db.prisma.user.count({ where: { tenantId: req.params.id } }),
      db.prisma.subscription.findFirst({ where: { tenantId: req.params.id } }),
    ]);

    const complete = settingsCount >= 28 && featuresCount >= 10 && usersCount >= 1 && !!subscription;

    res.json({
      success: true,
      data: {
        tenantId: req.params.id,
        complete,
        checks: {
          settings: { count: settingsCount, required: 28, ok: settingsCount >= 28 },
          features: { count: featuresCount, required: 10, ok: featuresCount >= 10 },
          adminUser: { count: usersCount, required: 1, ok: usersCount >= 1 },
          subscription: { exists: !!subscription, ok: !!subscription },
        },
      },
    });
  } catch (error) {
    console.error('Get provision status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /tenants/provision — Full provisioning wizard (Super Admin only)
 */
router.post('/provision', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { tenant: tenantData, subscription: subData, admin: adminData, settings: settingsOverrides, activate } = req.body;

  try {
    if (!tenantData?.name || !tenantData?.slug || !tenantData?.contactEmail) {
      return res.status(400).json({ success: false, error: 'Tenant name, slug, and contactEmail are required' });
    }
    if (!adminData?.name || !adminData?.email || !adminData?.password) {
      return res.status(400).json({ success: false, error: 'Admin name, email, and password are required' });
    }

    const existing = await db.getTenantBySlug(tenantData.slug);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Tenant slug already exists' });
    }

    const existingUser = await db.getUserByEmail(adminData.email);
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Admin email already exists' });
    }

    // 1. Create tenant
    const tenant = await db.createTenant({
      name: tenantData.name,
      slug: tenantData.slug,
      region: tenantData.region,
      industry: tenantData.industry,
      contactEmail: tenantData.contactEmail,
      phone: tenantData.phone,
      address: tenantData.address,
      planTier: subData?.plan || 'TRIAL',
      status: 'PENDING',
    });

    // 2. Create subscription
    const plan = subData?.plan || 'TRIAL';
    let subscription;
    if (plan === 'TRIAL') {
      subscription = await createTrialSubscription(tenant.id);
    } else {
      const planConfig = PLANS[plan];
      subscription = await db.createSubscription({
        tenantId: tenant.id,
        plan,
        status: 'ACTIVE',
        currentPeriodStart: new Date(subData?.startDate || Date.now()),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pricePerMonth: planConfig?.pricePerMonth || 0,
        deviceLimit: planConfig?.maxDevices || 10,
      });
    }

    // 3. Create admin user
    const passwordHash = await bcrypt.hash(adminData.password, 10);
    const adminUser = await db.createUser({
      tenantId: tenant.id,
      name: adminData.name,
      email: adminData.email,
      passwordHash,
      role: adminData.role || 'TENANT_ADMIN',
      status: 'ACTIVE',
    });

    // 4. Seed default settings
    const settingsCount = await seedDefaultSettings(tenant.id);

    // 5. Apply settings overrides
    if (settingsOverrides && typeof settingsOverrides === 'object') {
      for (const [category, updates] of Object.entries(settingsOverrides)) {
        if (typeof updates === 'object') {
          await bulkUpdateSettings(tenant.id, category, updates, adminUser.id, {
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          });
        }
      }
    }

    // 6. Seed features for plan
    const featuresCount = await seedFeaturesForPlan(tenant.id, plan);

    // 7. Activate tenant
    const finalStatus = activate !== false ? 'ACTIVE' : 'PENDING';
    if (activate !== false) {
      await db.updateTenant(tenant.id, { status: 'ACTIVE' });
    }

    // 8. Audit log
    await db.createAuditLog({
      tenantId: tenant.id,
      userId: req.user.id,
      action: 'TENANT_PROVISIONED',
      resource: 'tenant',
      resourceId: tenant.id,
      details: {
        name: tenantData.name,
        slug: tenantData.slug,
        plan,
        settingsCount,
        featuresCount,
        adminEmail: adminData.email,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        tenant: { ...tenant, status: finalStatus },
        subscription: subscription.data || subscription,
        admin: { id: adminUser.id, email: adminUser.email, role: adminUser.role },
        provisioning: {
          settingsCreated: settingsCount,
          featuresCreated: featuresCount,
        },
      },
    });
  } catch (error) {
    console.error('Provision tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS MANAGEMENT (PRD §5.1)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /tenants/:id/settings — Get all settings (grouped by category)
 */
router.get('/:id/settings', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const settings = await getAllSettings(req.params.id);
    res.json({ success: true, data: settings });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /tenants/:id/settings/:category — Get settings by category
 */
router.get('/:id/settings/:category', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const settings = await getSettingsByCategory(req.params.id, req.params.category);
    res.json({ success: true, data: settings });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Get settings by category error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /tenants/:id/settings/:category/:key — Update single setting
 */
router.put('/:id/settings/:category/:key', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'Value is required' });
    }

    const setting = await updateSetting(
      req.params.id,
      req.params.category,
      req.params.key,
      value,
      req.user.id,
      auditMeta(req)
    );

    res.json({ success: true, data: setting });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    if (error.message?.startsWith('SETTING_')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Update setting error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /tenants/:id/settings/:category — Bulk update settings in category
 */
router.put('/:id/settings/:category', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'Settings object is required' });
    }

    const result = await bulkUpdateSettings(
      req.params.id,
      req.params.category,
      settings,
      req.user.id,
      auditMeta(req)
    );

    res.json({ success: true, data: result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Bulk update settings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /tenants/:id/settings/validate — Validate settings before save
 */
router.post('/:id/settings/validate', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const result = await validateSettings(req.params.id, req.body.settings || {});
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Validate settings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /tenants/:id/settings/export — Export all settings as JSON
 */
router.get('/:id/settings/export', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const data = await exportSettings(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Export settings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /tenants/:id/settings/import — Import settings from JSON (Super Admin only)
 */
router.post('/:id/settings/import', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'Settings object is required' });
    }

    const result = await importSettings(req.params.id, settings, req.user.id, auditMeta(req));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Import settings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /tenants/:id/settings/reset — Reset category to defaults (Super Admin only)
 */
router.post('/:id/settings/reset', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ success: false, error: 'Category is required' });
    }

    const result = await resetCategoryToDefaults(req.params.id, category, req.user.id, auditMeta(req));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

/**
 * GET /tenants/:id/settings/audit — Get settings change history
 */
router.get('/:id/settings/audit', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const { skip, take, category, settingKey } = req.query;
    const auditLog = await getSettingsAuditLog(req.params.id, {
      skip: skip ? parseInt(skip) : undefined,
      take: take ? parseInt(take) : undefined,
      category,
      settingKey,
    });

    res.json({ success: true, data: auditLog });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Get settings audit error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE MANAGEMENT (PRD §5.2)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /tenants/:id/features — Get all features with status
 */
router.get('/:id/features', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const features = await getAllFeatures(req.params.id);
    res.json({ success: true, data: features });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Get features error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /tenants/:id/features/available — List available features by plan
 */
router.get('/:id/features/available', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const features = getAvailableFeaturesByPlan(tenant.planTier);
    res.json({ success: true, data: { plan: tenant.planTier, features } });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Get available features error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /tenants/:id/features/:feature — Get single feature
 */
router.get('/:id/features/:feature', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    assertTenantAccess(req, req.params.id);

    const feature = await getFeature(req.params.id, req.params.feature);
    if (!feature) return res.status(404).json({ success: false, error: 'Feature not found' });

    res.json({ success: true, data: feature });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Get feature error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /tenants/:id/features/:feature — Toggle feature on/off (Super Admin only)
 */
router.put('/:id/features/:feature', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Enabled boolean is required' });
    }

    const feature = await toggleFeature(req.params.id, req.params.feature, enabled, req.user.id, auditMeta(req));
    res.json({ success: true, data: feature });
  } catch (error) {
    console.error('Toggle feature error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /tenants/:id/features/:feature/config — Update feature config (Super Admin only)
 */
router.put('/:id/features/:feature/config', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const { config } = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ success: false, error: 'Config object is required' });
    }

    const feature = await updateFeatureConfig(req.params.id, req.params.feature, config, req.user.id, auditMeta(req));
    res.json({ success: true, data: feature });
  } catch (error) {
    console.error('Update feature config error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /tenants/:id/features/check — Check if feature is enabled (System)
 */
router.post('/:id/features/check', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const { feature } = req.body;
    if (!feature) {
      return res.status(400).json({ success: false, error: 'Feature name is required' });
    }

    const enabled = await isFeatureEnabled(req.params.id, feature);
    res.json({ success: true, data: { feature, enabled } });
  } catch (error) {
    console.error('Check feature error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
