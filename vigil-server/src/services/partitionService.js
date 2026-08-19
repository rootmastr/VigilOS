/**
 * Partition Service — PostgreSQL Partition Management
 * 
 * Manages RANGE partitioning for audit_logs and usage_records tables.
 * Handles partition creation, monitoring, and cleanup.
 * 
 * PRD §3.3: usage_records partitioned by month
 * PRD §3.4: audit_logs partitioned by month
 */

import { db } from './databaseService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const PARTITION_CONFIG = {
  audit_logs: {
    tableName: 'audit_logs',
    partitionBy: 'createdAt',
    retentionMonths: 24, // Keep 24 months of audit logs
  },
  usage_records: {
    tableName: 'usage_records',
    partitionBy: 'periodStart',
    retentionMonths: 36, // Keep 36 months of usage records
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PARTITION CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create partition for a specific table and month
 * 
 * @param {string} tableName - Table name (audit_logs or usage_records)
 * @param {Date} month - Month to create partition for
 * @returns {Object} Result
 */
export async function createPartition(tableName, month) {
  try {
    const config = PARTITION_CONFIG[tableName];
    if (!config) {
      throw new Error(`Invalid table: ${tableName}`);
    }

    const partitionDate = new Date(month.getFullYear(), month.getMonth(), 1);
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const partitionName = `${tableName}_${partitionDate.getFullYear()}_${String(partitionDate.getMonth() + 1).padStart(2, '0')}`;

    // Check if partition exists
    const exists = await db.prisma.$queryRaw`
      SELECT 1 FROM pg_tables WHERE tablename = ${partitionName}
    `;

    if (exists.length > 0) {
      return {
        success: true,
        partitionName,
        existed: true,
      };
    }

    // Create partition
    await db.prisma.$executeRawUnsafe(`
      CREATE TABLE ${partitionName} PARTITION OF ${config.tableName}
      FOR VALUES FROM ('${partitionDate.toISOString().split('T')[0]}')
      TO ('${nextMonth.toISOString().split('T')[0]}')
    `);

    console.log(`[PartitionService] Created partition: ${partitionName}`);

    return {
      success: true,
      partitionName,
      existed: false,
    };
  } catch (error) {
    console.error('[PartitionService] Create partition error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create partitions for current and next N months
 * 
 * @param {string} tableName - Table name
 * @param {number} monthsAhead - Number of months to create ahead
 */
export async function createFuturePartitions(tableName, monthsAhead = 3) {
  try {
    const results = [];
    const now = new Date();

    for (let i = 0; i < monthsAhead; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const result = await createPartition(tableName, month);
      results.push({ month: month.toISOString().slice(0, 7), ...result });
    }

    console.log(`[PartitionService] Created ${results.filter(r => !r.existed).length} new partitions for ${tableName}`);
    return results;
  } catch (error) {
    console.error('[PartitionService] Create future partitions error:', error);
    return [];
  }
}

/**
 * Create all partitions for current and next 3 months
 */
export async function createAllPartitions() {
  try {
    console.log('[PartitionService] Creating all partitions...');

    const results = await Promise.all([
      createFuturePartitions('audit_logs', 3),
      createFuturePartitions('usage_records', 3),
    ]);

    return {
      audit_logs: results[0],
      usage_records: results[1],
    };
  } catch (error) {
    console.error('[PartitionService] Create all partitions error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARTITION MONITORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get list of partitions for a table
 * 
 * @param {string} tableName - Table name
 * @returns {Array} List of partitions
 */
export async function listPartitions(tableName) {
  try {
    const config = PARTITION_CONFIG[tableName];
    if (!config) {
      throw new Error(`Invalid table: ${tableName}`);
    }

    const partitions = await db.prisma.$queryRaw`
      SELECT 
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size,
        (SELECT COUNT(*) FROM pg_stats WHERE tablename = pg_tables.tablename) as column_count
      FROM pg_tables
      WHERE tablename LIKE ${tableName + '_%'}
      ORDER BY tablename
    `;

    return partitions;
  } catch (error) {
    console.error('[PartitionService] List partitions error:', error);
    return [];
  }
}

/**
 * Get partition statistics
 * 
 * @param {string} tableName - Table name
 * @returns {Object} Statistics
 */
export async function getPartitionStats(tableName) {
  try {
    const config = PARTITION_CONFIG[tableName];
    if (!config) {
      throw new Error(`Invalid table: ${tableName}`);
    }

    const partitions = await listPartitions(tableName);

    // Get row counts for each partition
    const stats = [];
    for (const partition of partitions) {
      const rowCount = await db.prisma.$queryRawUnsafe`
        SELECT COUNT(*) as count FROM ${partition.tablename}
      `;
      stats.push({
        name: partition.tablename,
        size: partition.size,
        rowCount: parseInt(rowCount[0]?.count || 0),
      });
    }

    // Get total size
    const totalSize = await db.prisma.$queryRaw`
      SELECT pg_size_pretty(pg_total_relation_size(${config.tableName})) as total_size
    `;

    return {
      tableName,
      totalSize: totalSize[0]?.total_size || '0 bytes',
      partitionCount: partitions.length,
      partitions: stats,
    };
  } catch (error) {
    console.error('[PartitionService] Get partition stats error:', error);
    return { error: error.message };
  }
}

/**
 * Get partition health status
 */
export async function getPartitionHealth() {
  try {
    const health = {};

    for (const [tableName, config] of Object.entries(PARTITION_CONFIG)) {
      const partitions = await listPartitions(tableName);

      // Check if current month partition exists
      const now = new Date();
      const currentMonth = `${tableName}_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
      const hasCurrentMonth = partitions.some(p => p.tablename === currentMonth);

      // Check if next month partition exists
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextMonthName = `${tableName}_${nextMonth.getFullYear()}_${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
      const hasNextMonth = partitions.some(p => p.tablename === nextMonthName);

      health[tableName] = {
        totalPartitions: partitions.length,
        hasCurrentMonth,
        hasNextMonth,
        status: hasCurrentMonth && hasNextMonth ? 'healthy' : 'warning',
      };
    }

    return health;
  } catch (error) {
    console.error('[PartitionService] Get partition health error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARTITION CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Drop old partitions based on retention policy
 * 
 * @param {string} tableName - Table name
 * @returns {Array} Dropped partitions
 */
export async function dropOldPartitions(tableName) {
  try {
    const config = PARTITION_CONFIG[tableName];
    if (!config) {
      throw new Error(`Invalid table: ${tableName}`);
    }

    const partitions = await listPartitions(tableName);
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - config.retentionMonths);

    const dropped = [];

    for (const partition of partitions) {
      // Extract date from partition name (e.g., audit_logs_2024_01 -> 2024-01)
      const match = partition.name.match(/_(\d{4})_(\d{2})$/);
      if (!match) continue;

      const [, year, month] = match;
      const partitionDate = new Date(parseInt(year), parseInt(month) - 1, 1);

      if (partitionDate < cutoffDate) {
        await db.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${partition.name}`);
        dropped.push(partition.name);
        console.log(`[PartitionService] Dropped old partition: ${partition.name}`);
      }
    }

    console.log(`[PartitionService] Dropped ${dropped.length} old partitions from ${tableName}`);
    return dropped;
  } catch (error) {
    console.error('[PartitionService] Drop old partitions error:', error);
    return [];
  }
}

/**
 * Drop all old partitions
 */
export async function dropAllOldPartitions() {
  try {
    console.log('[PartitionService] Dropping all old partitions...');

    const results = await Promise.all([
      dropOldPartitions('audit_logs'),
      dropOldPartitions('usage_records'),
    ]);

    return {
      audit_logs: results[0],
      usage_records: results[1],
    };
  } catch (error) {
    console.error('[PartitionService] Drop all old partitions error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAINTENANCE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run partition maintenance
 * - Create future partitions
 * - Drop old partitions
 * - Return health status
 */
export async function runMaintenance() {
  try {
    console.log('[PartitionService] Running partition maintenance...');

    // Create future partitions
    await createAllPartitions();

    // Drop old partitions
    const dropped = await dropAllOldPartitions();

    // Get health status
    const health = await getPartitionHealth();

    // Get stats
    const auditStats = await getPartitionStats('audit_logs');
    const usageStats = await getPartitionStats('usage_records');

    return {
      success: true,
      dropped,
      health,
      stats: {
        audit_logs: auditStats,
        usage_records: usageStats,
      },
    };
  } catch (error) {
    console.error('[PartitionService] Run maintenance error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Vacuum analyze partitions
 */
export async function vacuumPartitions() {
  try {
    console.log('[PartitionService] Running vacuum analyze...');

    // Vacuum main tables
    await db.prisma.$executeRawUnsafe('VACUUM ANALYZE audit_logs');
    await db.prisma.$executeRawUnsafe('VACUUM ANALYZE usage_records');

    console.log('[PartitionService] Vacuum analyze completed.');
    return { success: true };
  } catch (error) {
    console.error('[PartitionService] Vacuum error:', error);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  PARTITION_CONFIG,
  createPartition,
  createFuturePartitions,
  createAllPartitions,
  listPartitions,
  getPartitionStats,
  getPartitionHealth,
  dropOldPartitions,
  dropAllOldPartitions,
  runMaintenance,
  vacuumPartitions,
};
