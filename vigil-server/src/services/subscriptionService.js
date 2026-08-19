/**
 * Subscription Service — Lifecycle Management
 * 
 * Handles subscription creation, upgrades, downgrades, cancellations,
 * trial management, and renewal processing.
 */

import { db } from './databaseService.js';
import { redisClient } from '../cache/redisClient.js';
import { generateInvoice } from './invoiceService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const PLANS = {
  TRIAL: {
    name: 'Trial',
    pricePerMonth: 0,
    currency: 'IDR',
    durationDays: 30,
    maxDevices: 5,
    maxUsers: 3,
    maxApiCalls: 10000,
    features: ['basic_tracking'],
    canUpgrade: true,
    requiresPayment: false,
  },
  STARTER: {
    name: 'Starter',
    pricePerMonth: 5000000,
    currency: 'IDR',
    durationDays: 30,
    maxDevices: 10,
    maxUsers: 5,
    maxApiCalls: 100000,
    features: ['vehicles:read', 'geofence', 'deviation_alerts'],
    canUpgrade: true,
    requiresPayment: true,
  },
  PROFESSIONAL: {
    name: 'Professional',
    pricePerMonth: 18000000,
    currency: 'IDR',
    durationDays: 30,
    maxDevices: 30,
    maxUsers: 20,
    maxApiCalls: 1000000,
    features: ['geofence', 'deviation_alerts', 'ai_reports', 'api_access'],
    canUpgrade: true,
    requiresPayment: true,
  },
  ENTERPRISE: {
    name: 'Enterprise',
    pricePerMonth: 45000000,
    currency: 'IDR',
    durationDays: 30,
    maxDevices: 100,
    maxUsers: 50,
    maxApiCalls: 10000000,
    features: ['geofence', 'deviation_alerts', 'api_access', 'webhooks', 'ai_reports', 'priority_support'],
    canUpgrade: false,
    requiresPayment: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRIAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create trial subscription for new tenant
 * Called automatically during tenant provisioning (PRD §3.1.2)
 */
export async function createTrialSubscription(tenantId) {
  try {
    const plan = PLANS.TRIAL;
    const now = new Date();
    const trialEnd = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    // Create subscription
    const subscription = await db.createSubscription({
      tenantId,
      plan: 'TRIAL',
      status: 'TRIAL',
      trialEnd,
      pricePerMonth: 0,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
    });

    // Log subscription creation
    await db.createAuditLog({
      tenantId,
      action: 'SUBSCRIPTION_CREATED',
      resource: 'subscription',
      resourceId: subscription.id,
      details: {
        plan: 'TRIAL',
        trialEnd: trialEnd.toISOString(),
      },
    });

    return {
      success: true,
      data: subscription,
    };
  } catch (error) {
    console.error('Create trial subscription error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check and handle trial expiry
 * Run daily at 00:00:00
 */
export async function handleTrialExpiry() {
  try {
    console.log('[SubscriptionService] Checking trial expiries...');

    const now = new Date();

    // Find trials expiring today
    const expiringTrials = await db.prisma.subscription.findMany({
      where: {
        status: 'TRIAL',
        trialEnd: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        },
      },
    });

    for (const sub of expiringTrials) {
      // Send reminder notification (3 days before, handled by reminder job)
      console.log(`[SubscriptionService] Trial expiring for tenant ${sub.tenantId}`);
    }

    // Find expired trials
    const expiredTrials = await db.prisma.subscription.findMany({
      where: {
        status: 'TRIAL',
        trialEnd: {
          lt: now,
        },
      },
    });

    for (const sub of expiredTrials) {
      // Update subscription status
      await db.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'EXPIRED' },
      });

      // Disable tenant features
      await db.prisma.tenant.update({
        where: { id: sub.tenantId },
        data: { status: 'SUSPENDED' },
      });

      // Log trial expiry
      await db.createAuditLog({
        tenantId: sub.tenantId,
        action: 'TRIAL_EXPIRED',
        resource: 'subscription',
        resourceId: sub.id,
        details: {
          expiredAt: now.toISOString(),
        },
      });
    }

    console.log(`[SubscriptionService] Processed ${expiredTrials.length} expired trials.`);
    return { expiring: expiringTrials.length, expired: expiredTrials.length };
  } catch (error) {
    console.error('[SubscriptionService] Handle trial expiry error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upgrade subscription to a higher plan
 */
export async function upgradeSubscription(tenantId, newPlan) {
  try {
    const planConfig = PLANS[newPlan];
    if (!planConfig) {
      throw new Error('Invalid plan');
    }

    // Get current subscription
    const currentSub = await db.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!currentSub) {
      throw new Error('No active subscription found');
    }

    // Check if upgrade is valid
    const planOrder = ['TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
    const currentIndex = planOrder.indexOf(currentSub.plan);
    const newIndex = planOrder.indexOf(newPlan);

    if (newIndex <= currentIndex) {
      throw new Error('Can only upgrade to a higher plan');
    }

    // Calculate prorated amount
    const now = new Date();
    const daysRemaining = Math.ceil(
      (new Date(currentSub.currentPeriodEnd) - now) / (1000 * 60 * 60 * 24)
    );
    const daysInMonth = 30;
    const proratedAmount = Math.round(
      (planConfig.pricePerMonth * daysRemaining) / daysInMonth
    );

    // Create upgrade invoice
    const invoice = await generateInvoice({
      tenantId,
      subscriptionId: currentSub.id,
      periodStart: now,
      periodEnd: currentSub.currentPeriodEnd,
    });

    // Update subscription
    const updatedSub = await db.prisma.subscription.update({
      where: { id: currentSub.id },
      data: {
        plan: newPlan,
        pricePerMonth: planConfig.pricePerMonth,
        status: 'PENDING_UPGRADE',
      },
    });

    // Log upgrade
    await db.createAuditLog({
      tenantId,
      action: 'SUBSCRIPTION_UPGRADE',
      resource: 'subscription',
      resourceId: currentSub.id,
      details: {
        from: currentSub.plan,
        to: newPlan,
        proratedAmount,
        invoiceId: invoice.data?.id,
      },
    });

    return {
      success: true,
      data: {
        subscription: updatedSub,
        invoice: invoice.data,
        proratedAmount,
      },
    };
  } catch (error) {
    console.error('Upgrade subscription error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Downgrade subscription to a lower plan
 */
export async function downgradeSubscription(tenantId, newPlan) {
  try {
    const planConfig = PLANS[newPlan];
    if (!planConfig) {
      throw new Error('Invalid plan');
    }

    // Get current subscription
    const currentSub = await db.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!currentSub) {
      throw new Error('No active subscription found');
    }

    // Check if downgrade is valid
    const planOrder = ['TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
    const currentIndex = planOrder.indexOf(currentSub.plan);
    const newIndex = planOrder.indexOf(newPlan);

    if (newIndex >= currentIndex) {
      throw new Error('Can only downgrade to a lower plan');
    }

    // Check if current usage exceeds new plan limits
    const currentUsage = await checkUsageLimits(tenantId);
    const newLimits = {
      maxDevices: planConfig.maxDevices,
      maxUsers: planConfig.maxUsers,
      maxApiCalls: planConfig.maxApiCalls,
    };

    if (currentUsage.devices > newLimits.maxDevices) {
      throw new Error(`Current device count (${currentUsage.devices}) exceeds new plan limit (${newLimits.maxDevices})`);
    }

    if (currentUsage.users > newLimits.maxUsers) {
      throw new Error(`Current user count (${currentUsage.users}) exceeds new plan limit (${newLimits.maxUsers})`);
    }

    // Update subscription (effective at end of current period)
    const updatedSub = await db.prisma.subscription.update({
      where: { id: currentSub.id },
      data: {
        plan: newPlan,
        pricePerMonth: planConfig.pricePerMonth,
        status: 'PENDING_DOWNGRADE',
      },
    });

    // Log downgrade
    await db.createAuditLog({
      tenantId,
      action: 'SUBSCRIPTION_DOWNGRADE',
      resource: 'subscription',
      resourceId: currentSub.id,
      details: {
        from: currentSub.plan,
        to: newPlan,
        effectiveAt: currentSub.currentPeriodEnd,
      },
    });

    return {
      success: true,
      data: {
        subscription: updatedSub,
        effectiveAt: currentSub.currentPeriodEnd,
      },
    };
  } catch (error) {
    console.error('Downgrade subscription error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(tenantId, reason = 'user_request') {
  try {
    // Get current subscription
    const currentSub = await db.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!currentSub) {
      throw new Error('No active subscription found');
    }

    // Update subscription
    const updatedSub = await db.prisma.subscription.update({
      where: { id: currentSub.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    // Update tenant status
    await db.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        suspendReason: reason,
      },
    });

    // Log cancellation
    await db.createAuditLog({
      tenantId,
      action: 'SUBSCRIPTION_CANCELLED',
      resource: 'subscription',
      resourceId: currentSub.id,
      details: {
        reason,
        cancelledAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      data: updatedSub,
    };
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENEWAL PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process subscription renewals
 * Run daily at 00:00:00
 */
export async function processRenewals() {
  try {
    console.log('[SubscriptionService] Processing renewals...');

    const now = new Date();

    // Find subscriptions needing renewal
    const subscriptions = await db.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: {
          lte: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        },
      },
    });

    const results = [];

    for (const sub of subscriptions) {
      try {
        // Check if downgrade is pending
        if (sub.status === 'PENDING_DOWNGRADE') {
          await db.prisma.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'ACTIVE',
              currentPeriodStart: now,
              currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            },
          });
          results.push({ tenantId: sub.tenantId, renewed: true, planChanged: true });
          continue;
        }

        // Generate renewal invoice
        const newPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const invoice = await generateInvoice({
          tenantId: sub.tenantId,
          subscriptionId: sub.id,
          periodStart: now,
          periodEnd: newPeriodEnd,
        });

        // Update subscription period
        await db.prisma.subscription.update({
          where: { id: sub.id },
          data: {
            currentPeriodStart: now,
            currentPeriodEnd: newPeriodEnd,
          },
        });

        results.push({
          tenantId: sub.tenantId,
          renewed: true,
          invoiceId: invoice.data?.id,
        });
      } catch (error) {
        console.error(`[SubscriptionService] Renewal failed for ${sub.tenantId}:`, error);
        results.push({
          tenantId: sub.tenantId,
          renewed: false,
          error: error.message,
        });
      }
    }

    console.log(`[SubscriptionService] Processed ${results.length} renewals.`);
    return results;
  } catch (error) {
    console.error('[SubscriptionService] Process renewals error:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE LIMITS CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if tenant is within usage limits
 */
export async function checkUsageLimits(tenantId) {
  try {
    // Get current subscription
    const subscription = await db.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return { withinLimits: false, reason: 'No active subscription' };
    }

    const plan = PLANS[subscription.plan] || PLANS.TRIAL;

    // Check device count
    const deviceCount = await db.prisma.deviceToken.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    // Check user count
    const userCount = await db.prisma.user.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    // Check API calls (from Redis)
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const apiCallsStr = await redisClient.get(`usage:${tenantId}:api_calls:${period}`);
    const apiCalls = apiCallsStr ? parseInt(apiCallsStr, 10) : 0;

    const withinLimits =
      deviceCount <= plan.maxDevices &&
      userCount <= plan.maxUsers &&
      apiCalls <= plan.maxApiCalls;

    return {
      withinLimits,
      current: { devices: deviceCount, users: userCount, apiCalls },
      limits: {
        devices: plan.maxDevices,
        users: plan.maxUsers,
        apiCalls: plan.maxApiCalls,
      },
      plan: subscription.plan,
    };
  } catch (error) {
    console.error('Check usage limits error:', error);
    return { withinLimits: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  PLANS,
  createTrialSubscription,
  handleTrialExpiry,
  upgradeSubscription,
  downgradeSubscription,
  cancelSubscription,
  processRenewals,
  checkUsageLimits,
};
