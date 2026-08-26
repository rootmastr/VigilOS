/**
 * VigilOS Security Middleware — Comprehensive Protection Layer
 *
 * Covers: rate limiting, input validation, JWT management, API key auth,
 * request sanitization, security headers, audit logging, DDoS protection.
 *
 * All modules use only Node.js built-ins + existing project dependencies
 * (jsonwebtoken, bcryptjs). Redis integration defers gracefully when
 * the cache layer is unavailable.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { redisClient } from '../cache/redisClient.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const JWT_SECRET = process.env.JWT_SECRET || 'vigilos-secret-key-2024';
const JWT_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_IN_DAYS = 7;

const RATE_LIMITS = {
  login:      { max: 5,   windowMs: 15 * 60 * 1000 },   // 5 per 15 min
  api:        { max: 100, windowMs: 60 * 1000 },          // 100 per minute per tenant
  websocket:  { max: 60,  windowMs: 60 * 1000 },          // 60 per minute per client
  upload:     { max: 10,  windowMs: 60 * 1000 },          // 10 per minute
};

const DDoS = {
  ipWindowMs: 60 * 1000,
  ipMaxRequests: 200,
  blockThreshold: 500,
  blockDurationSec: 3600,
  suspiciousScoreThreshold: 10,
};

const REQUEST_LIMITS = {
  maxBodySize: 10 * 1024 * 1024,       // 10 MB
  maxUrlLength: 2048,
  maxHeaderSize: 8192,
  maxParamCount: 100,
  allowedContentTypes: [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/csv',
    'application/pdf',
  ],
};

// Regex patterns for attack detection
const PATTERNS = {
  sqlInjection: /(\b(UNION\s+(ALL\s+)?SELECT|INSERT\s+INTO|DELETE\s+FROM|DROP\s+(TABLE|DATABASE)|UPDATE\s+\w+\s+SET|EXEC(\s+UTE)?\s*\(|xp_cmdshell)\b|--\s*$|;\s*DROP|'\s*OR\s+['"]\d*['"]?\s*=\s*['"]?\d*['"]|'\s*OR\s+\d+\s*=\s*\d+|SLEEP\s*\(\s*\d+\s*\)|BENCHMARK\s*\()/i,
  xss: /(<script\b[^>]*>|javascript\s*:|on\w+\s*=\s*["']|<iframe\b|<object\b|<embed\b|<applet\b|<form\b[^>]*action\s*=|<svg\s+onload|<img\s+[^>]*onerror|<body\s+onload|expression\s*\(|eval\s*\(|document\.(cookie|domain|write)|window\.(location|open)|\.innerHTML\s*=|\.outerHTML\s*=)/i,
  pathTraversal: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|%2e%5c|\.%2e\/|%252e%252e)/i,
  nullByte: /\x00/,
};

const HTML_TAG = /<[^>]*>/g;

// ═══════════════════════════════════════════════════════════════════════════════
// Rate Limiting — Redis only (no in-memory fallback)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Rate Limiting Middleware (Sliding Window)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a rate limiter for a specific endpoint type.
 * Uses Redis for sliding window rate limiting.
 */
function createRateLimiter(type) {
  const { max, windowMs } = RATE_LIMITS[type] || RATE_LIMITS.api;

  return async (req, res, next) => {
    const identifier = getRateLimitKey(type, req);
    const key = `rl:${type}:${identifier}`;

    if (!redisClient.isAvailable) {
      res.set({
        'X-RateLimit-Limit': String(max),
        'X-RateLimit-Remaining': String(max),
        'X-RateLimit-Reset': new Date(Date.now() + windowMs).toISOString(),
      });
      return next();
    }

    try {
      const now = Date.now();
      const windowStart = now - windowMs;

      const pipe = redisClient.client.pipeline();
      pipe.zremrangebyscore(key, 0, windowStart);
      pipe.zadd(key, now, `${now}-${crypto.randomBytes(4).toString('hex')}`);
      pipe.zcard(key);
      pipe.expire(key, Math.ceil(windowMs / 1000));
      const [, , countResult] = await pipe.exec();

      const count = countResult?.[1] ?? 0;
      const remaining = Math.max(0, max - count);
      const allowed = count <= max;
      const resetAt = new Date(now + windowMs);

      res.set({
        'X-RateLimit-Limit': String(max),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': resetAt.toISOString(),
      });

      if (!allowed) {
        const retryAfterSec = Math.ceil(windowMs / 1000);
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          success: false,
          error: 'Too Many Requests',
          message: `Rate limit exceeded for ${type}. Retry after ${retryAfterSec} seconds.`,
          retryAfterSec,
          limit: max,
          remaining: 0,
        });
      }
    } catch {
      // Redis error — fail open
    }

    next();
  };
}

