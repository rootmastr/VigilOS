/**
 * Tenant Feature Service — PRD §7
 *
 * Manages feature flags per tenant: toggle, config, limits, availability by plan.
 * Integrates with subscription plan features for automatic feature gating.
 */

import { db } from './databaseService.js';
import { redisClient } from '../cache/redisClient.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE DEFINITIONS BY PLAN (PRD §7.1)
// ═══════════════════════════════════════════════════════════════════════════════

const PLAN_FEATURES = {
  TRIAL: ['vehicles:read'],
  STARTER: ['vehicles:read', 'vehicles:write', 'geofence', 'deviation_alerts'],
  PROFESSIONAL: ['vehicles:read', 'vehicles:write', 'geofence', 'deviation_alerts', 'ai_reports', 'api_access'],
  ENTERPRISE: ['vehicles:read', 'vehicles:write', 'geofence', 'deviation_alerts', 'ai_reports', 'api_access', 'webhooks', 'priority_support', 'custom_branding', 'advanced_analytics'],
};

const FEATURE_CONFIG = {
  geofence: {
    max_geofences: { TRIAL: 0, STARTER: 5, PROFESSIONAL: 20, ENTERPRISE: 100 },
    allow_import: { TRIAL: false, STARTER: false, PROFESSIONAL: true, ENTERPRISE: true },
  },
  api_access: {
    rate_limit: { TRIAL: 0, STARTER: 0, PROFESSIONAL: 1000, ENTERPRISE: 10000 },
    endpoints: { TRIAL: [], STARTER: [], PROFESSIONAL: ['vehicles', 'incidents', 'telemetry'], ENTERPRISE: ['*'] },
  },
  webhooks: {
    max_webhooks: { TRIAL: 0, STARTER: 0, PROFESSIONAL: 0, ENTERPRISE: 10 },
    retry_policy: { TRIAL: null, STARTER: null, PROFESSIONAL: null, ENTERPRISE: { maxRetries: 3, backoffMs: 1000 } },
  },
  ai_reports: {
    max_reports_per_day: { TRIAL: 0, STARTER: 0, PROFESSIONAL: 10, ENTERPRISE: 100 },
    export_formats: { TRIAL: [], STARTER: [], PROFESSIONAL: ['pdf', 'csv'], ENTERPRISE: ['pdf', 'csv', 'xlsx'] },
  },
};

const ALL_FEATURES = [
  'vehicles:read', 'vehicles:write', 'geofence', 'deviation_alerts',
  'ai_reports', 'api_access', 'webhooks', 'priority_support',
  'custom_branding', 'advanced_analytics',
];

