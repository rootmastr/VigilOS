/**
 * Authentication & Authorization Middleware — PRD §2.2
 * 
 * JWT token verification, role-based access control, and permission checking.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vigilos-secret-key-2024';

/**
 * Authenticate JWT token
 * Extracts user from Bearer token in Authorization header
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.replace(/^Bearer\s+/, '').trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
      });
    }
    return res.status(403).json({
      success: false,
      error: 'Invalid token',
    });
  }
}

/**
 * Require specific roles
 * @param  {...string} roles - Allowed roles
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.role,
      });
    }

    next();
  };
}

/**
 * Require specific permissions
 * @param  {...string} permissions - Required permissions
 */
export function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Super admin has all permissions
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const hasWildcard = userPermissions.includes('*');
    const hasAll = permissions.every(p => userPermissions.includes(p) || hasWildcard);

    if (!hasAll) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: permissions,
      });
    }

    next();
  };
}

/**
 * Authenticate API key
 * Extracts tenant from X-API-Key header
 */
export function authenticateApiKey(dbLookup) {
  return async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return next(); // No API key, continue to JWT auth
    }

    try {
      const crypto = await import('crypto');
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const keyRecord = await dbLookup(keyHash);

      if (!keyRecord || keyRecord.status !== 'ACTIVE') {
        return res.status(401).json({
          success: false,
          error: 'Invalid API key',
        });
      }

      // Check expiry
      if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) <= new Date()) {
        return res.status(401).json({
          success: false,
          error: 'API key expired',
        });
      }

      // Attach API key user context
      req.user = {
        id: keyRecord.tenantId,
        tenantId: keyRecord.tenantId,
        role: 'API_CLIENT',
        permissions: keyRecord.permissions || [],
      };

      // Set tenant from API key
      req.tenant = { id: keyRecord.tenantId };

      next();
    } catch (error) {
      console.error('API key authentication error:', error);
      next(); // Continue to JWT auth
    }
  };
}

/**
 * Optional authentication
 * Attaches user if token is present, but doesn't require it
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.replace(/^Bearer\s+/, '').trim();

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    // Ignore invalid tokens for optional auth
  }

  next();
}

export default {
  authenticateToken,
  requireRole,
  requirePermission,
  authenticateApiKey,
  optionalAuth,
};
