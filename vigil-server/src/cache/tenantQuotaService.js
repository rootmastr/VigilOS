/**
 * Tenant API Quota Service — PRD §2.3
 * 
 * Implements per-tenant API quota limiting using Redis sliding window.
 * Quotas are based on subscription plan tier.
 * 
 * Key Pattern: quota:{tenant_id}:{billing_period}
 * TTL: Until end of billing period (auto-cleanup)
 */

import { redisClient } from './redisClient.js';
import { db } from '../services/databaseService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTA DEFINITIONS BY PLAN TIER
// ═══════════════════════════════════════════════════════════════════════════════

const PLAN_QUOTAS = {
  TRIAL: {
    apiCallsPerMonth: 1000,
    devices: 5,
    storageMB: 100,
    users: 2,
  },
  STARTER: {
    apiCallsPerMonth: 10000,
    devices: 10,
    storageMB: 500,
    users: 5,
  },
  PROFESSIONAL: {
    apiCallsPerMonth: 50000,
    devices: 30,
    storageMB: 2000,
    users: 20,
  },
  ENTERPRISE: {
    apiCallsPerMonth: 500000,
    devices: 100,
    storageMB: 10000,
    users: 100,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// KEY BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

const KEY = {
  // Monthly API call quota counter
  apiQuota: (tenantId, period) => `quota:${tenantId}:api:${period}`,
  
  // Monthly device usage counter
  deviceQuota: (tenantId, period) => `quota:${tenantId}:devices:${period}`,
  
  // Storage usage counter (bytes)
  storageQuota: (tenantId, period) => `quota:${tenantId}:storage:${period}`,
  
  // Active users counter
  userQuota: (tenantId, period) => `quota:${tenantId}:users:${period}`,
  
  // Quota snapshot for monitoring
  quotaSnapshot: (tenantId) => `quota:${tenantId}:snapshot`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PERIOD UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current billing period string (YYYY-MM)
 */
function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get TTL until end of current billing period (in seconds)
 */
function getPeriodTTL() {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return Math.ceil((endOfMonth - now) / 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTA CHECKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if tenant has remaining API quota
 * 
 * @param {string} tenantId - Tenant ID
 * @returns {{ allowed: boolean, used: number, limit: number, remaining: number, resetAt: Date }}
 */
export async function checkApiQuota(tenantId) {
  try {
    // Get tenant subscription
    const subscription = await db.getSubscriptionByTenantId(tenantId);
    if (!subscription) {
      return { allowed: false, used: 0, limit: 0, remaining: 0, resetAt: null, error: 'No subscription found' };
    }

    const quota = PLAN_QUOTAS[subscription.plan] || PLAN_QUOTAS.TRIAL;
    const period = getCurrentPeriod();
    const key = KEY.apiQuota(tenantId, period);

    // Get current usage from Redis
    const usedStr = await redisClient.get(key);
    const used = usedStr ? parseInt(usedStr, 10) : 0;

    const remaining = Math.max(0, quota.apiCallsPerMonth - used);
    const allowed = used < quota.apiCallsPerMonth;

    // Calculate reset time (end of month)
    const now = new Date();
    const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    return {
      allowed,
      used,
      limit: quota.apiCallsPerMonth,
      remaining,
      resetAt,
      plan: subscription.plan,
    };
  } catch (error) {
    console.error('Check API quota error:', error);
    // Fail open - allow request if quota check fails
    return { allowed: true, used: 0, limit: 0, remaining: 0, resetAt: null, error: error.message };
  }
}

/**
 * Check if tenant has remaining device quota
 */
export async function checkDeviceQuota(tenantId) {
  try {
    const subscription = await db.getSubscriptionByTenantId(tenantId);
    if (!subscription) {
      return { allowed: false, used: 0, limit: 0, remaining: 0 };
    }

    const quota = PLAN_QUOTAS[subscription.plan] || PLAN_QUOTAS.TRIAL;
    
    // Count active devices from database
    const deviceCount = await db.prisma.deviceToken.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    const remaining = Math.max(0, quota.devices - deviceCount);
    const allowed = deviceCount < quota.devices;

    return {
      allowed,
      used: deviceCount,
      limit: quota.devices,
      remaining,
      plan: subscription.plan,
    };
  } catch (error) {
    console.error('Check device quota error:', error);
    return { allowed: true, used: 0, limit: 0, remaining: 0, error: error.message };
  }
}

/**
 * Check if tenant has remaining storage quota
 */
export async function checkStorageQuota(tenantId) {
  try {
    const subscription = await db.getSubscriptionByTenantId(tenantId);
    if (!subscription) {
      return { allowed: false, used: 0, limit: 0, remaining: 0 };
    }

    const quota = PLAN_QUOTAS[subscription.plan] || PLAN_QUOTAS.TRIAL;
    const period = getCurrentPeriod();
    const key = KEY.storageQuota(tenantId, period);

    const usedStr = await redisClient.get(key);
    const usedBytes = usedStr ? parseInt(usedStr, 10) : 0;
    const usedMB = Math.round(usedBytes / (1024 * 1024));

    const remaining = Math.max(0, quota.storageMB - usedMB);
    const allowed = usedMB < quota.storageMB;

    return {
      allowed,
      used: usedMB,
      limit: quota.storageMB,
      remaining,
      unit: 'MB',
      plan: subscription.plan,
    };
  } catch (error) {
    console.error('Check storage quota error:', error);
    return { allowed: true, used: 0, limit: 0, remaining: 0, error: error.message };
  }
}

/**
 * Check if tenant has remaining user quota
 */
export async function checkUserQuota(tenantId) {
  try {
    const subscription = await db.getSubscriptionByTenantId(tenantId);
    if (!subscription) {
      return { allowed: false, used: 0, limit: 0, remaining: 0 };
    }

    const quota = PLAN_QUOTAS[subscription.plan] || PLAN_QUOTAS.TRIAL;
    
    // Count active users from database
    const userCount = await db.prisma.user.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    const remaining = Math.max(0, quota.users - userCount);
    const allowed = userCount < quota.users;

    return {
      allowed,
      used: userCount,
      limit: quota.users,
      remaining,
      plan: subscription.plan,
    };
  } catch (error) {
    console.error('Check user quota error:', error);
    return { allowed: true, used: 0, limit: 0, remaining: 0, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTA INCREMENTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Increment API call counter for tenant
 * 
 * @param {string} tenantId - Tenant ID
 * @param {number} count - Number of calls to increment (default: 1)
 * @returns {{ success: boolean, current: number }}
 */
export async function incrementApiUsage(tenantId, count = 1) {
  try {
    const period = getCurrentPeriod();
    const key = KEY.apiQuota(tenantId, period);
    const ttl = getPeriodTTL();

    // Atomically increment and set TTL
    const newCount = await redisClient.incr(key);
    if (newCount === null) {
      return { success: false, current: 0 };
    }

    // Set TTL on first increment
    if (newCount === count) {
      await redisClient.expire(key, ttl);
    }

    // Update snapshot for monitoring
    await updateQuotaSnapshot(tenantId, 'api', newCount);

    return { success: true, current: newCount };
  } catch (error) {
    console.error('Increment API usage error:', error);
    return { success: false, current: 0, error: error.message };
  }
}

/**
 * Increment storage usage counter (in bytes)
 */
export async function incrementStorageUsage(tenantId, bytes) {
  try {
    const period = getCurrentPeriod();
    const key = KEY.storageQuota(tenantId, period);
    const ttl = getPeriodTTL();

    // Use INCRBY for byte-level precision
    const newCount = await redisClient.client?.incrby(key, bytes) || 0;
    if (newCount === 0) {
      return { success: false, current: 0 };
    }

    // Set TTL on first increment
    if (newCount === bytes) {
      await redisClient.expire(key, ttl);
    }

    // Update snapshot
    await updateQuotaSnapshot(tenantId, 'storage', newCount);

    return { success: true, current: newCount };
  } catch (error) {
    console.error('Increment storage usage error:', error);
    return { success: false, current: 0, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTA MONITORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update quota snapshot for monitoring
 */
async function updateQuotaSnapshot(tenantId, type, value) {
  try {
    const key = KEY.quotaSnapshot(tenantId);
    await redisClient.hset(key, {
      [`${type}_used`]: String(value),
      [`${type}_updated_at`]: new Date().toISOString(),
    });
    // Snapshot expires at end of month
    await redisClient.expire(key, getPeriodTTL());
  } catch (error) {
    // Silently fail - monitoring is non-critical
  }
}

/**
 * Get complete quota status for tenant
 */
export async function getTenantQuotaStatus(tenantId) {
  try {
    const [apiQuota, deviceQuota, storageQuota, userQuota] = await Promise.all([
      checkApiQuota(tenantId),
      checkDeviceQuota(tenantId),
      checkStorageQuota(tenantId),
      checkUserQuota(tenantId),
    ]);

    return {
      tenantId,
      period: getCurrentPeriod(),
      api: apiQuota,
      devices: deviceQuota,
      storage: storageQuota,
      users: userQuota,
      plan: apiQuota.plan || 'UNKNOWN',
    };
  } catch (error) {
    console.error('Get tenant quota status error:', error);
    return { tenantId, error: error.message };
  }
}

/**
 * Get quota alerts (tenants approaching limits)
 */
export async function getQuotaAlerts(tenantId, threshold = 80) {
  try {
    const status = await getTenantQuotaStatus(tenantId);
    const alerts = [];

    if (status.api && (status.api.used / status.api.limit) * 100 >= threshold) {
      alerts.push({
        type: 'API_QUOTA_WARNING',
        message: `API quota at ${Math.round((status.api.used / status.api.limit) * 100)}%`,
        used: status.api.used,
        limit: status.api.limit,
      });
    }

    if (status.devices && (status.devices.used / status.devices.limit) * 100 >= threshold) {
      alerts.push({
        type: 'DEVICE_QUOTA_WARNING',
        message: `Device quota at ${Math.round((status.devices.used / status.devices.limit) * 100)}%`,
        used: status.devices.used,
        limit: status.devices.limit,
      });
    }

    if (status.storage && (status.storage.used / status.storage.limit) * 100 >= threshold) {
      alerts.push({
        type: 'STORAGE_QUOTA_WARNING',
        message: `Storage quota at ${Math.round((status.storage.used / status.storage.limit) * 100)}%`,
        used: status.storage.used,
        limit: status.storage.limit,
      });
    }

    return alerts;
  } catch (error) {
    console.error('Get quota alerts error:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTA MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Express middleware for API quota enforcement
 * 
 * Usage: router.use('/api', quotaMiddleware);
 */
export function quotaMiddleware(req, res, next) {
  // Skip quota check for certain routes
  const skipRoutes = ['/health', '/metrics', '/system/status'];
  if (skipRoutes.some(route => req.path.includes(route))) {
    return next();
  }

  // Get tenant ID from request
  const tenantId = req.tenant?.id || req.user?.tenantId;
  if (!tenantId) {
    return next(); // No tenant context, skip quota check
  }

  // Check quota asynchronously
  checkApiQuota(tenantId)
    .then(quota => {
      // Set quota headers
      res.set({
        'X-Quota-Limit': String(quota.limit),
        'X-Quota-Remaining': String(quota.remaining),
        'X-Quota-Used': String(quota.used),
        'X-Quota-Reset': quota.resetAt ? quota.resetAt.toISOString() : '',
        'X-Quota-Plan': quota.plan || '',
      });

      if (!quota.allowed) {
        return res.status(429).json({
          success: false,
          error: 'API quota exceeded',
          message: `Monthly API limit of ${quota.limit} calls reached. Upgrade your plan or wait until ${quota.resetAt?.toISOString()}.`,
          quota: {
            limit: quota.limit,
            used: quota.used,
            remaining: quota.remaining,
            resetAt: quota.resetAt,
          },
        });
      }

      // Increment usage counter
      incrementApiUsage(tenantId);

      next();
    })
    .catch(error => {
      console.error('Quota middleware error:', error);
      // Fail open - allow request if quota check fails
      next();
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  checkApiQuota,
  checkDeviceQuota,
  checkStorageQuota,
  checkUserQuota,
  incrementApiUsage,
  incrementStorageUsage,
  getTenantQuotaStatus,
  getQuotaAlerts,
  quotaMiddleware,
  PLAN_QUOTAS,
};
