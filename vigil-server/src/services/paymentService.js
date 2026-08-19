/**
 * Payment Service — Midtrans Integration
 * 
 * Handles payment gateway integration with Midtrans for Indonesian payment methods.
 * Supports Virtual Account, Bank Transfer, Credit Card, and E-Wallet.
 * 
 * Midtrans API Documentation: https://docs.midtrans.com/
 */

import crypto from 'crypto';
import { db } from './databaseService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MIDTRANS CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const MIDTRANS_CONFIG = {
  serverKey: process.env.MIDTRANS_SERVER_KEY || '',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
  merchantId: process.env.MIDTRANS_MERCHANT_ID || '',
  isProduction: process.env.MIDTRANS_PRODUCTION === 'true',
  baseUrl: process.env.MIDTRANS_PRODUCTION === 'true'
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com',
  callbacks: {
    finish: process.env.PAYMENT_CALLBACK_URL || 'https://app.vigilos.io/billing/payment-complete',
    notification: process.env.PAYMENT_NOTIFICATION_URL || 'https://api.vigilos.io/api/v1/billing/payment/webhook',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS
// ═══════════════════════════════════════════════════════════════════════════════

const PAYMENT_METHODS = {
  VA_BCA: { name: 'Virtual Account BCA', type: 'bank_transfer', bank: 'bca' },
  VA_MANDIRI: { name: 'Virtual Account Mandiri', type: 'bank_transfer', bank: 'mandiri' },
  VA_BRI: { name: 'Virtual Account BRI', type: 'bank_transfer', bank: 'bri' },
  VA_BNI: { name: 'Virtual Account BNI', type: 'bank_transfer', bank: 'bni' },
  VA_PERMATA: { name: 'Virtual Account Permata', type: 'bank_transfer', bank: 'permata' },
  CC: { name: 'Credit Card', type: 'credit_card' },
  GOPAY: { name: 'GoPay', type: 'gopay' },
  OVO: { name: 'OVO', type: 'ovo' },
  DANA: { name: 'DANA', type: 'dana' },
  SHOPEEPAY: { name: 'ShopeePay', type: 'shopeepay' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate Basic Auth header for Midtrans API
 */
function getAuthHeader() {
  const credentials = Buffer.from(`${MIDTRANS_CONFIG.serverKey}:`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Generate signature for Midtrans notification verification
 */
function generateSignature(orderId, statusCode, grossAmount) {
  const signatureKey = `${orderId}${statusCode}${grossAmount}${MIDTRANS_CONFIG.serverKey}`;
  return crypto.createHash('sha512').update(signatureKey).digest('hex');
}

/**
 * Make API request to Midtrans
 */
async function midtransRequest(endpoint, data) {
  const url = `${MIDTRANS_CONFIG.baseUrl}${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getAuthHeader(),
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.status_message || 'Midtrans API error');
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a payment transaction with Midtrans
 * 
 * @param {Object} params
 * @param {string} params.invoiceId - Invoice ID from database
 * @param {number} params.amount - Payment amount in IDR
 * @param {string} params.paymentMethod - Payment method code
 * @param {Object} params.customer - Customer info
 * @returns {Object} Payment response with payment URL and details
 */
export async function createPayment({ invoiceId, amount, paymentMethod, customer }) {
  try {
    // Get invoice from database
    const invoice = await db.getInvoiceById(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw new Error('Invoice already paid');
    }

    // Get tenant info for customer details
    const tenant = await db.getTenantById(invoice.tenantId);

    // Build Midtrans transaction
    const transaction = {
      transaction_details: {
        order_id: invoice.invoiceNumber,
        gross_amount: amount || invoice.amount,
      },
      customer_details: {
        first_name: customer?.name || tenant?.name || 'VigilOS Customer',
        email: customer?.email || tenant?.contactEmail || 'billing@vigilos.io',
        phone: customer?.phone || tenant?.phone || '',
      },
      item_details: (invoice.lineItems || []).map(item => ({
        id: item.description,
        price: item.unitPrice,
        quantity: item.quantity,
        name: item.description,
      })),
      callbacks: {
        finish: MIDTRANS_CONFIG.callbacks.finish,
      },
      notification: MIDTRANS_CONFIG.callbacks.notification,
    };

    // Add payment method specific configuration
    const method = PAYMENT_METHODS[paymentMethod];
    if (method) {
      if (method.type === 'bank_transfer') {
        transaction.payment_type = 'bank_transfer';
        transaction.bank_transfer = {
          bank: method.bank,
        };
      } else if (method.type === 'credit_card') {
        transaction.payment_type = 'credit_card';
        transaction.credit_card = {
          secure: true,
        };
      } else if (['gopay', 'ovo', 'dana', 'shopeepay'].includes(method.type)) {
        transaction.payment_type = method.type;
      }
    } else {
      // Default to VA BCA
      transaction.payment_type = 'bank_transfer';
      transaction.bank_transfer = {
        bank: 'bca',
      };
    }

    // Call Midtrans API
    const result = await midtransRequest('/v2/charge', transaction);

    // Update invoice with payment info
    await db.updateInvoice(invoiceId, {
      paymentMethod: method?.name || 'Virtual Account',
      paymentGateway: 'midtrans',
      paymentGatewayId: result.transaction_id,
      paymentGatewayStatus: result.transaction_status,
    });

    // Log payment creation
    await db.createAuditLog({
      tenantId: invoice.tenantId,
      action: 'PAYMENT_CREATED',
      resource: 'payment',
      resourceId: invoiceId,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        amount: amount || invoice.amount,
        paymentMethod: method?.name,
        transactionId: result.transaction_id,
      },
    });

    return {
      success: true,
      data: {
        transactionId: result.transaction_id,
        orderId: result.order_id,
        paymentType: result.payment_type,
        transactionStatus: result.transaction_status,
        // VA details
        vaNumber: result.va_numbers?.[0]?.va_number,
        bank: result.va_numbers?.[0]?.bank,
        // Payment URL for e-wallets
        paymentUrl: result.redirect_url,
        // Expiry
        expiryTime: result.expiry_time,
      },
    };
  } catch (error) {
    console.error('Create payment error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT NOTIFICATION (WEBHOOK)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle Midtrans payment notification (webhook)
 * 
 * @param {Object} notification - Midtrans notification payload
 * @returns {Object} Processing result
 */
export async function handlePaymentNotification(notification) {
  try {
    const {
      order_id,
      status_code,
      status_message,
      transaction_id,
      transaction_status,
      fraud_status,
      gross_amount,
      payment_type,
      signature_key,
    } = notification;

    // Verify signature
    const expectedSignature = generateSignature(order_id, status_code, gross_amount);
    if (signature_key !== expectedSignature) {
      throw new Error('Invalid signature');
    }

    // Find invoice by order_id (invoiceNumber)
    const invoices = await db.listInvoices({
      where: { invoiceNumber: order_id },
    });

    if (invoices.length === 0) {
      throw new Error(`Invoice not found for order: ${order_id}`);
    }

    const invoice = invoices[0];

    // Map Midtrans status to our status
    let invoiceStatus = 'PENDING';
    let paymentStatus = transaction_status;

    if (transaction_status === 'capture' || transaction_status === 'settlement') {
      if (fraud_status === 'accept') {
        invoiceStatus = 'PAID';
      } else if (fraud_status === 'challenge') {
        invoiceStatus = 'PENDING'; // Under review
      } else {
        invoiceStatus = 'CANCELLED';
      }
    } else if (transaction_status === 'deny') {
      invoiceStatus = 'CANCELLED';
    } else if (transaction_status === 'expire') {
      invoiceStatus = 'OVERDUE';
    } else if (transaction_status === 'cancel') {
      invoiceStatus = 'CANCELLED';
    }

    // Update invoice
    await db.updateInvoice(invoice.id, {
      status: invoiceStatus,
      paymentGatewayStatus: paymentStatus,
      paymentGateway: 'midtrans',
      paymentGatewayId: transaction_id,
      ...(invoiceStatus === 'PAID' && { paidAt: new Date() }),
    });

    // Log notification
    await db.createAuditLog({
      tenantId: invoice.tenantId,
      action: 'PAYMENT_NOTIFICATION',
      resource: 'payment',
      resourceId: invoice.id,
      details: {
        orderId: order_id,
        transactionId: transaction_id,
        status: transaction_status,
        fraudStatus: fraud_status,
        amount: gross_amount,
      },
    });

    return {
      success: true,
      data: {
        orderId: order_id,
        status: invoiceStatus,
        message: status_message,
      },
    };
  } catch (error) {
    console.error('Handle payment notification error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT STATUS CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check payment status from Midtrans
 * 
 * @param {string} orderId - Order ID (invoiceNumber)
 * @returns {Object} Payment status
 */
export async function checkPaymentStatus(orderId) {
  try {
    const result = await midtransRequest(`/v2/${orderId}/status`, {});

    return {
      success: true,
      data: {
        orderId: result.order_id,
        transactionId: result.transaction_id,
        transactionStatus: result.transaction_status,
        fraudStatus: result.fraud_status,
        paymentType: result.payment_type,
        grossAmount: result.gross_amount,
      },
    };
  } catch (error) {
    console.error('Check payment status error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT REFUND
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Refund a payment
 * 
 * @param {string} orderId - Order ID
 * @param {number} amount - Refund amount (partial or full)
 * @param {string} reason - Refund reason
 * @returns {Object} Refund result
 */
export async function refundPayment(orderId, amount, reason) {
  try {
    const result = await midtransRequest(`/v2/${orderId}/refund`, {
      refund: {
        reason: reason || 'Customer request',
        amount: amount,
      },
    });

    // Log refund
    const invoices = await db.listInvoices({
      where: { invoiceNumber: orderId },
    });

    if (invoices.length > 0) {
      await db.createAuditLog({
        tenantId: invoices[0].tenantId,
        action: 'PAYMENT_REFUNDED',
        resource: 'payment',
        resourceId: invoices[0].id,
        details: {
          orderId,
          amount,
          reason,
          refundId: result.refund_id,
        },
      });
    }

    return {
      success: true,
      data: {
        refundId: result.refund_id,
        status: result.status,
      },
    };
  } catch (error) {
    console.error('Refund payment error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AVAILABLE PAYMENT METHODS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get available payment methods
 */
export function getPaymentMethods() {
  return Object.entries(PAYMENT_METHODS).map(([code, method]) => ({
    code,
    name: method.name,
    type: method.type,
    enabled: true,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  createPayment,
  handlePaymentNotification,
  checkPaymentStatus,
  refundPayment,
  getPaymentMethods,
  PAYMENT_METHODS,
};