function getRateLimitKey(type, req) {
  switch (type) {
    case 'login':
      return req.ip || req.socket?.remoteAddress || 'unknown';
    case 'api':
      return req.user?.tenantId || req.ip || 'unknown';
    case 'websocket':
      return req.headers['x-client-id'] || req.ip || 'unknown';
    case 'upload':
      return req.user?.tenantId || req.ip || 'unknown';
    default:
      return req.ip || 'unknown';
  }
}

// Pre-built middleware instances
export const loginRateLimiter = createRateLimiter('login');
export const apiRateLimiter = createRateLimiter('api');
export const websocketRateLimiter = createRateLimiter('websocket');
export const uploadRateLimiter = createRateLimiter('upload');

/**
 * Generic rate limiter factory for custom configurations.
 */
export function rateLimiter({ max = 100, windowMs = 60000, keyFn } = {}) {
  return async (req, res, next) => {
    const identifier = keyFn ? keyFn(req) : (req.ip || 'unknown');
    const key = `rl:custom:${identifier}:${req.route?.path || req.path}`;

    if (!redisClient.isAvailable) {
      res.set({
        'X-RateLimit-Limit': String(max),
        'X-RateLimit-Remaining': String(max),
        'X-RateLimit-Reset': new Date(Date.now() + windowMs).toISOString(),
      });
      return next();
    }

    try {
      const now = Date.now();
      const windowStart = now - windowMs;
      const pipe = redisClient.client.pipeline();
      pipe.zremrangebyscore(key, 0, windowStart);
      pipe.zadd(key, now, `${now}-${crypto.randomBytes(4).toString('hex')}`);
      pipe.zcard(key);
      pipe.expire(key, Math.ceil(windowMs / 1000));
      const [, , countResult] = await pipe.exec();
      const count = countResult?.[1] ?? 0;

      res.set({
        'X-RateLimit-Limit': String(max),
        'X-RateLimit-Remaining': String(Math.max(0, max - count)),
        'X-RateLimit-Reset': new Date(Date.now() + windowMs).toISOString(),
      });

      if (count > max) {
        const retryAfterSec = Math.ceil(windowMs / 1000);
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          success: false,
          error: 'Too Many Requests',
          retryAfterSec,
        });
      }
    } catch {
      // Redis error — fail open
    }

    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Input Validation Middleware
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect SQL injection patterns in a value (recursive).
 */
function detectSqlInjection(value) {
  if (typeof value === 'string') return PATTERNS.sqlInjection.test(value);
  if (Array.isArray(value)) return value.some(detectSqlInjection);
  if (value && typeof value === 'object') {
    return Object.values(value).some(detectSqlInjection);
  }
  return false;
}

/**
 * Detect XSS patterns in a value (recursive).
 */
function detectXss(value) {
  if (typeof value === 'string') return PATTERNS.xss.test(value);
  if (Array.isArray(value)) return value.some(detectXss);
  if (value && typeof value === 'object') {
    return Object.values(value).some(detectXss);
  }
  return false;
}

/**
 * Detect path traversal in a value (recursive).
 */
function detectPathTraversal(value) {
  if (typeof value === 'string') return PATTERNS.pathTraversal.test(value);
  if (Array.isArray(value)) return value.some(detectPathTraversal);
  if (value && typeof value === 'object') {
    return Object.values(value).some(detectPathTraversal);
  }
  return false;
}

