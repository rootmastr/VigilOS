/**
 * Central API Router — VigilOS V3
 * 
 * Combines all route modules and applies common middleware.
 * Implements tenant resolution, request context, and API quota enforcement.
 */

import express from 'express';
import { tenantResolution, tenantGuard, superAdminBypass } from '../../middleware/tenantIsolation.js';
import { authenticateToken } from '../../middleware/auth.js';
import { securityHeaders, sanitizeRequest, auditLogger } from '../../security/securityMiddleware.js';
import { quotaMiddleware } from '../../cache/tenantQuotaService.js';
import metricsService from '../../monitoring/metricsService.js';

// Route modules
import authRoutes from './auth.js';
import tenantRoutes from './tenants.js';
import billingRoutes from './billing.js';
import fleetRoutes from './fleet.js';
import incidentRoutes from './incidents.js';
import portalRoutes from './portal.js';
import systemRoutes from './system.js';
import tokenRoutes from './tokens.js';
import telemetryRoutes, { setMqttBroker as setTelemetryMqttBroker } from './telemetry.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

// Security headers
router.use(securityHeaders);
router.use(sanitizeRequest);
router.use(auditLogger);

// Request timing and metrics
router.use((req, res, next) => {
  req.startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    metricsService.trackRequest(req.path, req.method, duration, res.statusCode);
  });
  next();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES (No tenant context required)
// ═══════════════════════════════════════════════════════════════════════════════

// Health check
router.get('/health', (req, res) => {
  const health = metricsService.getHealthStatus();
  res.json(health);
});

// Metrics
router.get('/metrics', (req, res) => {
  const metrics = metricsService.getMetrics();
  res.json(metrics);
});

// System status
router.get('/system/status', (req, res) => {
  res.json({
    status: 'SYSTEM_SECURE',
    timestamp: new Date().toISOString(),
    version: '3.0.0',
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES (Public - no tenant context required)
// ═══════════════════════════════════════════════════════════════════════════════

router.use('/auth', authRoutes);

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT-SCOPED ROUTES (Require auth → tenant context → quota enforcement)
// ═══════════════════════════════════════════════════════════════════════════════

// Auth first → then tenant resolution (needs req.user.tenantId) → guard → quota
const protectedMiddleware = [authenticateToken, tenantResolution, superAdminBypass, tenantGuard, quotaMiddleware];

router.use('/tenants', ...protectedMiddleware, tenantRoutes);
router.use('/billing', ...protectedMiddleware, billingRoutes);
router.use('/fleet', ...protectedMiddleware, fleetRoutes);
router.use('/incidents', ...protectedMiddleware, incidentRoutes);
router.use('/portal', ...protectedMiddleware, portalRoutes);
router.use('/tokens', ...protectedMiddleware, tokenRoutes);
router.use('/system', systemRoutes);

// Telemetry & Emergency routes (IoT device auth via X-Device-Token)
router.use(telemetryRoutes);

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY ROUTES (Backward compatibility - will be deprecated)
// ═══════════════════════════════════════════════════════════════════════════════

// Redirect legacy routes to new structure
router.get('/vehicles', (req, res, next) => {
  req.url = '/fleet/vehicles';
  router.handle(req, res, next);
});

router.post('/vehicles', (req, res, next) => {
  req.url = '/fleet/vehicles';
  router.handle(req, res, next);
});

router.get('/drivers', (req, res, next) => {
  req.url = '/fleet/drivers';
  router.handle(req, res, next);
});

router.post('/drivers', (req, res, next) => {
  req.url = '/fleet/drivers';
  router.handle(req, res, next);
});

router.delete('/vehicles/:id', (req, res, next) => {
  req.url = `/fleet/vehicles/${req.params.id}`;
  router.handle(req, res, next);
});

router.delete('/drivers/:id', (req, res, next) => {
  req.url = `/fleet/drivers/${req.params.id}`;
  router.handle(req, res, next);
});

router.patch('/vehicles/:id', (req, res, next) => {
  req.url = `/fleet/vehicles/${req.params.id}`;
  router.handle(req, res, next);
});

router.put('/vehicles/:id/location', (req, res, next) => {
  req.url = `/fleet/vehicles/${req.params.id}/location`;
  router.handle(req, res, next);
});

// Export setMqttBroker for telemetry routes
export { setTelemetryMqttBroker as setMqttBroker };

export default router;
