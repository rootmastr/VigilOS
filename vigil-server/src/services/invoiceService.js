/**
 * Invoice Service — Auto-Generation & Management
 * 
 * Handles automatic invoice generation, payment reminders, and invoice lifecycle.
 * Runs as scheduled jobs via node-cron.
 * 
 * Invoice Number Format: VGL-YYYY-MM-NNN (PRD §3.3)
 */

import { db } from './databaseService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN PRICING
// ═══════════════════════════════════════════════════════════════════════════════

const PLAN_PRICING = {
  TRIAL: {
    pricePerMonth: 0,
    currency: 'IDR',
    features: ['basic_tracking'],
    deviceLimit: 5,
  },
  STARTER: {
    pricePerMonth: 5000000,
    currency: 'IDR',
    features: ['vehicles:read', 'geofence', 'deviation_alerts'],
    deviceLimit: 10,
  },
  PROFESSIONAL: {
    pricePerMonth: 18000000,
    currency: 'IDR',
    features: ['geofence', 'deviation_alerts', 'ai_reports', 'api_access'],
    deviceLimit: 30,
  },
  ENTERPRISE: {
    pricePerMonth: 45000000,
    currency: 'IDR',
    features: ['geofence', 'deviation_alerts', 'api_access', 'webhooks', 'ai_reports', 'priority_support'],
    deviceLimit: 100,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE NUMBER GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate unique invoice number
 * Format: VGL-YYYY-MM-NNN
 */
function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  // Get count of invoices for this month to determine sequence
  const prefix = `VGL-${year}-${month}`;
  
  return async () => {
    const existingInvoices = await db.prisma.invoice.findMany({
      where: {
        invoiceNumber: {
          startsWith: prefix,
        },
      },
    });
    
    const sequence = String(existingInvoices.length + 1).padStart(3, '0');
    return `${prefix}-${sequence}`;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate invoice for a subscription
 * 
 * @param {Object} params
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.subscriptionId - Subscription ID
 * @param {Date} params.periodStart - Billing period start
 * @param {Date} params.periodEnd - Billing period end
 * @returns {Object} Created invoice
 */
export async function generateInvoice({ tenantId, subscriptionId, periodStart, periodEnd }) {
  try {
    // Get subscription
    const subscription = await db.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Get tenant
    const tenant = await db.getTenantById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Get plan pricing
    const plan = PLAN_PRICING[subscription.plan] || PLAN_PRICING.TRIAL;

    // Generate invoice number
    const getNumber = generateInvoiceNumber();
    const invoiceNumber = await getNumber();

    // Calculate amount
    const amount = subscription.pricePerMonth || plan.pricePerMonth;

    // Create line items
    const lineItems = [
      {
        description: `${subscription.plan} Plan - ${periodStart.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`,
        quantity: 1,
        unitPrice: amount,
        total: amount,
      },
    ];

    // Add overage charges if applicable
    const deviceCount = await db.prisma.deviceToken.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    if (deviceCount > plan.deviceLimit) {
      const overage = deviceCount - plan.deviceLimit;
      const overageRate = Math.round(plan.pricePerMonth * 0.01); // 1% per extra device
      const overageAmount = overage * overageRate;

      lineItems.push({
        description: `Device Overage (${overage} extra devices)`,
        quantity: overage,
        unitPrice: overageRate,
        total: overageAmount,
      });
    }

    const totalAmount = lineItems.reduce((sum, item) => sum + item.total, 0);

    // Create invoice
    const invoice = await db.createInvoice({
      tenantId,
      subscriptionId,
      amount: totalAmount,
      currency: plan.currency,
      status: 'PENDING',
      invoiceNumber,
      issuedAt: new Date(),
      dueAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
      lineItems,
    });

    // Log invoice generation
    await db.createAuditLog({
      tenantId,
      action: 'INVOICE_GENERATED',
      resource: 'invoice',
      resourceId: invoice.id,
      details: {
        invoiceNumber,
        amount: totalAmount,
        plan: subscription.plan,
        period: `${periodStart.toISOString()} - ${periodEnd.toISOString()}`,
      },
    });

    return {
      success: true,
      data: invoice,
    };
  } catch (error) {
    console.error('Generate invoice error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-GENERATE INVOICES (CRON JOB)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate invoices for all active subscriptions
 * Run monthly on the 1st at 00:00:00
 */
export async function generateMonthlyInvoices() {
  try {
    console.log('[InvoiceService] Starting monthly invoice generation...');

    // Get all active subscriptions
    const subscriptions = await db.prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
    });

    const results = [];
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    for (const sub of subscriptions) {
      // Check if invoice already exists for this period
      const existingInvoice = await db.prisma.invoice.findFirst({
        where: {
          subscriptionId: sub.id,
          issuedAt: {
            gte: periodStart,
            lt: periodEnd,
          },
        },
      });

      if (existingInvoice) {
        console.log(`[InvoiceService] Invoice already exists for ${sub.tenantId}, skipping.`);
        continue;
      }

      const result = await generateInvoice({
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        periodStart,
        periodEnd,
      });

      results.push({
        tenantId: sub.tenantId,
        ...result,
      });
    }

    console.log(`[InvoiceService] Generated ${results.filter(r => r.success).length} invoices.`);
    return results;
  } catch (error) {
    console.error('[InvoiceService] Monthly invoice generation error:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT REMINDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send payment reminders for overdue invoices
 * Run daily at 09:00:00
 */
export async function sendPaymentReminders() {
  try {
    console.log('[InvoiceService] Sending payment reminders...');

    // Find overdue invoices (due date passed, status still PENDING)
    const overdueInvoices = await db.prisma.invoice.findMany({
      where: {
        status: 'PENDING',
        dueAt: {
          lt: new Date(),
        },
      },
      include: {
        tenant: true,
      },
    });

    const reminders = [];

    for (const invoice of overdueInvoices) {
      // Calculate days overdue
      const daysOverdue = Math.floor(
        (new Date() - new Date(invoice.dueAt)) / (1000 * 60 * 60 * 24)
      );

      // Send reminder (in production, integrate with email service)
      console.log(
        `[InvoiceService] Reminder: Invoice ${invoice.invoiceNumber} for ${invoice.tenant.name} is ${daysOverdue} days overdue.`
      );

      reminders.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        tenantId: invoice.tenantId,
        tenantName: invoice.tenant.name,
        amount: invoice.amount,
        dueDate: invoice.dueAt,
        daysOverdue,
      });
    }

    console.log(`[InvoiceService] Sent ${reminders.length} payment reminders.`);
    return reminders;
  } catch (error) {
    console.error('[InvoiceService] Payment reminder error:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE STATUS UPDATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update overdue invoices
 * Run daily at 00:00:00
 */
export async function updateOverdueInvoices() {
  try {
    console.log('[InvoiceService] Updating overdue invoices...');

    const result = await db.prisma.invoice.updateMany({
      where: {
        status: 'PENDING',
        dueAt: {
          lt: new Date(),
        },
      },
      data: {
        status: 'OVERDUE',
      },
    });

    console.log(`[InvoiceService] Updated ${result.count} invoices to OVERDUE status.`);
    return result.count;
  } catch (error) {
    console.error('[InvoiceService] Update overdue error:', error);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  generateInvoice,
  generateMonthlyInvoices,
  sendPaymentReminders,
  updateOverdueInvoices,
  PLAN_PRICING,
};