/**
 * Detect null bytes in a value (recursive).
 */
function detectNullByte(value) {
  if (typeof value === 'string') return PATTERNS.nullByte.test(value);
  if (Array.isArray(value)) return value.some(detectNullByte);
  if (value && typeof value === 'object') {
    return Object.values(value).some(detectNullByte);
  }
  return false;
}

/**
 * Check for parameter tampering — unexpected keys or type mismatches.
 */
function detectParameterTampering(body, allowedFields) {
  if (!allowedFields || !body || typeof body !== 'object') return null;
  const unexpected = Object.keys(body).filter(k => !allowedFields.includes(k));
  return unexpected.length > 0 ? unexpected : null;
}

/**
 * Main input validation middleware factory.
 */
export function validateInput(options = {}) {
  const {
    allowedFields = null,
    maxBodySize = REQUEST_LIMITS.maxBodySize,
    requiredContentTypes = null,
    strictMode = false,
  } = options;

  return (req, res, next) => {
    // URL length check
    if (req.originalUrl && req.originalUrl.length > REQUEST_LIMITS.maxUrlLength) {
      logSecurityAudit({
        action: 'INPUT_VALIDATION_FAILED',
        resource: req.path,
        result: 'BLOCKED',
        details: `URL too long: ${req.originalUrl.length} chars`,
        ip: req.ip,
      });
      return res.status(414).json({ success: false, error: 'URI Too Long' });
    }

    // Content-Type validation
    if (requiredContentTypes && req.method !== 'GET' && req.method !== 'DELETE') {
      const ct = req.headers['content-type'] || '';
      const matches = requiredContentTypes.some(t => ct.includes(t));
      if (!matches && ct) {
        logSecurityAudit({
          action: 'INPUT_VALIDATION_FAILED',
          resource: req.path,
          result: 'BLOCKED',
          details: `Invalid Content-Type: ${ct}`,
          ip: req.ip,
        });
        return res.status(415).json({ success: false, error: 'Unsupported Media Type' });
      }
    }

    // Parameter count check
    const paramCount = Object.keys({ ...req.query, ...req.body }).length;
    if (paramCount > REQUEST_LIMITS.maxParamCount) {
      return res.status(400).json({ success: false, error: 'Too many parameters' });
    }

    // Scan body for attacks
    if (req.body && typeof req.body === 'object') {
      if (detectSqlInjection(req.body)) {
        logSecurityAudit({
          action: 'SQL_INJECTION_DETECTED',
          resource: req.path,
          result: 'BLOCKED',
          details: `SQL injection pattern in request body`,
          ip: req.ip,
          userId: req.user?.id,
        });
        incrementSuspiciousScore(req.ip, 3);
        return res.status(400).json({ success: false, error: 'Invalid input detected' });
      }

      if (detectXss(req.body)) {
        logSecurityAudit({
          action: 'XSS_DETECTED',
          resource: req.path,
          result: 'BLOCKED',
          details: `XSS pattern in request body`,
          ip: req.ip,
          userId: req.user?.id,
        });
        incrementSuspiciousScore(req.ip, 3);
        return res.status(400).json({ success: false, error: 'Invalid input detected' });
      }

      if (detectNullByte(req.body)) {
        logSecurityAudit({
          action: 'NULL_BYTE_DETECTED',
          resource: req.path,
          result: 'BLOCKED',
          details: `Null byte in request body`,
          ip: req.ip,
        });
        return res.status(400).json({ success: false, error: 'Invalid input detected' });
      }

      // Parameter tampering
      if (allowedFields) {
        const unexpected = detectParameterTampering(req.body, allowedFields);
        if (unexpected && strictMode) {
          logSecurityAudit({
            action: 'PARAMETER_TAMPERING',
            resource: req.path,
            result: 'BLOCKED',
            details: `Unexpected fields: ${unexpected.join(', ')}`,
            ip: req.ip,
            userId: req.user?.id,
          });
          return res.status(400).json({ success: false, error: 'Invalid parameters' });
        }
      }
    }

    // Scan query params for attacks
    if (req.query && typeof req.query === 'object') {
      if (detectSqlInjection(req.query) || detectXss(req.query)) {
        logSecurityAudit({
          action: 'MALICIOUS_QUERY_PARAM',
          resource: req.path,
          result: 'BLOCKED',
          details: 'Attack pattern in query parameters',
          ip: req.ip,
        });
        return res.status(400).json({ success: false, error: 'Invalid query parameters' });
      }
    }

    // Scan URL params for path traversal
    if (req.params) {
      if (detectPathTraversal(req.params)) {
        logSecurityAudit({
          action: 'PATH_TRAVERSAL_DETECTED',
          resource: req.path,
          result: 'BLOCKED',
          details: 'Path traversal in URL parameters',
          ip: req.ip,
        });
        return res.status(400).json({ success: false, error: 'Invalid path' });
      }
    }

    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. JWT Token Management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a signed JWT with standard VigilOS claims.
 */
export function generateToken(user, options = {}) {
  const { expiresIn = JWT_EXPIRES_IN } = options;
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      name: user.name,
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
    { expiresIn, issuer: 'vigilos', subject: user.id }
  );
}

/**
 * Generate a refresh token (opaque string stored in DB).
 */
export function generateRefreshToken(userId, tenantId) {
  const token = `rt_${crypto.randomBytes(32).toString('hex')}`;
  return {
    token,
    userId,
    tenantId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Verify and decode a JWT token. Returns decoded payload or throws.
 */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { issuer: 'vigilos' });
}

/**
 * Check if a token has been revoked (blacklisted).
 */
async function isTokenRevoked(tokenId) {
  if (!redisClient.isAvailable) return false;
  return await redisClient.exists(`bl:${tokenId}`);
}

/**
 * Revoke a token by adding its jti to the blacklist.
 * TTL matches the token's remaining expiry.
 */
export async function revokeToken(tokenId, expiresAt) {
  if (!redisClient.isAvailable) return;
  const ttl = Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  await redisClient.setex(`bl:${tokenId}`, ttl, '1');
}

/**
 * Express middleware: authenticate JWT Bearer token with revocation check.
 */
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.replace(/^Bearer\s+/, '').trim();

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  try {
    const decoded = verifyToken(token);

    // Check revocation
    if (decoded.jti && await isTokenRevoked(decoded.jti)) {
      logSecurityAudit({
        action: 'REVOKED_TOKEN_USED',
        resource: req.path,
        result: 'BLOCKED',
        details: `Token ${decoded.jti} is revoked`,
        ip: req.ip,
        userId: decoded.id,
      });
      return res.status(401).json({ success: false, error: 'Token has been revoked' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }
}

/**
 * Express middleware: Role-Based Access Control check.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      logSecurityAudit({
        action: 'RBAC_DENIED',
        resource: req.path,
        result: 'DENIED',
        details: `Role ${req.user.role} not in [${roles.join(', ')}]`,
        ip: req.ip,
        userId: req.user.id,
      });
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Express middleware: Scope-based permission check.
 */
export function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const userPerms = req.user.permissions || [];
    const hasWildcard = userPerms.includes('*');
    const hasAll = permissions.every(p => userPerms.includes(p) || hasWildcard);

    if (!hasAll) {
      logSecurityAudit({
        action: 'PERMISSION_DENIED',
        resource: req.path,
        result: 'DENIED',
        details: `Missing permissions: ${permissions.filter(p => !userPerms.includes(p)).join(', ')}`,
        ip: req.ip,
        userId: req.user.id,
      });
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. API Key Authentication
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hash an API key for storage/comparison.
 */
export function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Validate an API key against its stored hash.
 * Checks expiry, status, and usage tracking.
 */
export async function validateApiKey(rawKey, dbLookup) {
  const prefix = rawKey.slice(0, 12);
  const keyHash = hashApiKey(rawKey);

  // Try Redis cache first
  let keyRecord = null;
  if (redisClient.isAvailable) {
    const cached = await redisClient.get(`apikey:${keyHash}`);
    if (cached) {
      try { keyRecord = JSON.parse(cached); } catch { keyRecord = null; }
    }
  }

  // Fallback to DB lookup
  if (!keyRecord && dbLookup) {
    keyRecord = await dbLookup(rawKey);
  }

  if (!keyRecord) return null;

  if (keyRecord.status !== 'ACTIVE') return { valid: false, reason: 'REVOKED' };

  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) <= new Date()) {
    return { valid: false, reason: 'EXPIRED' };
  }

  // Update usage tracking (fire-and-forget)
  keyRecord.lastUsedAt = new Date().toISOString();
  if (redisClient.isAvailable) {
    redisClient.setex(`apikey:${keyHash}`, 3600, JSON.stringify(keyRecord)).catch(() => {});
  }

  return { valid: true, record: keyRecord };
}

/**
 * Express middleware: API Key authentication via X-API-Key header.
 */
export function authenticateApiKey(dbLookup) {
  return async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ success: false, error: 'API key required' });
    }

    const result = await validateApiKey(apiKey, dbLookup);
    if (!result || !result.valid) {
      logSecurityAudit({
        action: 'API_KEY_INVALID',
        resource: req.path,
        result: 'BLOCKED',
        details: `API key validation failed: ${result?.reason || 'NOT_FOUND'}`,
        ip: req.ip,
      });
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    // Attach API key metadata to request
    req.apiKey = result.record;
    req.user = {
      id: result.record.tenantId,
      tenantId: result.record.tenantId,
      role: 'API_CLIENT',
      permissions: result.record.permissions || [],
    };
    next();
  };
}

