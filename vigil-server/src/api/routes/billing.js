/**
 * Billing & Subscription Routes — PRD §3.3
 * 
 * Handles subscription management, invoices, and payment tracking.
 */

import express from 'express';
import { db } from '../../services/databaseService.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import subscriptionService from '../../services/subscriptionService.js';
import usageService from '../../services/usageService.js';
import paymentService from '../../services/paymentService.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /billing/subscriptions
 * Get subscriptions
 */
router.get('/subscriptions', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.tenantId;
    const where = tenantId ? { tenantId } : {};

    const subscriptions = await db.prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      count: subscriptions.length,
      data: subscriptions,
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /billing/subscriptions/:id
 * Get subscription by ID
 */
router.get('/subscriptions/:id', authenticateToken, async (req, res) => {
  try {
    const subscription = await db.getSubscriptionById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== subscription.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: subscription });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /billing/subscriptions
 * Create new subscription
 */
router.post('/subscriptions', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const { plan } = req.body;
    const tenantId = req.user.role === 'SUPER_ADMIN' ? req.body.tenantId : req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant ID required' });
    }

    // Check if tenant already has active subscription
    const existingSub = await db.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
    });

    if (existingSub) {
      return res.status(400).json({ success: false, error: 'Tenant already has active subscription' });
    }

    // Create trial subscription
    const result = await subscriptionService.createTrialSubscription(tenantId);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /billing/subscriptions/:id/upgrade
 * Upgrade subscription to higher plan
 */
