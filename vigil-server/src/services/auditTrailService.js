/**
 * Audit Trail Service — Enhanced Audit Logging
 * 
 * Comprehensive audit trail with detailed change tracking,
 * compliance reporting, and forensic analysis capabilities.
 */

import { db } from './databaseService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const AUDIT_ACTIONS = {
  // CRUD operations
  CREATE: 'CREATE',
  READ: 'READ',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  
  // Authentication
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  MFA_SETUP: 'MFA_SETUP',
  
  // Authorization
  ROLE_ASSIGN: 'ROLE_ASSIGN',
  ROLE_REVOKE: 'ROLE_REVOKE',
  PERMISSION_GRANT: 'PERMISSION_GRANT',
  PERMISSION_REVOKE: 'PERMISSION_REVOKE',
  
  // Data operations
  DATA_EXPORT: 'DATA_EXPORT',
  DATA_IMPORT: 'DATA_IMPORT',
  DATA_BACKUP: 'DATA_BACKUP',
  
  // System operations
  CONFIG_CHANGE: 'CONFIG_CHANGE',
  SYSTEM_START: 'SYSTEM_START',
  SYSTEM_STOP: 'SYSTEM_STOP',
  
  // Billing
  SUBSCRIPTION_CHANGE: 'SUBSCRIPTION_CHANGE',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  INVOICE_GENERATED: 'INVOICE_GENERATED',
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create an audit log entry
 * 
 * @param {Object} params
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.userId - User ID
 * @param {string} params.action - Action type
 * @param {string} params.resource - Resource type
 * @param {string} params.resourceId - Resource ID
 * @param {Object} params.changes - Change details (before/after)
 * @param {Object} params.metadata - Additional metadata
 * @param {string} params.ipAddress - IP address
 * @param {string} params.userAgent - User agent
 */
export async function createAuditLog({
  tenantId,
  userId,
  action,
  resource,
  resourceId,
  changes = {},
  metadata = {},
  ipAddress,
  userAgent,
}) {
  try {
    // Build details object
    const details = {
      action,
      resource,
      resourceId,
      changes,
      metadata,
      timestamp: new Date().toISOString(),
    };

    // Create audit log entry
    const auditLog = await db.createAuditLog({
      tenantId,
      userId,
      action: `${resource}:${action}`,
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      data: auditLog,
    };
  } catch (error) {
    console.error('Create audit log error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Log a change with before/after comparison
 * 
 * @param {Object} params
 * @param {Object} params.before - State before change
 * @param {Object} params.after - State after change
 */
export async function logChange({ tenantId, userId, resource, resourceId, before, after, ipAddress }) {
  try {
    // Calculate changes
    const changes = calculateChanges(before, after);

    if (Object.keys(changes).length === 0) {
      return { success: true, skipped: true, reason: 'No changes detected' };
    }

    return createAuditLog({
      tenantId,
      userId,
      action: AUDIT_ACTIONS.UPDATE,
      resource,
      resourceId,
      changes,
      ipAddress,
    });
  } catch (error) {
    console.error('Log change error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Calculate changes between two objects
 */
function calculateChanges(before, after) {
  const changes = {};
  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const key of allKeys) {
    const oldValue = before?.[key];
    const newValue = after?.[key];

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = {
        before: oldValue,
        after: newValue,
      };
    }
  }

  return changes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get audit logs with filters
 * 
 * @param {Object} params
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.resource - Resource filter
 * @param {string} params.action - Action filter
 * @param {string} params.userId - User filter
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @param {number} params.skip - Skip count
 * @param {number} params.take - Take count
 */
export async function getAuditLogs({
  tenantId,
  resource,
  action,
  userId,
  startDate,
  endDate,
  skip = 0,
  take = 50,
}) {
  try {
    const where = { tenantId };

    if (resource) where.resource = resource;
    if (action) where.action = { contains: action };
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      db.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      db.prisma.auditLog.count({ where }),
    ]);

    return {
      success: true,
      data: {
        logs,
        total,
        skip,
        take,
      },
    };
  } catch (error) {
    console.error('Get audit logs error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get audit trail for a specific resource
 * 
 * @param {string} resource - Resource type
 * @param {string} resourceId - Resource ID
 * @param {number} limit - Limit
 */
export async function getResourceAuditTrail(resource, resourceId, limit = 100) {
  try {
    const logs = await db.prisma.auditLog.findMany({
      where: {
        resource,
        resourceId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      success: true,
      data: logs,
    };
  } catch (error) {
    console.error('Get resource audit trail error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get user activity summary
 * 
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @param {number} days - Number of days
 */
export async function getUserActivitySummary(tenantId, userId, days = 30) {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await db.prisma.auditLog.findMany({
      where: {
        tenantId,
        userId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by resource
    const byResource = {};
    const byAction = {};

    for (const log of logs) {
      byResource[log.resource] = (byResource[log.resource] || 0) + 1;

      const action = log.action.split(':')[1] || log.action;
      byAction[action] = (byAction[action] || 0) + 1;
    }

    // Get activity timeline (group by day)
    const timeline = {};
    for (const log of logs) {
      const day = log.createdAt.toISOString().split('T')[0];
      timeline[day] = (timeline[day] || 0) + 1;
    }

    return {
      success: true,
      data: {
        totalActions: logs.length,
        byResource,
        byAction,
        timeline,
        period: {
          from: since,
          to: new Date(),
        },
      },
    };
  } catch (error) {
    console.error('Get user activity summary error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate compliance report
 * 
 * @param {string} tenantId - Tenant ID
 * @param {Date} startDate - Report start date
 * @param {Date} endDate - Report end date
 */
export async function generateComplianceReport(tenantId, startDate, endDate) {
  try {
    const logs = await db.prisma.auditLog.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Statistics
    const stats = {
      totalEvents: logs.length,
      byAction: {},
      byResource: {},
      byUser: {},
    };

    for (const log of logs) {
      const action = log.action.split(':')[1] || log.action;
      stats.byAction[action] = (stats.byAction[action] || 0) + 1;
      stats.byResource[log.resource] = (stats.byResource[log.resource] || 0) + 1;
      if (log.userId) {
        stats.byUser[log.userId] = (stats.byUser[log.userId] || 0) + 1;
      }
    }

    // Security-relevant events
    const securityEvents = logs.filter(log =>
      log.action.includes('DELETE') ||
      log.action.includes('PASSWORD') ||
      log.action.includes('ROLE') ||
      log.action.includes('PERMISSION')
    );

    return {
      success: true,
      data: {
        tenantId,
        period: {
          from: startDate,
          to: endDate,
        },
        stats,
        securityEvents: securityEvents.slice(0, 100), // Limit for report
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Generate compliance report error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  AUDIT_ACTIONS,
  createAuditLog,
  logChange,
  getAuditLogs,
  getResourceAuditTrail,
  getUserActivitySummary,
  generateComplianceReport,
};
