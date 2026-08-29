/**
 * System Routes — Partition Management, Data Retention & Cron Status
 * 
 * Admin-only endpoints for monitoring and managing database partitions and data retention.
 */

import express from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import partitionService from '../../services/partitionService.js';
import dataRetentionService from '../../services/dataRetentionService.js';
import cronService from '../../cron/index.js';
import { unblockIP, flushAllDdosBlocks } from '../../security/securityMiddleware.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// PARTITION MANAGEMENT (Super Admin Only)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /system/partitions
 * Get partition health and statistics
 */
router.get('/partitions', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const health = await partitionService.getPartitionHealth();
    const auditStats = await partitionService.getPartitionStats('audit_logs');
    const usageStats = await partitionService.getPartitionStats('usage_records');

    res.json({
      success: true,
      data: {
        health,
        stats: {
          audit_logs: auditStats,
          usage_records: usageStats,
        },
      },
    });
  } catch (error) {
    console.error('Get partitions error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /system/partitions/:table
 * Get partitions for a specific table
 */
router.get('/partitions/:table', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { table } = req.params;

    if (!['audit_logs', 'usage_records'].includes(table)) {
      return res.status(400).json({ success: false, error: 'Invalid table name' });
    }

    const partitions = await partitionService.listPartitions(table);
    const stats = await partitionService.getPartitionStats(table);

    res.json({
      success: true,
      data: {
        partitions,
        stats,
      },
    });
  } catch (error) {
    console.error('Get partitions error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /system/partitions/create
 * Create partitions for current and next N months
 */
router.post('/partitions/create', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { table, monthsAhead = 3 } = req.body;

    if (table) {
      if (!['audit_logs', 'usage_records'].includes(table)) {
        return res.status(400).json({ success: false, error: 'Invalid table name' });
      }
      const result = await partitionService.createFuturePartitions(table, monthsAhead);
      return res.json({ success: true, data: result });
    }

    const result = await partitionService.createAllPartitions();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Create partitions error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /system/partitions/maintenance
 * Run partition maintenance (create future + drop old)
 */
router.post('/partitions/maintenance', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const result = await partitionService.runMaintenance();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Run maintenance error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /system/partitions/vacuum
 * Run vacuum analyze on partitioned tables
 */
router.post('/partitions/vacuum', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const result = await partitionService.vacuumPartitions();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Run vacuum error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CRON JOB STATUS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /system/cron
 * Get status of all cron jobs
 */
router.get('/cron', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const status = cronService.getCronStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Get cron status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATA RETENTION (PRD §3.4)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /system/retention
 * Get data retention report
 */
router.get('/retention', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const report = await dataRetentionService.getRetentionReport();
    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Get retention report error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /system/retention/pending-deletions
 * Get tenants pending hard deletion
 */
router.get('/retention/pending-deletions', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenants = await dataRetentionService.findTenantsForDeletion();
    res.json({
      success: true,
      count: tenants.length,
      data: tenants,
    });
  } catch (error) {
    console.error('Get pending deletions error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /system/retention/process-deletions
 * Manually trigger cancelled tenant deletion
 */
router.post('/retention/process-deletions', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const result = await dataRetentionService.processCancelledTenantDeletion();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Process deletions error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /system/retention/cleanup-soft-delete
 * Manually trigger soft-deleted records cleanup
 */
router.post('/retention/cleanup-soft-delete', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { retentionDays = 90 } = req.body;
    const result = await dataRetentionService.cleanupSoftDeletedRecords(retentionDays);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Cleanup soft delete error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * DELETE /system/retention/tenant/:tenantId
 * Hard delete a specific tenant (immediate)
 */
router.delete('/retention/tenant/:tenantId', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const result = await dataRetentionService.hardDeleteTenant(tenantId);
    
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Hard delete tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /system/health
 * System health check
 */
router.get('/health', async (req, res) => {
  try {
    const partitionHealth = await partitionService.getPartitionHealth();
    const cronStatus = cronService.getCronStatus();

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        partitions: partitionHealth,
        cron: cronStatus,
      },
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DDoS RECOVERY (Super Admin Only)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /system/ddos/unblock — Unblock a specific IP
 */
router.post('/ddos/unblock', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ success: false, error: 'IP address required' });
    await unblockIP(ip);
    res.json({ success: true, message: `IP ${ip} unblocked` });
  } catch (error) {
    console.error('Unblock IP error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /system/ddos/flush — Flush all DDoS blocks
 */
router.post('/ddos/flush', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const result = await flushAllDdosBlocks();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Flush DDoS error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