router.put('/subscriptions/:id/upgrade', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const { plan } = req.body;
    const subscription = await db.getSubscriptionById(req.params.id);

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== subscription.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const result = await subscriptionService.upgradeSubscription(subscription.tenantId, plan);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Upgrade subscription error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /billing/subscriptions/:id/downgrade
 * Downgrade subscription to lower plan
 */
router.put('/subscriptions/:id/downgrade', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const { plan } = req.body;
    const subscription = await db.getSubscriptionById(req.params.id);

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== subscription.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const result = await subscriptionService.downgradeSubscription(subscription.tenantId, plan);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Downgrade subscription error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /billing/subscriptions/:id/cancel
 * Cancel subscription
 */
router.put('/subscriptions/:id/cancel', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  try {
    const { reason } = req.body;
    const subscription = await db.getSubscriptionById(req.params.id);

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== subscription.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const result = await subscriptionService.cancelSubscription(subscription.tenantId, reason);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /billing/subscriptions/:id/usage-limits
 * Check usage limits for subscription
 */
router.get('/subscriptions/:id/usage-limits', authenticateToken, async (req, res) => {
  try {
    const subscription = await db.getSubscriptionById(req.params.id);

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== subscription.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const limits = await subscriptionService.checkUsageLimits(subscription.tenantId);

    res.json({ success: true, data: limits });
  } catch (error) {
    console.error('Check usage limits error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /billing/invoices
 * List invoices
 */
router.get('/invoices', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.tenantId;
    const { status, skip = 0, take = 50 } = req.query;

    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;

    const invoices = await db.listInvoices({
      skip: parseInt(skip),
      take: parseInt(take),
      where,
    });

    res.json({
      success: true,
      count: invoices.length,
      data: invoices,
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /billing/invoices/:id
 * Get invoice by ID
 */
router.get('/invoices/:id', authenticateToken, async (req, res) => {
  try {
    const invoice = await db.getInvoiceById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== invoice.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /billing/invoices/:id/pay
 * Mark invoice as paid
 */
router.post('/invoices/:id/pay', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_FINANCE'), async (req, res) => {
  const { paymentMethod } = req.body;

  try {
    const invoice = await db.getInvoiceById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== invoice.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (invoice.status === 'PAID') {
      return res.status(400).json({ success: false, error: 'Invoice already paid' });
    }

    const updated = await db.updateInvoice(req.params.id, {
      status: 'PAID',
      paidAt: new Date(),
      paymentMethod: paymentMethod || 'Virtual Account',
    });

    // Log payment
    await db.createAuditLog({
      tenantId: invoice.tenantId,
      userId: req.user.id,
      action: 'INVOICE_PAID',
      resource: 'invoice',
      resourceId: invoice.id,
      details: { amount: invoice.amount, paymentMethod },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Pay invoice error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /billing/invoices/:id/pdf
 * Generate invoice PDF
 */
router.get('/invoices/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const invoice = await db.getInvoiceById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== invoice.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Get tenant info
    const tenant = await db.getTenantById(invoice.tenantId);

    // Generate PDF content (simplified - in production use pdfkit)
    const pdfContent = `
VIGILOS INVOICE
===============
Invoice Number: ${invoice.invoiceNumber}
Date: ${invoice.issuedAt}
Due Date: ${invoice.dueAt}

Bill To:
${tenant?.name || 'N/A'}
${tenant?.address || ''}

Amount: Rp ${invoice.amount.toLocaleString('id-ID')}
Currency: ${invoice.currency}
Status: ${invoice.status}
Payment Method: ${invoice.paymentMethod || 'N/A'}

Line Items:
${invoice.lineItems.map(item => `- ${item.description}: ${item.quantity} x Rp ${item.unitPrice.toLocaleString('id-ID')} = Rp ${item.total.toLocaleString('id-ID')}`).join('\n')}

Thank you for your subscription!
    `.trim();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.send(Buffer.from(pdfContent, 'utf-8'));
  } catch (error) {
    console.error('Generate invoice PDF error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /billing/payments
 * Create payment transaction for invoice
 */
router.post('/payments', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_FINANCE'), async (req, res) => {
  try {
    const { invoiceId, paymentMethod, bank } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ success: false, error: 'Invoice ID required' });
    }

    const invoice = await db.getInvoiceById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== invoice.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (invoice.status === 'PAID') {
      return res.status(400).json({ success: false, error: 'Invoice already paid' });
    }

    // Get tenant info
    const tenant = await db.getTenantById(invoice.tenantId);

    // Create Midtrans transaction
    const paymentResult = await paymentService.createTransaction({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      currency: invoice.currency,
      tenantId: invoice.tenantId,
      tenantName: tenant?.name || 'Tenant',
      email: tenant?.contactEmail || 'billing@vigilos.com',
      phone: tenant?.contactPhone,
      paymentMethod,
      bank,
    });

    if (!paymentResult.success) {
      return res.status(400).json({ success: false, error: paymentResult.error });
    }

    // Log payment creation
    await db.createAuditLog({
      tenantId: invoice.tenantId,
      userId: req.user.id,
      action: 'PAYMENT_CREATED',
      resource: 'payment',
      resourceId: paymentResult.data.transactionId,
      details: {
        invoiceId: invoice.id,
        amount: invoice.amount,
        paymentMethod,
      },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: paymentResult.data });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /billing/payments/:transactionId/status
 * Check payment status
 */
router.get('/payments/:transactionId/status', authenticateToken, async (req, res) => {
  try {
    const statusResult = await paymentService.checkTransactionStatus(req.params.transactionId);

    if (!statusResult.success) {
      return res.status(400).json({ success: false, error: statusResult.error });
    }

    res.json({ success: true, data: statusResult.data });
  } catch (error) {
    console.error('Check payment status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /billing/webhooks/midtrans
 * Midtrans webhook handler
 */
router.post('/webhooks/midtrans', async (req, res) => {
  try {
    const signature = req.headers['x-signature'];

    // Verify webhook signature
    const isValid = paymentService.verifyWebhookSignature(req.body, signature);
    if (!isValid) {
      console.warn('Invalid Midtrans webhook signature');
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    // Process notification
    const result = await paymentService.handleNotification(req.body);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Midtrans webhook error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /billing/payments/:invoiceId/cancel
 * Cancel pending payment
 */
router.post('/payments/:invoiceId/cancel', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_FINANCE'), async (req, res) => {
  try {
    const invoice = await db.getInvoiceById(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Check access
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== invoice.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (invoice.status === 'PAID') {
      return res.status(400).json({ success: false, error: 'Cannot cancel paid invoice' });
    }

    // Cancel Midtrans transaction if exists
    if (invoice.paymentTransactionId) {
      const cancelResult = await paymentService.cancelTransaction(invoice.paymentTransactionId);
      if (!cancelResult.success) {
        console.warn('Failed to cancel Midtrans transaction:', cancelResult.error);
      }
    }

    // Update invoice status
    await db.updateInvoice(invoice.id, {
      status: 'CANCELLED',
    });

    // Log cancellation
    await db.createAuditLog({
      tenantId: invoice.tenantId,
      userId: req.user.id,
      action: 'PAYMENT_CANCELLED',
      resource: 'invoice',
      resourceId: invoice.id,
      details: { amount: invoice.amount },
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel payment error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /billing/usage
 * Get current usage for tenant
 */
router.get('/usage', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant ID required' });
    }

    const usage = await usageService.getCurrentUsage(tenantId);

    res.json({ success: true, data: usage });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /billing/usage/history
 * Get usage history for tenant
 */
router.get('/usage/history', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const months = parseInt(req.query.months) || 12;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant ID required' });
    }

    const history = await usageService.getUsageHistory(tenantId, months);

    res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error('Get usage history error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default router;