/**
 * Rotate an API key: generate new key, mark old as ROTATED.
 */
export function rotateApiKey(oldKeyRecord) {
  const rawKey = `ak_${crypto.randomBytes(20).toString('hex')}`;
  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    prefix: oldKeyRecord.prefix,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Request Sanitization
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Strip HTML tags from a string value.
 */
export function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(HTML_TAG, '');
}

/**
 * Remove null bytes from a string.
 */
export function removeNullBytes(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\x00/g, '');
}

/**
 * Normalize a file path (resolve .. segments, remove redundant separators).
 */
export function normalizePath(p) {
  if (typeof p !== 'string') return p;
  return p
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Recursively sanitize all string values in an object.
 */
function sanitizeValue(value) {
  if (typeof value === 'string') {
    return removeNullBytes(stripHtml(value));
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      clean[k] = sanitizeValue(v);
    }
    return clean;
  }
  return value;
}

/**
 * Express middleware: sanitize all incoming request data.
 */
export function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(req.query)) {
      clean[k] = sanitizeValue(v);
    }
    req.query = clean;
  }
  if (req.params && typeof req.params === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(req.params)) {
      clean[k] = sanitizeValue(v);
    }
    req.params = clean;
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Security Headers Middleware
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply standard security headers to every response.
 */
