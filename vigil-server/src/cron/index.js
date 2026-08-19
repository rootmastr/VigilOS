/**
 * Cron Jobs — Scheduled Tasks
 * 
 * Manages partition creation, cleanup, and usage persistence.
 * Uses node-cron for scheduling.
 */

import cron from 'node-cron';
import partitionService from '../services/partitionService.js';
import usageService from '../services/usageService.js';
import invoiceService from '../services/invoiceService.js';
import subscriptionService from '../services/subscriptionService.js';
import dataRetentionService from '../services/dataRetentionService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CRON SCHEDULES
// ═══════════════════════════════════════════════════════════════════════════════

const CRON_JOBS = [];

/**
 * Initialize all cron jobs
 */
export function initCronJobs() {
  console.log('[Cron] Initializing cron jobs...');

  // ═══════════════════════════════════════════════════════════════════════════════
  // PARTITION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  // Create future partitions - Weekly on Sunday at 02:00 AM
  const partitionCreateJob = cron.schedule('0 2 * * 0', async () => {
    console.log('[Cron] Running partition creation job...');
    await partitionService.createAllPartitions();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'partition-create', job: partitionCreateJob });

  // Drop old partitions - Monthly on 1st at 03:00 AM
  const partitionCleanupJob = cron.schedule('0 3 1 * *', async () => {
    console.log('[Cron] Running partition cleanup job...');
    await partitionService.dropAllOldPartitions();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'partition-cleanup', job: partitionCleanupJob });

  // Vacuum partitions - Monthly on 1st at 04:00 AM
  const vacuumJob = cron.schedule('0 4 1 * *', async () => {
    console.log('[Cron] Running vacuum job...');
    await partitionService.vacuumPartitions();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'vacuum', job: vacuumJob });

  // ═══════════════════════════════════════════════════════════════════════════════
  // USAGE & BILLING
  // ═══════════════════════════════════════════════════════════════════════════════

  // Persist usage records - Monthly on last day at 23:59
  const usagePersistJob = cron.schedule('59 23 28-31 * *', async () => {
    // Only run on last day of month
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getMonth() === now.getMonth()) return; // Not last day

    console.log('[Cron] Persisting usage records...');
    await usageService.persistUsageRecords();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'usage-persist', job: usagePersistJob });

  // Generate monthly invoices - Monthly on 1st at 00:00 AM
  const invoiceGenJob = cron.schedule('0 0 1 * *', async () => {
    console.log('[Cron] Generating monthly invoices...');
    await invoiceService.generateMonthlyInvoices();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'invoice-gen', job: invoiceGenJob });

  // Update overdue invoices - Daily at 00:00 AM
  const invoiceOverdueJob = cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Updating overdue invoices...');
    await invoiceService.updateOverdueInvoices();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'invoice-overdue', job: invoiceOverdueJob });

  // Send payment reminders - Daily at 09:00 AM
  const reminderJob = cron.schedule('0 9 * * *', async () => {
    console.log('[Cron] Sending payment reminders...');
    await invoiceService.sendPaymentReminders();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'payment-reminder', job: reminderJob });

  // Process renewals - Daily at 00:00 AM
  const renewalJob = cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Processing renewals...');
    await subscriptionService.processRenewals();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'renewal', job: renewalJob });

  // Handle trial expiry - Daily at 00:00 AM
  const trialExpiryJob = cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Handling trial expiry...');
    await subscriptionService.handleTrialExpiry();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'trial-expiry', job: trialExpiryJob });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DATA RETENTION (PRD §3.4)
  // ═══════════════════════════════════════════════════════════════════════════════

  // Hard delete cancelled tenants - Daily at 02:00 AM
  const tenantDeletionJob = cron.schedule('0 2 * * *', async () => {
    console.log('[Cron] Processing cancelled tenant deletions...');
    await dataRetentionService.processCancelledTenantDeletion();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'tenant-deletion', job: tenantDeletionJob });

  // Cleanup soft-deleted records - Daily at 02:30 AM
  const softDeleteCleanupJob = cron.schedule('30 2 * * *', async () => {
    console.log('[Cron] Cleaning up soft-deleted records...');
    await dataRetentionService.cleanupSoftDeletedRecords();
  }, { timezone: 'Asia/Jakarta' });

  CRON_JOBS.push({ name: 'soft-delete-cleanup', job: softDeleteCleanupJob });

  console.log(`[Cron] Initialized ${CRON_JOBS.length} cron jobs.`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRON STATUS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get status of all cron jobs
 */
export function getCronStatus() {
  return CRON_JOBS.map(({ name, job }) => ({
    name,
    running: job.running || false,
  }));
}

/**
 * Stop all cron jobs
 */
export function stopCronJobs() {
  CRON_JOBS.forEach(({ name, job }) => {
    job.stop();
    console.log(`[Cron] Stopped job: ${name}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  initCronJobs,
  getCronStatus,
  stopCronJobs,
};
