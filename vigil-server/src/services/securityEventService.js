/**
 * Security Event Service — Enhanced Security Logging
 * 
 * Centralized security event logging with threat detection,
 * anomaly detection, and security dashboard.
 */

import { db } from './databaseService.js';
import { redisClient } from '../cache/redisClient.js';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const SECURITY_EVENTS = {
  // Authentication events
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  PASSWORD_CHANGED: 'password_changed',
  MFA_ENABLED: 'mfa_enabled',
  MFA_DISABLED: 'mfa_disabled',
  
  // Authorization events
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  PERMISSION_DENIED: 'permission_denied',
  ROLE_CHANGED: 'role_changed',
  
  // API Key events
  API_KEY_CREATED: 'api_key_created',
  API_KEY_ROTATED: 'api_key_rotated',
  API_KEY_REVOKED: 'api_key_revoked',
  API_KEY_USED: 'api_key_used',
  
  // Data events
  DATA_EXPORT: 'data_export',
  DATA_DELETION: 'data_deletion',
  SENSITIVE_DATA_ACCESS: 'sensitive_data_access',
  
  // Security threats
  SQL_INJECTION: 'sql_injection',
  XSS_ATTACK: 'xss_attack',
  PATH_TRAVERSAL: 'path_traversal',
  BRUTE_FORCE: 'brute_force',
  DDoS_DETECTED: 'ddos_detected',
  
  // System events
  SYSTEM_CONFIG_CHANGED: 'system_config_changed',
  USER_CREATED: 'user_created',
  USER_DELETED: 'user_deleted',
  TENANT_CREATED: 'tenant_created',
  TENANT_SUSPENDED: 'tenant_suspended',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SEVERITY LEVELS
// ═══════════════════════════════════════════════════════════════════════════════

const SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

const EVENT_SEVERITY = {
  [SECURITY_EVENTS.LOGIN_SUCCESS]: SEVERITY.LOW,
  [SECURITY_EVENTS.LOGIN_FAILED]: SEVERITY.MEDIUM,
  [SECURITY_EVENTS.LOGOUT]: SEVERITY.LOW,
  [SECURITY_EVENTS.PASSWORD_CHANGED]: SEVERITY.MEDIUM,
  [SECURITY_EVENTS.MFA_ENABLED]: SEVERITY.LOW,
  [SECURITY_EVENTS.MFA_DISABLED]: SEVERITY.MEDIUM,
  [SECURITY_EVENTS.UNAUTHORIZED_ACCESS]: SEVERITY.HIGH,
  [SECURITY_EVENTS.PERMISSION_DENIED]: SEVERITY.MEDIUM,
  [SECURITY_EVENTS.ROLE_CHANGED]: SEVERITY.HIGH,
  [SECURITY_EVENTS.API_KEY_CREATED]: SEVERITY.LOW,
  [SECURITY_EVENTS.API_KEY_ROTATED]: SEVERITY.LOW,
  [SECURITY_EVENTS.API_KEY_REVOKED]: SEVERITY.MEDIUM,
  [SECURITY_EVENTS.API_KEY_USED]: SEVERITY.LOW,
  [SECURITY_EVENTS.DATA_EXPORT]: SEVERITY.MEDIUM,
  [SECURITY_EVENTS.DATA_DELETION]: SEVERITY.HIGH,
  [SECURITY_EVENTS.SENSITIVE_DATA_ACCESS]: SEVERITY.MEDIUM,
  [SECURITY_EVENTS.SQL_INJECTION]: SEVERITY.CRITICAL,
  [SECURITY_EVENTS.XSS_ATTACK]: SEVERITY.HIGH,
  [SECURITY_EVENTS.PATH_TRAVERSAL]: SEVERITY.HIGH,
  [SECURITY_EVENTS.BRUTE_FORCE]: SEVERITY.HIGH,
  [SECURITY_EVENTS.DDoS_DETECTED]: SEVERITY.CRITICAL,
  [SECURITY_EVENTS.SYSTEM_CONFIG_CHANGED]: SEVERITY.HIGH,
  [SECURITY_EVENTS.USER_CREATED]: SEVERITY.MEDIUM,
  [SECURITY_EVENTS.USER_DELETED]: SEVERITY.HIGH,
  [SECURITY_EVENTS.TENANT_CREATED]: SEVERITY.MEDIUM,
  [SECURITY_EVENTS.TENANT_SUSPENDED]: SEVERITY.HIGH,
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log a security event
 * 
 * @param {Object} params
 * @param {string} params.eventType - Event type
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.userId - User ID (optional)
 * @param {Object} params.details - Event details
 * @param {string} params.ipAddress - IP address
 * @param {string} params.userAgent - User agent
 */
export async function logSecurityEvent({
  eventType,
  tenantId,
  userId,
  details = {},
  ipAddress,
  userAgent,
}) {
  try {
    const severity = EVENT_SEVERITY[eventType] || SEVERITY.MEDIUM;

    // Create security event record
    const event = await db.createSecurityEvent({
      tenantId,
      eventType,
      deviceId: details.deviceId,
      ipAddress,
      details: {
        ...details,
        userId,
        severity,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date(),
    });

    // Cache recent events for real-time monitoring
    const cacheKey = `security:events:${tenantId}`;
    const eventData = {
      id: event.id,
      eventType,
      severity,
      timestamp: new Date().toISOString(),
      ipAddress,
    };

    if (redisClient.isAvailable) {
      try {
        await redisClient.client.lpush(cacheKey, JSON.stringify(eventData));
        await redisClient.client.ltrim(cacheKey, 0, 99); // Keep last 100 events
        await redisClient.client.expire(cacheKey, 86400); // 24 hours
      } catch (error) {
        // Silently fail - caching is non-critical
      }
    }

    // Log to console for critical events
    if (severity === SEVERITY.CRITICAL || severity === SEVERITY.HIGH) {
      console.warn(`[SecurityEvent] ${severity}: ${eventType}`, {
        tenantId,
        userId,
        ipAddress,
        details,
      });
    }

    return {
      success: true,
      data: event,
    };
  } catch (error) {
    console.error('Log security event error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get recent security events for a tenant
 * 
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of events to return
 * @returns {Array} Recent events
 */
export async function getRecentEvents(tenantId, limit = 50) {
  try {
    // Try cache first
    if (redisClient.isAvailable) {
      try {
        const cacheKey = `security:events:${tenantId}`;
        const cached = await redisClient.client.lrange(cacheKey, 0, limit - 1);
        if (cached && cached.length > 0) {
          return cached.map(e => JSON.parse(e));
        }
      } catch (error) {
        // Fallback to database
      }
    }

    // Fallback to database
    const events = await db.prisma.securityEvent.findMany({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return events;
  } catch (error) {
    console.error('Get recent events error:', error);
    return [];
  }
}

/**
 * Get security events by severity
 * 
 * @param {string} tenantId - Tenant ID
 * @param {string} severity - Severity level
 * @param {Date} since - Start time
 * @returns {Array} Events
 */
export async function getEventsBySeverity(tenantId, severity, since) {
  try {
    const events = await db.prisma.securityEvent.findMany({
      where: {
        tenantId,
        timestamp: { gte: since },
        details: {
          path: ['severity'],
          equals: severity,
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    return events;
  } catch (error) {
    console.error('Get events by severity error:', error);
    return [];
  }
}

/**
 * Get security event statistics
 * 
 * @param {string} tenantId - Tenant ID
 * @param {number} hours - Number of hours to look back
 * @returns {Object} Statistics
 */
export async function getEventStats(tenantId, hours = 24) {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const events = await db.prisma.securityEvent.findMany({
      where: {
        tenantId,
        timestamp: { gte: since },
      },
    });

    // Count by event type
    const byType = {};
    const bySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };

    for (const event of events) {
      byType[event.eventType] = (byType[event.eventType] || 0) + 1;
      const severity = event.details?.severity || 'MEDIUM';
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    }

    // Get unique IPs
    const uniqueIps = new Set(events.map(e => e.ipAddress).filter(Boolean));

    return {
      totalEvents: events.length,
      byType,
      bySeverity,
      uniqueIpCount: uniqueIps.size,
      timeRange: {
        from: since,
        to: new Date(),
      },
    };
  } catch (error) {
    console.error('Get event stats error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREAT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect brute force attempts
 * 
 * @param {string} tenantId - Tenant ID
 * @param {string} ipAddress - IP address
 * @param {number} windowMinutes - Time window in minutes
 * @param {number} threshold - Number of failed attempts threshold
 * @returns {Object} Detection result
 */
export async function detectBruteForce(tenantId, ipAddress, windowMinutes = 15, threshold = 5) {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const failedAttempts = await db.prisma.securityEvent.count({
      where: {
        tenantId,
        eventType: SECURITY_EVENTS.LOGIN_FAILED,
        ipAddress,
        timestamp: { gte: since },
      },
    });

    const isBruteForce = failedAttempts >= threshold;

    if (isBruteForce) {
      await logSecurityEvent({
        eventType: SECURITY_EVENTS.BRUTE_FORCE,
        tenantId,
        details: {
          failedAttempts,
          windowMinutes,
          threshold,
        },
        ipAddress,
      });
    }

    return {
      detected: isBruteForce,
      failedAttempts,
      threshold,
      windowMinutes,
    };
  } catch (error) {
    console.error('Detect brute force error:', error);
    return { detected: false, error: error.message };
  }
}

/**
 * Detect suspicious activity pattern
 * 
 * @param {string} tenantId - Tenant ID
 * @param {number} hours - Time window in hours
 * @returns {Object} Detection result
 */
export async function detectSuspiciousActivity(tenantId, hours = 1) {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const events = await db.prisma.securityEvent.findMany({
      where: {
        tenantId,
        timestamp: { gte: since },
      },
    });

    const suspiciousPatterns = [];

    // Check for multiple failed logins from different IPs
    const failedLogins = events.filter(e => e.eventType === SECURITY_EVENTS.LOGIN_FAILED);
    const uniqueFailedIps = new Set(failedLogins.map(e => e.ipAddress));
    if (uniqueFailedIps.size > 3) {
      suspiciousPatterns.push({
        type: 'MULTIPLE_IP_FAILED_LOGINS',
        count: failedLogins.length,
        uniqueIps: uniqueFailedIps.size,
      });
    }

    // Check for sensitive data access
    const sensitiveAccess = events.filter(e => e.eventType === SECURITY_EVENTS.SENSITIVE_DATA_ACCESS);
    if (sensitiveAccess.length > 10) {
      suspiciousPatterns.push({
        type: 'EXCESSIVE_SENSITIVE_ACCESS',
        count: sensitiveAccess.length,
      });
    }

    // Check for unusual API key usage
    const apiKeyEvents = events.filter(e => e.eventType === SECURITY_EVENTS.API_KEY_USED);
    const uniqueApiKeys = new Set(apiKeyEvents.map(e => e.details?.keyId));
    if (uniqueApiKeys.size > 5) {
      suspiciousPatterns.push({
        type: 'MULTIPLE_API_KEY_USAGE',
        count: apiKeyEvents.length,
        uniqueKeys: uniqueApiKeys.size,
      });
    }

    return {
      suspicious: suspiciousPatterns.length > 0,
      patterns: suspiciousPatterns,
      totalEvents: events.length,
    };
  } catch (error) {
    console.error('Detect suspicious activity error:', error);
    return { suspicious: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get security dashboard data
 * 
 * @param {string} tenantId - Tenant ID
 * @returns {Object} Dashboard data
 */
export async function getSecurityDashboard(tenantId) {
  try {
    const [stats24h, stats7d, recentEvents, threats] = await Promise.all([
      getEventStats(tenantId, 24),
      getEventStats(tenantId, 168), // 7 days
      getRecentEvents(tenantId, 20),
      detectSuspiciousActivity(tenantId, 24),
    ]);

    return {
      success: true,
      data: {
        stats24h,
        stats7d,
        recentEvents,
        threats,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Get security dashboard error:', error);
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
  SECURITY_EVENTS,
  SEVERITY,
  EVENT_SEVERITY,
  logSecurityEvent,
  getRecentEvents,
  getEventsBySeverity,
  getEventStats,
  detectBruteForce,
  detectSuspiciousActivity,
  getSecurityDashboard,
};