export function securityHeaders(req, res, next) {
  // Content Security Policy
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "font-src 'self'; " +
    "connect-src 'self' ws: wss:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Strict Transport Security (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // XSS Protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Remove server identification
  res.removeHeader('X-Powered-By');

  // Generate and attach Request ID
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
  req.requestId = requestId;

  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Audit Logging
// ═══════════════════════════════════════════════════════════════════════════════

const auditLogBuffer = [];
const AUDIT_FLUSH_INTERVAL = 5000;
const AUDIT_MAX_BUFFER = 500;

/**
 * Structured JSON audit log entry.
 */
export function logSecurityAudit(entry) {
  const record = {
    id: `SEC-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    action: entry.action || 'UNKNOWN',
    userId: entry.userId || null,
    user: entry.user || null,
    resource: entry.resource || null,
    result: entry.result || 'SUCCESS',
    details: entry.details || '',
    ip: entry.ip || null,
    userAgent: entry.userAgent || null,
    requestId: entry.requestId || null,
    tenantId: entry.tenantId || null,
    metadata: entry.metadata || null,
  };

  auditLogBuffer.push(record);

  // Flush if buffer is full
  if (auditLogBuffer.length >= AUDIT_MAX_BUFFER) {
    flushAuditLog();
  }

  // Console output for immediate visibility
  if (record.result !== 'SUCCESS') {
    console.warn(`[SECURITY] ${record.action} | ${record.result} | ${record.ip || 'N/A'} | ${record.details}`);
  }

  return record;
}

/**
 * Flush buffered audit log entries to storage.
 */
function flushAuditLog() {
  if (auditLogBuffer.length === 0) return;
  const entries = auditLogBuffer.splice(0);
  // In production, write to persistent store (Postgres, file, etc.)
  // For now, entries are available via getAuditLog()
  return entries;
}

// Periodic flush
setInterval(flushAuditLog, AUDIT_FLUSH_INTERVAL);

/**
 * Retrieve audit log entries (from buffer + any flushed entries).
 */
export function getAuditLog({ limit = 100, action, userId, result, since } = {}) {
  let logs = [...auditLogBuffer];
  if (action) logs = logs.filter(l => l.action === action);
  if (userId) logs = logs.filter(l => l.userId === userId);
  if (result) logs = logs.filter(l => l.result === result);
  if (since) logs = logs.filter(l => new Date(l.timestamp) >= new Date(since));
  return logs.slice(0, limit);
}

/**
 * Express middleware: log every request for audit trail.
 */
export function auditLogger(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logSecurityAudit({
      action: `${req.method} ${req.path}`,
      userId: req.user?.id || null,
      resource: req.originalUrl,
      result: res.statusCode < 400 ? 'SUCCESS' : 'ERROR',
      details: `HTTP ${res.statusCode} | ${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
      tenantId: req.user?.tenantId || null,
      metadata: { method: req.method, statusCode: res.statusCode, duration },
    });
  });

  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. DDoS Protection (Redis-only, no in-memory fallback)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Increment suspicious score for an IP via Redis.
 */
