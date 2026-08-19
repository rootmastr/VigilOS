/**
 * Usage Service — Usage Metering & Tracking
 * 
 * Tracks and records tenant usage for billing purposes.
 * Monitors: API calls, device count, storage, active users.
 * 
 * Usage records are partitioned by month for performance (PRD §3.3).
 */

import { db } from './databaseService.js';
import { redisClient } from '../cache/redisClient.js';

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const USAGE_TYPES = {
  API_CALLS: 'api_calls',
  DEVICES: 'devices',
  STORAGE: 'storage',
  USERS: 'users',
};

// ═══════════════════════════════════════════════════════════════════════════════
// KEY BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

const KEY = {
  // Current period usage counters
  usage: (tenantId, type, period) => `usage:${tenantId}:${type}:${period}`,
  
  // Usage snapshot for monitoring
  snapshot: (tenantId) => `usage:${tenantId}:snapshot`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PERIOD UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

function getPeriodTTL() {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return Math.ceil((endOfMonth - now) / 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Increment API call usage for a tenant
 * 
 * @param {string} tenantId - Tenant ID
 * @param {number} count - Number of calls (default: 1)
 */
export async function trackApiUsage(tenantId, count = 1) {
  try {
    const period = getCurrentPeriod();
    const key = KEY.usage(tenantId, USAGE_TYPES.API_CALLS, period);
    const ttl = getPeriodTTL();

    // Atomically increment
    const newCount = await redisClient.incr(key);
    if (newCount === null) {
      return { success: false, count: 0 };
    }

    // Set TTL on first increment
    if (newCount === count) {
      await redisClient.expire(key, ttl);
    }

    // Update snapshot
    await updateUsageSnapshot(tenantId, USAGE_TYPES.API_CALLS, newCount);

    return { success: true, count: newCount };
  } catch (error) {
    console.error('Track API usage error:', error);
    return { success: false, count: 0, error: error.message };
  }
}

/**
 * Track device usage (count active devices)
 */
export async function trackDeviceUsage(tenantId) {
  try {
    const period = getCurrentPeriod();
    const key = KEY.usage(tenantId, USAGE_TYPES.DEVICES, period);
    const ttl = getPeriodTTL();

    // Count active devices from database
    const deviceCount = await db.prisma.deviceToken.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    // Set current value
    await redisClient.setex(key, ttl, String(deviceCount));

    // Update snapshot
    await updateUsageSnapshot(tenantId, USAGE_TYPES.DEVICES, deviceCount);

    return { success: true, count: deviceCount };
  } catch (error) {
    console.error('Track device usage error:', error);
    return { success: false, count: 0, error: error.message };
  }
}

/**
 * Track storage usage (in bytes)
 */
export async function trackStorageUsage(tenantId, bytes) {
  try {
    const period = getCurrentPeriod();
    const key = KEY.usage(tenantId, USAGE_TYPES.STORAGE, period);
    const ttl = getPeriodTTL();

    // Increment storage usage
    const newCount = await redisClient.client?.incrby(key, bytes) || 0;
    if (newCount === 0) {
      return { success: false, bytes: 0 };
    }

    // Set TTL on first increment
    if (newCount === bytes) {
      await redisClient.expire(key, ttl);
    }

    // Update snapshot
    await updateUsageSnapshot(tenantId, USAGE_TYPES.STORAGE, newCount);

    return { success: true, bytes: newCount };
  } catch (error) {
    console.error('Track storage usage error:', error);
    return { success: false, bytes: 0, error: error.message };
  }
}

/**
 * Track active user usage
 */
export async function trackUserUsage(tenantId) {
  try {
    const period = getCurrentPeriod();
    const key = KEY.usage(tenantId, USAGE_TYPES.USERS, period);
    const ttl = getPeriodTTL();

    // Count active users from database
    const userCount = await db.prisma.user.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    // Set current value
    await redisClient.setex(key, ttl, String(userCount));

    // Update snapshot
    await updateUsageSnapshot(tenantId, USAGE_TYPES.USERS, userCount);

    return { success: true, count: userCount };
  } catch (error) {
    console.error('Track user usage error:', error);
    return { success: false, count: 0, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current period usage for a tenant
 */
export async function getCurrentUsage(tenantId) {
  try {
    const period = getCurrentPeriod();

    const [apiCalls, devices, storage, users] = await Promise.all([
      redisClient.get(KEY.usage(tenantId, USAGE_TYPES.API_CALLS, period)),
      redisClient.get(KEY.usage(tenantId, USAGE_TYPES.DEVICES, period)),
      redisClient.get(KEY.usage(tenantId, USAGE_TYPES.STORAGE, period)),
      redisClient.get(KEY.usage(tenantId, USAGE_TYPES.USERS, period)),
    ]);

    return {
      tenantId,
      period,
      apiCalls: apiCalls ? parseInt(apiCalls, 10) : 0,
      devices: devices ? parseInt(devices, 10) : 0,
      storage: storage ? parseInt(storage, 10) : 0,
      users: users ? parseInt(users, 10) : 0,
    };
  } catch (error) {
    console.error('Get current usage error:', error);
    return { tenantId, error: error.message };
  }
}

/**
 * Get usage history for a tenant
 */
export async function getUsageHistory(tenantId, months = 12) {
  try {
    const history = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const record = await db.prisma.usageRecord.findFirst({
        where: {
          tenantId,
          periodStart: {
            gte: new Date(date.getFullYear(), date.getMonth(), 1),
            lt: new Date(date.getFullYear(), date.getMonth() + 1, 1),
          },
        },
      });

      if (record) {
        history.push(record);
      }
    }

    return history;
  } catch (error) {
    console.error('Get usage history error:', error);
    return [];
  }
}

/**
 * Update usage snapshot for monitoring
 */
async function updateUsageSnapshot(tenantId, type, value) {
  try {
    const key = KEY.snapshot(tenantId);
    await redisClient.hset(key, {
      [`${type}_used`]: String(value),
      [`${type}_updated_at`]: new Date().toISOString(),
    });
    await redisClient.expire(key, getPeriodTTL());
  } catch (error) {
    // Silently fail - monitoring is non-critical
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE RECORD PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Persist current usage to database
 * Run monthly on the last day at 23:59:00
 */
export async function persistUsageRecords() {
  try {
    console.log('[UsageService] Persisting usage records...');

    const { start, end } = getPeriodDates();
    const period = getCurrentPeriod();

    // Get all active tenants
    const tenants = await db.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
    });

    const results = [];

    for (const tenant of tenants) {
      const usage = await getCurrentUsage(tenant.id);

      // Check if record already exists
      const existing = await db.prisma.usageRecord.findFirst({
        where: {
          tenantId: tenant.id,
          periodStart: start,
        },
      });

      if (existing) {
        // Update existing record
        await db.prisma.usageRecord.update({
          where: { id: existing.id },
          data: {
            deviceCount: usage.devices,
            apiCalls: BigInt(usage.apiCalls),
            storageBytes: BigInt(usage.storage),
            activeUsers: usage.users,
          },
        });
      } else {
        // Create new record
        await db.createUsageRecord({
          tenantId: tenant.id,
          periodStart: start,
          periodEnd: end,
          deviceCount: usage.devices,
          apiCalls: BigInt(usage.apiCalls),
          storageBytes: BigInt(usage.storage),
          activeUsers: usage.users,
        });
      }

      results.push({
        tenantId: tenant.id,
        period,
        persisted: true,
      });
    }

    console.log(`[UsageService] Persisted usage for ${results.length} tenants.`);
    return results;
  } catch (error) {
    console.error('[UsageService] Persist usage error:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Express middleware for API usage tracking
 */
export function usageTrackingMiddleware(req, res, next) {
  // Skip for certain routes
  const skipRoutes = ['/health', '/metrics', '/system/status'];
  if (skipRoutes.some(route => req.path.includes(route))) {
    return next();
  }

  // Get tenant ID
  const tenantId = req.tenant?.id || req.user?.tenantId;
  if (!tenantId) {
    return next();
  }

  // Track API usage asynchronously
  trackApiUsage(tenantId).catch(() => {});

  // Track usage on response finish
  res.on('finish', () => {
    if (res.statusCode < 400) {
      // Successful request - usage already tracked
    }
  });

  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  trackApiUsage,
  trackDeviceUsage,
  trackStorageUsage,
  trackUserUsage,
  getCurrentUsage,
  getUsageHistory,
  persistUsageRecords,
  usageTrackingMiddleware,
  USAGE_TYPES,
};
