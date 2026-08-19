/**
 * Data Retention Service — Hard Delete for Cancelled Tenants
 * 
 * Implements PRD §3.4 Data Compliance:
 * - Cancelled tenants: Hard delete after 90 days
 * - Audit logs: Retain 24 months (partitioned)
 * - Usage records: Retain 36 months (partitioned)
 * - Soft delete columns: deletedAt on users, vehicles, drivers, officers, incidents, field_reports
 */

import { db } from './databaseService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const RETENTION_CONFIG = {
  // Hard delete cancelled tenants after 90 days
  cancelledTenantRetentionDays: 90,
  
  // Tables with soft delete that need hard delete cleanup
  softDeleteTables: [
    'users',
    'vehicles',
    'drivers',
    'officers',
    'incidents',
    'field_reports',
  ],
  
  // Order matters due to foreign key constraints
  deletionOrder: [
    'device_tokens',
    'api_keys',
    'refresh_tokens',
    'invitations',
    'tenant_settings',
    'tenant_features',
    'roles',
    'usage_records',
    'invoices',
    'subscriptions',
    'field_reports',
    'incidents',
    'officers',
    'drivers',
    'vehicles',
    'users',
    'tenants',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SOFT DELETE CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hard delete soft-deleted records older than retention period
 * 
 * @param {number} retentionDays - Days to retain soft-deleted records
 * @returns {Object} Deletion results
 */
export async function cleanupSoftDeletedRecords(retentionDays = 90) {
  try {
    console.log(`[DataRetention] Cleaning up soft-deleted records older than ${retentionDays} days...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const results = {};

    for (const table of RETENTION_CONFIG.softDeleteTables) {
      try {
        const result = await db.prisma.$executeRawUnsafe(`
          DELETE FROM "${table}" 
          WHERE "deletedAt" IS NOT NULL 
          AND "deletedAt" < $1
        `, cutoffDate);

        results[table] = { deleted: result };
        console.log(`[DataRetention] Hard deleted ${result} records from ${table}`);
      } catch (error) {
        console.error(`[DataRetention] Error deleting from ${table}:`, error.message);
        results[table] = { error: error.message };
      }
    }

    return results;
  } catch (error) {
    console.error('[DataRetention] Cleanup error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANCELLED TENANT HARD DELETE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find tenants eligible for hard deletion
 * (CANCELLED status for more than retention period)
 * 
 * @returns {Array} List of tenants to delete
 */
export async function findTenantsForDeletion() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_CONFIG.cancelledTenantRetentionDays);

    const tenants = await db.prisma.tenant.findMany({
      where: {
        status: 'CANCELLED',
        deletedAt: {
          not: null,
          lt: cutoffDate,
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        deletedAt: true,
      },
    });

    return tenants;
  } catch (error) {
    console.error('[DataRetention] Find tenants for deletion error:', error);
    return [];
  }
}

/**
 * Hard delete a tenant and all related data
 * 
 * @param {string} tenantId - Tenant ID to delete
 * @returns {Object} Deletion result
 */
export async function hardDeleteTenant(tenantId) {
  try {
    console.log(`[DataRetention] Hard deleting tenant: ${tenantId}`);

    // Start transaction
    const result = await db.prisma.$transaction(async (tx) => {
      const deleted = {};

      // Delete in order (respecting foreign keys)
      for (const table of RETENTION_CONFIG.deletionOrder) {
        try {
          const count = await tx.$executeRawUnsafe(`
            DELETE FROM "${table}" WHERE "tenantId" = $1
          `, tenantId);
          deleted[table] = count;
        } catch (error) {
          // Some tables may not have tenantId column
          if (error.message.includes('column') && error.message.includes('does not exist')) {
            continue;
          }
          throw error;
        }
      }

      // Finally delete the tenant itself
      await tx.tenant.delete({
        where: { id: tenantId },
      });

      return deleted;
    });

    console.log(`[DataRetention] Successfully hard deleted tenant: ${tenantId}`);
    return { success: true, deleted: result };
  } catch (error) {
    console.error('[DataRetention] Hard delete tenant error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process all tenants eligible for hard deletion
 */
export async function processCancelledTenantDeletion() {
  try {
    console.log('[DataRetention] Processing cancelled tenant deletions...');

    const tenants = await findTenantsForDeletion();
    console.log(`[DataRetention] Found ${tenants.length} tenants eligible for deletion`);

    const results = [];

    for (const tenant of tenants) {
      const result = await hardDeleteTenant(tenant.id);
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        ...result,
      });
    }

    console.log(`[DataRetention] Processed ${results.length} tenant deletions`);
    return results;
  } catch (error) {
    console.error('[DataRetention] Process deletions error:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG RETENTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get audit log retention statistics
 */
export async function getAuditLogRetentionStats() {
  try {
    const stats = await db.prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_records,
        MIN("createdAt") as oldest_record,
        MAX("createdAt") as newest_record
      FROM "audit_logs"
    `;

    const partitions = await db.prisma.$queryRaw`
      SELECT tablename
      FROM pg_tables
      WHERE tablename LIKE 'audit_logs_%'
      ORDER BY tablename
    `;

    return {
      totalRecords: parseInt(stats[0]?.total_records || 0),
      oldestRecord: stats[0]?.oldest_record,
      newestRecord: stats[0]?.newest_record,
      partitionCount: partitions.length,
    };
  } catch (error) {
    console.error('[DataRetention] Get audit log stats error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE RECORD RETENTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get usage record retention statistics
 */
export async function getUsageRecordRetentionStats() {
  try {
    const stats = await db.prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_records,
        MIN("periodStart") as oldest_period,
        MAX("periodStart") as newest_period
      FROM "usage_records"
    `;

    const partitions = await db.prisma.$queryRaw`
      SELECT tablename
      FROM pg_tables
      WHERE tablename LIKE 'usage_records_%'
      ORDER BY tablename
    `;

    return {
      totalRecords: parseInt(stats[0]?.total_records || 0),
      oldestPeriod: stats[0]?.oldest_period,
      newestPeriod: stats[0]?.newest_period,
      partitionCount: partitions.length,
    };
  } catch (error) {
    console.error('[DataRetention] Get usage record stats error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETENTION REPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate retention report
 */
export async function getRetentionReport() {
  try {
    const [cancelledTenants, auditStats, usageStats] = await Promise.all([
      findTenantsForDeletion(),
      getAuditLogRetentionStats(),
      getUsageRecordRetentionStats(),
    ]);

    // Get soft delete counts
    const softDeleteCounts = {};
    for (const table of RETENTION_CONFIG.softDeleteTables) {
      try {
        const count = await db.prisma.$queryRawUnsafe(`
          SELECT COUNT(*) as count FROM "${table}" WHERE "deletedAt" IS NOT NULL
        `);
        softDeleteCounts[table] = parseInt(count[0]?.count || 0);
      } catch (error) {
        softDeleteCounts[table] = 'error';
      }
    }

    return {
      timestamp: new Date().toISOString(),
      config: {
        cancelledTenantRetentionDays: RETENTION_CONFIG.cancelledTenantRetentionDays,
        auditLogRetentionMonths: 24,
        usageRecordRetentionMonths: 36,
      },
      pendingDeletions: {
        cancelledTenants: cancelledTenants.length,
        tenants: cancelledTenants,
      },
      softDeleteCounts,
      auditLogs: auditStats,
      usageRecords: usageStats,
    };
  } catch (error) {
    console.error('[DataRetention] Get retention report error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  RETENTION_CONFIG,
  cleanupSoftDeletedRecords,
  findTenantsForDeletion,
  hardDeleteTenant,
  processCancelledTenantDeletion,
  getAuditLogRetentionStats,
  getUsageRecordRetentionStats,
  getRetentionReport,
};