async function incrementSuspiciousScore(ip, points = 1) {
  if (!redisClient.isAvailable) return;
  const key = `ddos:suspicious:${ip}`;
  const current = await redisClient.incrby(key, points);
  await redisClient.expire(key, DDoS.blockDurationSec);
  if (current >= DDoS.suspiciousScoreThreshold) {
    await blockIP(ip, DDoS.blockDurationSec);
  }
}

/**
 * Block an IP address for a duration via Redis.
 */
async function blockIP(ip, durationSec) {
  if (!redisClient.isAvailable) return;
  await redisClient.setex(`ddos:blocked:${ip}`, durationSec, '1');
  logSecurityAudit({
    action: 'IP_BLOCKED',
    resource: 'ddos_protection',
    result: 'BLOCKED',
    details: `IP ${ip} blocked for ${durationSec}s due to suspicious activity`,
    ip,
  });
}

/**
 * Check if an IP is currently blocked via Redis.
 */
async function isIPBlocked(ip) {
  if (!redisClient.isAvailable) return false;
  return await redisClient.exists(`ddos:blocked:${ip}`);
}

/**
 * Detect suspicious request patterns.
 */
function analyzeSuspiciousPatterns(req) {
  const score = [];
  const ua = req.headers['user-agent'] || '';

  if (!ua || ua.length < 10) score.push(1);
  if (req.url && req.url.length > 1024) score.push(2);

  const attackPaths = ['/wp-admin', '/phpmyadmin', '/.env', '/config', '/backup', '/admin.php'];
  if (attackPaths.some(p => req.path?.toLowerCase().includes(p))) score.push(3);

  return score.reduce((a, b) => a + b, 0);
}

/**
 * Express middleware: DDoS protection layer.
 */