const CACHE_PREFIX = 'tenant:features:';
const CACHE_TTL = 300;

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function getCachedFeatures(tenantId) {
  const raw = await redisClient.get(`${CACHE_PREFIX}${tenantId}`);
  if (raw) {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

async function setCachedFeatures(tenantId, data) {
  await redisClient.setex(`${CACHE_PREFIX}${tenantId}`, CACHE_TTL, JSON.stringify(data));
}

async function invalidateFeaturesCache(tenantId) {
  await redisClient.del(`${CACHE_PREFIX}${tenantId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all features for a tenant with their status
 */
export async function getAllFeatures(tenantId) {
  const cached = await getCachedFeatures(tenantId);
  if (cached) return cached;

  // Get tenant's plan
  const subscription = await db.prisma.subscription.findFirst({
    where: { tenantId, status: { in: ['ACTIVE', 'TRIAL'] } },
    orderBy: { createdAt: 'desc' },
  });

  const plan = subscription?.plan || 'TRIAL';
  const planFeatures = PLAN_FEATURES[plan] || PLAN_FEATURES.TRIAL;

  // Get tenant's feature overrides
  const tenantFeatures = await db.prisma.tenantFeature.findMany({
    where: { tenantId },
  });

  const featureMap = {};
  for (const tf of tenantFeatures) {
    featureMap[tf.feature] = tf;
  }

  // Build feature list
  const features = ALL_FEATURES.map(feature => {
    const allowedByPlan = planFeatures.includes(feature);
    const tenantOverride = featureMap[feature];

    return {
      feature,
      enabled: tenantOverride ? tenantOverride.enabled : allowedByPlan,
      config: tenantOverride?.config || {},
      limit: tenantOverride?.limit || null,
      expiresAt: tenantOverride?.expiresAt || null,
      availableByPlan: allowedByPlan,
      planConfig: FEATURE_CONFIG[feature] || null,
    };
  });

  const result = { plan, features };
  await setCachedFeatures(tenantId, result);
  return result;
}

/**
 * Get a single feature
 */
export async function getFeature(tenantId, feature) {
  const allFeatures = await getAllFeatures(tenantId);
  return allFeatures.features.find(f => f.feature === feature) || null;
}

/**
 * Toggle feature on/off (Super Admin only)
 */
export async function toggleFeature(tenantId, feature, enabled, userId, meta = {}) {
  const tenantFeature = await db.prisma.tenantFeature.upsert({
    where: { tenantId_feature: { tenantId, feature } },
    update: { enabled },
    create: { tenantId, feature, enabled },
  });

  // Audit log
  await db.prisma.tenantAuditLog.create({
    data: {
      tenantId,
      userId: userId || null,
      action: enabled ? 'feature:enabled' : 'feature:disabled',
      category: 'features',
      settingKey: feature,
      oldValue: { enabled: !enabled },
      newValue: { enabled },
      ipAddress: meta.ipAddress || null,
      userAgent: meta.userAgent || null,
    },
  });

  await invalidateFeaturesCache(tenantId);
  return tenantFeature;
}

/**
 * Update feature config (Super Admin only)
 */
export async function updateFeatureConfig(tenantId, feature, config, userId, meta = {}) {
  const tenantFeature = await db.prisma.tenantFeature.upsert({
    where: { tenantId_feature: { tenantId, feature } },
    update: { config },
    create: { tenantId, feature, config },
  });

  // Audit log
  await db.prisma.tenantAuditLog.create({
    data: {
      tenantId,
      userId: userId || null,
      action: 'feature:config_updated',
      category: 'features',
      settingKey: feature,
      oldValue: null,
      newValue: config,
      ipAddress: meta.ipAddress || null,
      userAgent: meta.userAgent || null,
    },
  });

  await invalidateFeaturesCache(tenantId);
  return tenantFeature;
}

/**
 * Check if a feature is enabled (for system/middleware use)
 */
export async function isFeatureEnabled(tenantId, feature) {
  const featureData = await getFeature(tenantId, feature);
  if (!featureData) return false;

  // Check expiration
  if (featureData.expiresAt && new Date(featureData.expiresAt) <= new Date()) {
    return false;
  }

  return featureData.enabled;
}

/**
 * Get available features by plan (public, no auth needed)
 */
export function getAvailableFeaturesByPlan(plan) {
  const planFeatures = PLAN_FEATURES[plan] || PLAN_FEATURES.TRIAL;
  return ALL_FEATURES.map(feature => ({
    feature,
    available: planFeatures.includes(feature),
    config: FEATURE_CONFIG[feature] || null,
  }));
}

/**
 * Get feature config value for a tenant
 */
export async function getFeatureConfigValue(tenantId, feature, configKey) {
  const featureData = await getFeature(tenantId, feature);
  if (!featureData || !featureData.enabled) return null;

  return featureData.config?.[configKey] ?? null;
}

/**
 * Seed default features for a new tenant based on plan
 */
export async function seedFeaturesForPlan(tenantId, plan) {
  const planFeatures = PLAN_FEATURES[plan] || PLAN_FEATURES.TRIAL;
  const created = [];

  for (const feature of ALL_FEATURES) {
    const enabled = planFeatures.includes(feature);
    const setting = await db.prisma.tenantFeature.upsert({
      where: { tenantId_feature: { tenantId, feature } },
      update: { enabled },
      create: { tenantId, feature, enabled },
    });
    created.push(setting);
  }

  return created.length;
}

export default {
  PLAN_FEATURES,
  FEATURE_CONFIG,
  ALL_FEATURES,
  getAllFeatures,
  getFeature,
  toggleFeature,
  updateFeatureConfig,
  isFeatureEnabled,
  getAvailableFeaturesByPlan,
  getFeatureConfigValue,
  seedFeaturesForPlan,
};
