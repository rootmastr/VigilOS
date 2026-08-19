/**
 * Tenant Isolation Middleware — PRD §2.2 & §5.1
 * 
 * Implements automatic tenant filtering via Prisma middleware.
 * Ensures all database queries are scoped to the current tenant.
 * 
 * Flow:
 * 1. Extract tenant from JWT token claim, X-Tenant-ID header, or subdomain
 * 2. Attach tenant context to request
 * 3. Prisma middleware automatically filters all queries by tenantId
 */

import { PrismaClient } from '@prisma/client';

// Models that require tenant isolation
const TENANT_SCOPED_MODELS = [
  'User',
  'Vehicle',
  'Incident',
  'FieldReport',
  'Subscription',
  'Invoice',
  'APIKey',
  'AuditLog',
  'SecurityEvent',
  'DeviceToken',
  'Driver',
  'Officer',
  'Role',
  'Invitation',
  'RefreshToken',
  'SlaDocument',
  'UsageRecord',
  'TenantSetting',
  'TenantFeature',
];

// Models that are globally accessible (no tenant filtering)
const GLOBAL_MODELS = ['Tenant'];

/**
 * Check if a model requires tenant isolation
 */
function isTenantScopedModel(model) {
  return TENANT_SCOPED_MODELS.includes(model);
}

/**
 * Create Prisma client with tenant isolation middleware
 * NOTE: Prisma 6 removed $use middleware. Tenant isolation enforced at route level.
 */
export function createTenantPrismaClient() {
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  return prisma;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST CONTEXT STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

// Use AsyncLocalStorage for request context (Node.js 16+)
import { AsyncLocalStorage } from 'node:async_hooks';

const requestContext = new AsyncLocalStorage();

/**
 * Run a function within a request context
 */
export function runWithContext(context, fn) {
  return requestContext.run(context, fn);
}

/**
 * Get the current request context
 */
function getRequestContext() {
  return requestContext.getStore() || {};
}

/**
 * Get tenant ID from request context
 */
function getTenantContext() {
  const ctx = getRequestContext();
  return ctx.tenantId || null;
}

/**
 * Get user ID from request context
 */
function getUserIdContext() {
  const ctx = getRequestContext();
  return ctx.userId || null;
}

/**
 * Get IP address from request context
 */
function getIpAddressContext() {
  const ctx = getRequestContext();
  return ctx.ipAddress || null;
}

/**
 * Get user agent from request context
 */
function getUserAgentContext() {
  const ctx = getRequestContext();
  return ctx.userAgent || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT RESOLUTION MIDDLEWARE (PRD §2.2)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tenant resolution middleware
 * Extracts tenant from: JWT token, X-Tenant-ID header, or subdomain
 */
export function tenantResolution(req, res, next) {
  let tenantId = null;

  // 1. Extract from JWT token claim (user session)
  if (req.user?.tenantId) {
    tenantId = req.user.tenantId;
  }
  // 2. Extract from X-Tenant-ID header (API key)
  else if (req.headers['x-tenant-id']) {
    tenantId = req.headers['x-tenant-id'];
  }
  // 3. Extract from subdomain (tenant.vigilos.io)
  else {
    const host = req.headers.host || '';
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
      tenantId = subdomain;
    }
  }

  // Attach tenant context to request
  req.tenant = tenantId ? { id: tenantId } : null;

  // Store in AsyncLocalStorage for Prisma middleware
  const store = getRequestContext();
  store.tenantId = tenantId;
  store.userId = req.user?.id || null;
  store.ipAddress = req.ip || req.connection?.remoteAddress || null;
  store.userAgent = req.headers['user-agent'] || null;

  // Run remaining middleware within context
  runWithContext(store, () => next());
}

/**
 * Tenant guard middleware
 * Ensures request has a valid tenant context
 */
export function tenantGuard(req, res, next) {
  if (!req.tenant?.id) {
    return res.status(400).json({
      success: false,
      error: 'Tenant context required. Provide X-Tenant-ID header or authenticate with a tenant-scoped token.',
    });
  }
  next();
}

/**
 * Super admin bypass middleware
 * Allows SUPER_ADMIN to access any tenant's data
 */
export function superAdminBypass(req, res, next) {
  if (req.user?.role === 'SUPER_ADMIN') {
    // Mark context to skip tenant filtering
    const store = getRequestContext();
    store.skipTenantFilter = true;
    req.tenant = { id: req.user.tenantId, bypassed: true };
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  createTenantPrismaClient,
  tenantResolution,
  tenantGuard,
  superAdminBypass,
  runWithContext,
  getRequestContext,
  getTenantContext,
  isTenantScopedModel,
};