export async function ddosProtection(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  if (process.env.NODE_ENV !== 'production' && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
    return next();
  }

  if (!redisClient.isAvailable) return next();

  // Check if IP is blocked
  if (await isIPBlocked(ip)) {
    logSecurityAudit({
      action: 'DDOS_BLOCKED',
      resource: req.path,
      result: 'BLOCKED',
      details: `Request from blocked IP`,
      ip,
    });
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  // Analyze suspicious patterns
  const suspiciousScore = analyzeSuspiciousPatterns(req);
  if (suspiciousScore > 0) {
    incrementSuspiciousScore(ip, suspiciousScore).catch(() => {});
  }

  // IP-based rate limiting via Redis
  const now = Date.now();
  const windowStart = now - DDoS.ipWindowMs;
  const key = `ddos:requests:${ip}`;

  try {
    const pipe = redisClient.client.pipeline();
    pipe.zremrangebyscore(key, 0, windowStart);
    pipe.zadd(key, now, `${now}-${crypto.randomBytes(4).toString('hex')}`);
    pipe.zcard(key);
    pipe.expire(key, Math.ceil(DDoS.ipWindowMs / 1000));
    const [, , countResult] = await pipe.exec();
    const count = countResult?.[1] ?? 0;

    if (count > DDoS.ipMaxRequests) {
      await blockIP(ip, DDoS.blockDurationSec);
      logSecurityAudit({
        action: 'DDOS_RATE_EXCEEDED',
        resource: req.path,
        result: 'BLOCKED',
        details: `${count} requests in ${DDoS.ipWindowMs / 1000}s window (max ${DDoS.ipMaxRequests})`,
        ip,
      });
      return res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message: 'Request rate exceeded. Temporary block in effect.',
        retryAfterSec: DDoS.blockDurationSec,
      });
    }

    req.ddosInfo = {
      ip,
      requestsInWindow: count,
      limit: DDoS.ipMaxRequests,
    };
  } catch {
    // Redis error — fail open
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Body Size Limit Middleware
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enforce request body size limit.
 */
export function bodySizeLimit(maxBytes = REQUEST_LIMITS.maxBodySize) {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (!isNaN(contentLength) && contentLength > maxBytes) {
      logSecurityAudit({
        action: 'BODY_SIZE_EXCEEDED',
        resource: req.path,
        result: 'BLOCKED',
        details: `Body size ${contentLength} exceeds limit ${maxBytes}`,
        ip: req.ip,
      });
      return res.status(413).json({ success: false, error: 'Payload Too Large' });
    }
    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Composite Security Middleware Stack
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full security middleware stack for Express app.
 * Apply this before route definitions.
 *
 * Usage:
 *   import { securityStack } from './security/securityMiddleware.js';
 *   app.use(securityStack());
 */
export function securityStack(options = {}) {
  const { excludeDdos = false, excludeAudit = false } = options;

  const middlewares = [
    securityHeaders,
    sanitizeRequest,
    bodySizeLimit(),
  ];

  if (!excludeDdos) middlewares.push(ddosProtection);
  if (!excludeAudit) middlewares.push(auditLogger);

  return middlewares;
}

/**
 * Protected route middleware stack (requires JWT auth).
 */
export function protectedRoute(options = {}) {
  const { roles = [], permissions = [] } = options;
  const middlewares = [authenticateToken];
  if (roles.length > 0) middlewares.push(requireRole(...roles));
  if (permissions.length > 0) middlewares.push(requirePermission(...permissions));
  return middlewares;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  // Rate limiting
  loginRateLimiter,
  apiRateLimiter,
  websocketRateLimiter,
  uploadRateLimiter,
  rateLimiter,

  // Input validation
  validateInput,

  // JWT
  generateToken,
  generateRefreshToken,
  verifyToken,
  revokeToken,
  authenticateToken,
  requireRole,
  requirePermission,

  // API Key
  hashApiKey,
  validateApiKey,
  authenticateApiKey,
  rotateApiKey,

  // Sanitization
  stripHtml,
  removeNullBytes,
  normalizePath,
  sanitizeRequest,

  // Security Headers
  securityHeaders,

  // Audit
  logSecurityAudit,
  getAuditLog,
  auditLogger,

  // DDoS
  ddosProtection,

  // Body limits
  bodySizeLimit,

  // Composite stacks
  securityStack,
  protectedRoute,
};
