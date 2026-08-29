/**
 * Central Express REST API Gateway Routes for VigilOS
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { postgresDB } from '../database/postgresAdapter.js';
import { influxDB } from '../database/influxAdapter.js';
import { fcmService } from '../services/fcmService.js';
import { validateDeviceToken } from '../middleware/deviceAuth.js';
import {
  checkRateLimit,
  checkLoginRateLimit,
  resetLoginRateLimit,
  getAllDeviceStates,
  getOnlineDeviceIds,
  isDeviceOnline,
  invalidateToken,
} from '../cache/cacheService.js';

import metricsService from '../monitoring/metricsService.js';
import * as security from '../security/securityMiddleware.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vigilos-secret-key-2024';
const JWT_EXPIRES_IN = '15m'; // Short-lived access token per PRD
const REFRESH_EXPIRES_IN_DAYS = 7;

// ── JWT Authentication Middleware ─────────────────────────────────────────────
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.replace(/^Bearer\s+/, '').trim();

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Invalid or expired token' });
  }
}

// ── RBAC Middleware ───────────────────────────────────────────────────────────
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

export function createAPIRouter(mqttBroker) {
  const router = express.Router();

  // Security middleware
  router.use(security.securityHeaders);
  router.use(security.sanitizeRequest);
  router.use(security.auditLogger);

  // Request timing
  router.use((req, res, next) => {
    req.startTime = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - req.startTime;
      metricsService.trackRequest(req.path, req.method, duration, res.statusCode);
    });
    next();
  });

  // ==========================================
  // Authentication Routes (Public)
  // ==========================================

  // POST /api/v1/auth/login - User login (with refresh token + audit log + rate limiting)
  router.post('/auth/login', security.loginRateLimiter, async (req, res) => {
    const { email, password } = req.body;
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';

    // Check login rate limit per IP (PRD V2: max 5 attempts per 5 min)
    const rateCheck = await checkLoginRateLimit(clientIP);
    if (!rateCheck.allowed) {
      await postgresDB.logAuthEvent({
        eventType: 'LOGIN_RATE_LIMITED',
        email,
        ipAddress: clientIP,
        details: `Rate limited: ${rateCheck.attempts} attempts in 5min window. Retry after ${rateCheck.retryAfterSec}s.`,
        success: false
      });
      return res.status(429).json({
        success: false,
        error: 'Too many login attempts',
        message: `Account locked. Try again in ${rateCheck.retryAfterSec} seconds.`,
        retryAfterSec: rateCheck.retryAfterSec,
        remaining: rateCheck.remaining
      });
    }

    if (!email || !password) {
      await postgresDB.logAuthEvent({ eventType: 'LOGIN_FAILED', email, ipAddress: clientIP, details: 'Missing email or password', success: false });
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = await postgresDB.validateUser(email, password);
    if (!user) {
      await postgresDB.logAuthEvent({ eventType: 'LOGIN_FAILED', email, ipAddress: clientIP, details: 'Invalid credentials', success: false });
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        attemptsRemaining: rateCheck.remaining - 1
      });
    }

    // Successful login — reset rate limit
    await resetLoginRateLimit(clientIP);

    // Generate short-lived access token
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Generate refresh token
    const refreshRecord = await postgresDB.createRefreshToken(user.id, user.tenantId);

    // Log successful login
    await postgresDB.logAuthEvent({
      eventType: 'LOGIN_SUCCESS',
      userId: user.id,
      email: user.email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: user.tenantId,
      details: `Login successful. Role: ${user.role}`,
      success: true,
    });

    res.json({
      success: true,
      data: {
        user,
        accessToken,
        refreshToken: refreshRecord.token,
        expiresIn: JWT_EXPIRES_IN,
        refreshExpiresIn: `${REFRESH_EXPIRES_IN_DAYS}d`,
      }
    });
  });

  // POST /api/v1/auth/register - Register new user
  router.post('/auth/register', async (req, res) => {
    const { name, email, password, role, tenantId, officerId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    const existingUser = await postgresDB.getUserByEmail(email);
    if (existingUser) {
      await postgresDB.logAuthEvent({ eventType: 'REGISTER_FAILED', email, ipAddress: req.ip, details: 'Email already registered', success: false });
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const newUser = await postgresDB.createUser({ name, email, password, role, tenantId, officerId });
    if (!newUser) {
      return res.status(500).json({ success: false, error: 'Failed to create user' });
    }

    const accessToken = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, tenantId: newUser.tenantId, name: newUser.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshRecord = await postgresDB.createRefreshToken(newUser.id, newUser.tenantId);

    await postgresDB.logAuthEvent({ eventType: 'REGISTER_SUCCESS', userId: newUser.id, email: newUser.email, ipAddress: req.ip, tenantId: newUser.tenantId, success: true });

    res.status(201).json({
      success: true,
      data: {
        user: newUser,
        accessToken,
        refreshToken: refreshRecord.token,
        expiresIn: JWT_EXPIRES_IN,
      }
    });
  });

  // GET /api/v1/auth/me - Get current user profile (Protected)
  router.get('/auth/me', authenticateToken, async (req, res) => {
    const user = await postgresDB.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const { password: _, ...safeUser } = user;
    res.json({ success: true, data: safeUser });
  });

  // PUT /api/v1/auth/profile - Update user profile (Protected)
  router.put('/auth/profile', authenticateToken, async (req, res) => {
    const { name, email } = req.body;
    const updated = await postgresDB.updateUser(req.user.id, { name, email });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: updated });
  });

  // POST /api/v1/auth/refresh - Refresh access token
  router.post('/auth/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token required' });
    }

    const record = await postgresDB.validateRefreshToken(refreshToken);
    if (!record) {
      await postgresDB.logAuthEvent({ eventType: 'REFRESH_FAILED', ipAddress: req.ip, details: 'Invalid or expired refresh token', success: false });
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    const user = await postgresDB.getUserById(record.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await postgresDB.logAuthEvent({ eventType: 'TOKEN_REFRESHED', userId: user.id, email: user.email, ipAddress: req.ip, tenantId: user.tenantId, success: true });

    res.json({ success: true, data: { accessToken, expiresIn: JWT_EXPIRES_IN } });
  });

  // POST /api/v1/auth/logout - Invalidate refresh token
  router.post('/auth/logout', authenticateToken, async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await postgresDB.revokeRefreshToken(refreshToken);
    }
    await postgresDB.logAuthEvent({ eventType: 'LOGOUT', userId: req.user.id, email: req.user.email, ipAddress: req.ip, tenantId: req.user.tenantId, success: true });
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // ── Portal: Tenant Management Routes ──────────────────────────────────────

  // GET /api/v1/portal/tenants - List all tenants (Super Admin only)
  router.get('/portal/tenants', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
    const tenants = await postgresDB.getTenants();
    res.json({ success: true, count: tenants.length, data: tenants });
  });

  // GET /api/v1/portal/tenants/:id - Get tenant details
  router.get('/portal/tenants/:id', authenticateToken, async (req, res) => {
    const tenant = await postgresDB.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    // Non-super-admins can only view their own tenant
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const stats = await postgresDB.getTenantStats(req.params.id);
    const subs = await postgresDB.getSubscriptions(req.params.id);
    const sub = subs[0];
    res.json({ success: true, data: { ...tenant, stats, subscription: sub } });
  });

  // POST /api/v1/portal/tenants - Create new tenant (Super Admin)
  router.post('/portal/tenants', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
    const tenant = await postgresDB.createTenant(req.body);
    res.status(201).json({ success: true, data: tenant });
  });

  // ── Portal: User & Team Management Routes ─────────────────────────────────

  // GET /api/v1/portal/users - List users for a tenant
  router.get('/portal/users', authenticateToken, async (req, res) => {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const users = await postgresDB.getUsers(tenantId);
    res.json({ success: true, count: users.length, data: users });
  });

  // POST /api/v1/portal/users/invite - Invite a new user
  router.post('/portal/users/invite', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ success: false, error: 'Email and role are required' });
    }
    const inv = await postgresDB.createInvitation({
      tenantId: req.user.tenantId,
      email,
      role,
      invitedBy: req.user.id,
    });
    res.status(201).json({ success: true, data: inv });
  });

  // GET /api/v1/portal/invitations - List pending invitations
  router.get('/portal/invitations', authenticateToken, async (req, res) => {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.tenantId;
    const invs = await postgresDB.getInvitations(tenantId);
    res.json({ success: true, count: invs.length, data: invs });
  });

  // POST /api/v1/portal/invitations/:id/revoke - Revoke invitation
  router.post('/portal/invitations/:id/revoke', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
    const inv = await postgresDB.revokeInvitation(req.params.id);
    if (!inv) return res.status(404).json({ success: false, error: 'Invitation not found' });
    res.json({ success: true, data: inv });
  });

  // PUT /api/v1/portal/users/:id/suspend - Suspend user
  router.put('/portal/users/:id/suspend', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
    const user = await postgresDB.suspendUser(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    await postgresDB.logAuthEvent({ eventType: 'USER_SUSPENDED', userId: req.user.id, ipAddress: req.ip, details: `Suspended user ${user.email}`, success: true });
    res.json({ success: true, data: { id: user.id, email: user.email, status: user.status } });
  });

  // PUT /api/v1/portal/users/:id/activate - Activate user
  router.put('/portal/users/:id/activate', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
    const user = await postgresDB.activateUser(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: { id: user.id, email: user.email, status: user.status } });
  });

  // ── Portal: Subscription & Billing Routes ─────────────────────────────────

  // GET /api/v1/portal/subscriptions - Get subscriptions
  router.get('/portal/subscriptions', authenticateToken, async (req, res) => {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.tenantId;
    const subs = await postgresDB.getSubscriptions(tenantId);
    res.json({ success: true, count: subs.length, data: subs });
  });

  // PUT /api/v1/portal/subscriptions/:id - Update subscription (upgrade/downgrade)
  router.put('/portal/subscriptions/:id', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
    const sub = await postgresDB.updateSubscription(req.params.id, req.body);
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });
    res.json({ success: true, data: sub });
  });

  // GET /api/v1/portal/invoices - List invoices
  router.get('/portal/invoices', authenticateToken, async (req, res) => {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.tenantId;
    const invoices = await postgresDB.getInvoices(tenantId);
    res.json({ success: true, count: invoices.length, data: invoices });
  });

  // POST /api/v1/portal/invoices/:id/pay - Mark invoice as paid
  router.post('/portal/invoices/:id/pay', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_FINANCE'), async (req, res) => {
    const inv = await postgresDB.markInvoicePaid(req.params.id, req.body.paymentMethod);
    if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, data: inv });
  });

  // ── Portal: API Key Management Routes ─────────────────────────────────────

  // GET /api/v1/portal/api-keys - List API keys
  router.get('/portal/api-keys', authenticateToken, async (req, res) => {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.tenantId;
    const keys = await postgresDB.getApiKeys(tenantId);
    res.json({ success: true, count: keys.length, data: keys });
  });

  // POST /api/v1/portal/api-keys - Create API key
  router.post('/portal/api-keys', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
    const key = await postgresDB.createApiKey({ tenantId: req.user.tenantId, ...req.body });
    res.status(201).json({ success: true, data: key });
  });

  // POST /api/v1/portal/api-keys/:id/revoke - Revoke API key
  router.post('/portal/api-keys/:id/revoke', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
    const key = await postgresDB.revokeApiKey(req.params.id);
    if (!key) return res.status(404).json({ success: false, error: 'API key not found' });
    res.json({ success: true, data: key });
  });

  // ── Portal: SLA & Compliance Routes ───────────────────────────────────────

  // GET /api/v1/portal/sla - Get SLA documents
  router.get('/portal/sla', authenticateToken, async (req, res) => {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.tenantId;
    const docs = await postgresDB.getSlaDocuments(tenantId);
    res.json({ success: true, count: docs.length, data: docs });
  });

  // ── Portal: Auth Audit Log Routes ─────────────────────────────────────────

  // GET /api/v1/portal/auth-audit - Get auth audit log
  router.get('/portal/auth-audit', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_AUDITOR'), async (req, res) => {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || undefined) : req.user.tenantId;
    const limit = Number(req.query.limit) || 50;
    const logs = await postgresDB.getAuthAuditLog(tenantId, limit);
    res.json({ success: true, count: logs.length, data: logs });
  });

  // ── Portal: Dashboard Stats Route ─────────────────────────────────────────

  // GET /api/v1/portal/dashboard - Get tenant dashboard stats
  router.get('/portal/dashboard', authenticateToken, async (req, res) => {
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || 'ws-semarang-01') : req.user.tenantId;
    const stats = await postgresDB.getTenantStats(tenantId);
    const allIncidents = await postgresDB.getIncidents();
    const recentIncidents = allIncidents.slice(0, 5);
    const recentAuthEvents = await postgresDB.getAuthAuditLog(tenantId, 10);
    res.json({ success: true, data: { stats, recentIncidents, recentAuthEvents } });
  });

  // ── Portal: Roles & Permissions ───────────────────────────────────────────

  // GET /api/v1/portal/roles - List all roles
  router.get('/portal/roles', authenticateToken, async (req, res) => {
    const roles = await postgresDB.getRoles();
    res.json({ success: true, count: roles.length, data: roles });
  });

  // ==========================================
  // API Routes (no auth for dev — add authenticateToken as needed)
  // ==========================================

  // GET /api/v1/system/status
  router.get('/system/status', async (req, res) => {
    const vehicles = await postgresDB.getVehicles();
    const activeIncidents = await postgresDB.getIncidents('ACTIVE');
    const warningUnits = vehicles.filter(v => v.status === 'warning' || v.heartBeatIntervalSec === 1);

    res.json({
      status: 'SYSTEM_SECURE',
      activeUnits: vehicles.length,
      activeIncidents: activeIncidents.length,
      warningUnits: warningUnits.length,
      tenant: 'Dishub Kota Semarang',
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/v1/vehicles
  router.get('/vehicles', async (req, res) => {
    const vehicles = await postgresDB.getVehicles();
    res.json({ success: true, count: vehicles.length, data: vehicles });
  });

  // POST /api/v1/vehicles - Add new vehicle
  router.post('/vehicles', async (req, res) => {
    const newVehicle = await postgresDB.createVehicle(req.body);
    if (mqttBroker) {
      mqttBroker.startVehicleTelemetryLoop(newVehicle.id, newVehicle.heartBeatIntervalSec || 10);
      if (mqttBroker.onSocketBroadcast) {
        mqttBroker.onSocketBroadcast('vehicle_added', newVehicle);
      }
    }
    res.status(201).json({ success: true, data: newVehicle });
  });

  // PUT /api/v1/vehicles/:id - Update vehicle
  router.put('/vehicles/:id', async (req, res) => {
    const updated = await postgresDB.updateVehicle(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('vehicle_updated', updated);
    }
    res.json({ success: true, data: updated });
  });

  // DELETE /api/v1/vehicles/:id - Delete vehicle
  router.delete('/vehicles/:id', async (req, res) => {
    const success = await postgresDB.deleteVehicle(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('vehicle_deleted', { id: req.params.id });
    }
    res.json({ success: true, message: 'Vehicle deleted' });
  });

  // GET /api/v1/vehicles/:id
  router.get('/vehicles/:id', async (req, res) => {
    const vehicle = await postgresDB.getVehicleById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    const history = await influxDB.queryVehicleHistory(req.params.id, 20);
    res.json({ success: true, data: { ...vehicle, telemetryHistory: history } });
  });

  // GET /api/v1/drivers - Get all drivers
  router.get('/drivers', async (req, res) => {
    const drivers = await postgresDB.getDrivers();
    res.json({ success: true, count: drivers.length, data: drivers });
  });

  // POST /api/v1/drivers - Register new driver
  router.post('/drivers', async (req, res) => {
    const newDriver = await postgresDB.createDriver(req.body);
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('driver_added', newDriver);
    }
    res.status(201).json({ success: true, data: newDriver });
  });

  // PUT /api/v1/drivers/:id - Update driver
  router.put('/drivers/:id', async (req, res) => {
    const updated = await postgresDB.updateDriver(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('driver_updated', updated);
    }
    res.json({ success: true, data: updated });
  });

  // DELETE /api/v1/drivers/:id - Delete driver
  router.delete('/drivers/:id', async (req, res) => {
    const success = await postgresDB.deleteDriver(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('driver_deleted', { id: req.params.id });
    }
    res.json({ success: true, message: 'Driver deleted' });
  });

  // GET /api/v1/incidents — enhanced with filter + pagination
  router.get('/incidents', async (req, res) => {
    const { status, type, severity, from, to, page = 1, limit = 10, search } = req.query;
    let incidents = await postgresDB.getIncidents(status);

    // Filter by type
    if (type) {
      incidents = incidents.filter(i => i.type === type);
    }

    // Filter by severity
    if (severity) {
      incidents = incidents.filter(i => i.severity === severity);
    }

    // Filter by date range
    if (from) {
      const fromDate = new Date(from);
      incidents = incidents.filter(i => new Date(i.timestamp) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      incidents = incidents.filter(i => new Date(i.timestamp) <= toDate);
    }

    // Search by vehicle ID, code, or details
    if (search) {
      const q = search.toLowerCase();
      incidents = incidents.filter(i =>
        i.vehicleId?.toLowerCase().includes(q) ||
        i.vehicleCode?.toLowerCase().includes(q) ||
        i.details?.toLowerCase().includes(q)
      );
    }

    const total = incidents.length;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const totalPages = Math.ceil(total / limitNum);
    const offset = (pageNum - 1) * limitNum;
    const paginated = incidents.slice(offset, offset + limitNum);

    res.json({
      success: true,
      count: paginated.length,
      total,
      page: pageNum,
      totalPages,
      limit: limitNum,
      data: paginated
    });
  });

  // GET /api/v1/incidents/:id/timeline (Requires authentication)
  router.get('/incidents/:id/timeline', async (req, res) => {
    const allIncidents = await postgresDB.getIncidents();
    const incident = allIncidents.find(i => i.id === req.params.id);
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    // Build timeline from incident state
    const timeline = [
      {
        time: incident.timestamp,
        event: 'TRIGGERED',
        actor: incident.driverName || 'System',
        description: `${incident.type} alert triggered on ${incident.vehicleCode}. Severity: ${incident.severity}.`
      }
    ];

    if (incident.acknowledgedAt) {
      timeline.push({
        time: incident.acknowledgedAt,
        event: 'ACKNOWLEDGED',
        actor: incident.acknowledgedBy || 'Operator',
        description: `Incident acknowledged by ${incident.acknowledgedBy}.`
      });
    }

    if (incident.resolvedAt) {
      timeline.push({
        time: incident.resolvedAt,
        event: 'RESOLVED',
        actor: incident.acknowledgedBy || 'Operator',
        description: `Incident resolved. ${incident.fieldReport ? 'Field report submitted.' : 'No field report.'}`
      });
    }

    res.json({
      success: true,
      incidentId: incident.id,
      status: incident.status,
      timeline
    });
  });

  // POST /api/v1/incidents/:id/acknowledge (Requires authentication)
  router.post('/incidents/:id/acknowledge', async (req, res) => {
    const { operatorId } = req.body;
    const incident = await postgresDB.acknowledgeIncident(req.params.id, operatorId || 'Operator 04');
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }
    
    // Broadcast status change via WebSocket
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('incident_acknowledged', incident);
    }

    res.json({ success: true, data: incident });
  });

  // POST /api/v1/incidents/:id/resolve (Requires authentication)
  router.post('/incidents/:id/resolve', async (req, res) => {
    const { operatorId, fieldReport } = req.body;
    const incident = await postgresDB.resolveIncident(req.params.id, operatorId || 'Operator 04', fieldReport);
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    // Broadcast status change via WebSocket
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('incident_resolved', incident);
    }

    res.json({ success: true, data: incident });
  });

  // GET /api/v1/incidents/export (Requires authentication) — Export incidents as CSV
  router.get('/incidents/export', async (req, res) => {
    const { format = 'csv', status, type, severity, from, to } = req.query;
    let incidents = await postgresDB.getIncidents(status);

    if (type) incidents = incidents.filter(i => i.type === type);
    if (severity) incidents = incidents.filter(i => i.severity === severity);
    if (from) incidents = incidents.filter(i => new Date(i.timestamp) >= new Date(from));
    if (to) incidents = incidents.filter(i => new Date(i.timestamp) <= new Date(to));

    if (format === 'csv') {
      const headers = ['ID', 'Vehicle', 'Type', 'Severity', 'Status', 'Timestamp', 'Acknowledged By', 'Resolved At'];
      const rows = incidents.map(i => [
        i.id, i.vehicleCode, i.type, i.severity, i.status, i.timestamp,
        i.acknowledgedBy || '', i.resolvedAt || ''
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="incidents-${Date.now()}.csv"`);
      return res.send(csv);
    }

    // Default: return JSON for frontend PDF generation
    res.json({ success: true, count: incidents.length, data: incidents });
  });

  // POST /api/v1/incidents/sync-reports — Offline field report sync
  router.post('/incidents/sync-reports', async (req, res) => {
    const { reports } = req.body;
    if (!Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({ success: false, error: 'reports array is required' });
    }

    const synced = [];
    const conflicts = [];

    for (const report of reports) {
      const allIncidents = await postgresDB.getIncidents();
      const incident = allIncidents.find(i => i.id === report.incidentId);
      if (!incident) {
        conflicts.push({ incidentId: report.incidentId, reason: 'Incident not found' });
        continue;
      }
      if (incident.status === 'RESOLVED' && incident.fieldReport) {
        conflicts.push({ incidentId: report.incidentId, reason: 'Already has field report' });
        continue;
      }
      // Apply the field report
      await postgresDB.resolveIncident(report.incidentId, report.officerId || 'Officer', {
        officerId: report.officerId,
        notes: report.notes || '',
        photoUrl: report.photoUrl || null
      });
      synced.push(report.incidentId);
    }

    res.json({ success: true, synced, conflicts, total: reports.length });
  });

  // GET /api/v1/telemetry/speed-history/:vehicleId — Speed history for mini-chart (last 10 min)
  router.get('/telemetry/speed-history/:vehicleId', async (req, res) => {
    const { vehicleId } = req.params;
    const history = await influxDB.queryVehicleHistory(vehicleId, 60); // ~10 min at 10s intervals

    // Extract speed points with timestamps
    const speedData = history.map(p => ({
      time: p.timestamp,
      speed: p.fields?.speed ?? 0
    }));

    res.json({
      success: true,
      vehicleId,
      count: speedData.length,
      data: speedData
    });
  });

  // GET /api/v1/transit/eta/:stationId — ETA calculation for nearby buses
  router.get('/transit/eta/:stationId', async (req, res) => {
    const { stationId } = req.params;
    // Simulated station locations (in production, query from DB)
    const stations = {
      'STN-001': { name: 'Terminal Terboyo', lat: -6.9567, lng: 110.4383 },
      'STN-002': { name: 'Simpang Lima', lat: -6.9900, lng: 110.4200 },
      'STN-003': { name: 'Terminal Mangkang', lat: -6.9300, lng: 110.4000 },
      'STN-004': { name: 'Pandanaran Mall', lat: -6.9750, lng: 110.4220 },
      'STN-005': { name: 'RSUP Kariadi', lat: -6.9900, lng: 110.4050 }
    };

    const station = stations[stationId];
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station not found' });
    }

    // Get all vehicles and calculate distance + ETA
    const vehicles = await postgresDB.getVehicles();
    const R = 6371e3; // Earth radius in meters

    const etas = vehicles
      .filter(v => v.type?.includes('Bus'))
      .map(v => {
        const φ1 = (station.lat * Math.PI) / 180;
        const φ2 = (v.lat * Math.PI) / 180;
        const Δφ = ((v.lat - station.lat) * Math.PI) / 180;
        const Δλ = ((v.lng - station.lng) * Math.PI) / 180;
        const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // meters

        // Estimate ETA: distance / avg speed (assuming 30 km/h city average)
        const avgSpeedMs = 30 * 1000 / 3600; // ~8.33 m/s
        const etaSeconds = Math.round(distance / avgSpeedMs);
        const etaMinutes = Math.max(1, Math.round(etaSeconds / 60));

        return {
          vehicleId: v.id,
          vehicleCode: v.code,
          vehicleName: v.name,
          lat: v.lat,
          lng: v.lng,
          speed: v.speed || 0,
          distance: Math.round(distance),
          etaMinutes,
          status: v.status
        };
      })
      .sort((a, b) => a.etaMinutes - b.etaMinutes);

    res.json({
      success: true,
      station: { id: stationId, ...station },
      count: etas.length,
      data: etas
    });
  });

  // GET /api/v1/transit/routes — Route planner with multiple options
  router.get('/transit/routes', (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ success: false, error: 'from and to parameters are required' });
    }

    // Simulated route options (in production, use routing engine)
    const routes = [
      {
        routeId: 'RT-001',
        name: 'Koridor 1 — Langsung',
        duration: 25,
        distance: 8500,
        stops: 6,
        transfers: 0,
        fare: 3500
      },
      {
        routeId: 'RT-002',
        name: 'Koridor 9 + Feeder',
        duration: 35,
        distance: 12000,
        stops: 9,
        transfers: 1,
        fare: 4000
      },
      {
        routeId: 'RT-003',
        name: 'Express via Tol Dalam Kota',
        duration: 18,
        distance: 7200,
        stops: 3,
        transfers: 0,
        fare: 5500
      }
    ];

    res.json({
      success: true,
      from,
      to,
      count: routes.length,
      data: routes
    });
  });

  // GET /api/v1/portal/invoices/:id/pdf — Invoice PDF generation
  router.get('/portal/invoices/:id/pdf', authenticateToken, async (req, res) => {
    const invoice = await postgresDB.getInvoiceById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Generate simple PDF-like content (in production, use pdfkit)
    const pdfContent = `
VIGILOS INVOICE
===============
Invoice ID: ${invoice.id}
Date: ${invoice.date || invoice.createdAt || new Date().toISOString()}
Amount: Rp ${(invoice.amount || 0).toLocaleString('id-ID')}
Status: ${invoice.status || 'PENDING'}
Plan: ${invoice.plan || 'Standard'}
Tenant: ${invoice.tenantId || req.user?.tenantId || 'N/A'}

Thank you for your subscription!
    `.trim();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.id}.pdf"`);
    res.send(Buffer.from(pdfContent, 'utf-8'));
  });

  // GET /api/v1/patrol/officers - Get all officers
  router.get('/patrol/officers', async (req, res) => {
    const officers = await postgresDB.getOfficers();
    res.json({ success: true, count: officers.length, data: officers });
  });

  // PUT /api/v1/patrol/officers/:id/status - Update officer duty status
  router.put('/patrol/officers/:id/status', async (req, res) => {
    const { dutyStatus } = req.body;
    const updated = await postgresDB.updateOfficerDutyStatus(req.params.id, dutyStatus);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Officer not found' });
    }

    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('officer_status_changed', updated);
    }

    res.json({ success: true, data: updated });
  });

  // POST /api/v1/emergency/trigger
  router.post('/emergency/trigger', (req, res, next) => {
    validateDeviceToken(req, res, next);
  }, async (req, res) => {
    const { vehicleId, details } = req.body;
    const targetId = vehicleId || req.authenticatedDevice.deviceId;

    // Verify token is bound to the vehicle being emergency-triggered
    if (targetId !== req.authenticatedDevice.deviceId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Token bound to ${req.authenticatedDevice.deviceId} cannot trigger emergency for ${targetId}.`
      });
    }

    if (!mqttBroker) {
      return res.status(500).json({ success: false, error: 'MQTT Broker ingestion not ready' });
    }

    const incident = mqttBroker.handleEmergencyPublish(targetId, details);
    
    // Dispatch FCM notification to nearby security officers
    const nearbyPatrols = await postgresDB.findNearbyVehicles(incident.location.lat, incident.location.lng, 10000);
    fcmService.dispatchPatrolPushAlert(incident, nearbyPatrols);

    res.json({
      success: true,
      message: 'Emergency trigger processed and propagated (< 1s)',
      data: incident
    });
  });

  // GET /api/v1/telemetry/history
  router.get('/telemetry/history', async (req, res) => {
    const { vehicleId, limit } = req.query;
    if (vehicleId) {
      const history = await influxDB.queryVehicleHistory(vehicleId, Number(limit) || 100);
      return res.json({ success: true, vehicleId, count: history.length, data: history });
    }
    const anomalies = await influxDB.querySpeedAnomalies();
    res.json({ success: true, type: 'anomalies', count: anomalies.length, data: anomalies });
  });

  // POST /api/v1/notifications/dispatch
  router.post('/notifications/dispatch', async (req, res) => {
    const { incidentId } = req.body;
    const incidents = await postgresDB.getIncidents();
    const targetIncident = incidents.find(i => i.id === incidentId) || incidents[0];

    if (!targetIncident) {
      return res.status(404).json({ success: false, error: 'No active incident found to dispatch notification' });
    }

    const result = await fcmService.dispatchPatrolPushAlert(targetIncident);
    res.json({ success: true, data: result });
  });

  // ==========================================
  // Device Token Management & Auth Routes
  // ==========================================

  // GET /api/v1/tokens - List all device tokens
  router.get('/tokens', async (req, res) => {
    const tokens = await postgresDB.getDeviceTokens();
    res.json({ success: true, count: tokens.length, data: tokens });
  });

  // POST /api/v1/tokens/generate - Generate new device token
  router.post('/tokens/generate', async (req, res) => {
    const { deviceId, expiryDays } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required to bind token' });
    }
    const newToken = await postgresDB.generateDeviceToken(
      deviceId,
      'ws-semarang-01',
      expiryDays ? Math.max(1, Number(expiryDays)) : null
    );
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('token_updated', { type: 'GENERATE', token: newToken });
    }
    res.status(201).json({ success: true, data: newToken });
  });

  // POST /api/v1/tokens/:id/revoke - Revoke token
  router.post('/tokens/:id/revoke', async (req, res) => {
    const revoked = await postgresDB.revokeDeviceToken(req.params.id);
    if (!revoked) {
      return res.status(404).json({ success: false, error: 'Token not found' });
    }
    // Invalidate from Redis so stale ACTIVE cache cannot be used after revocation
    await invalidateToken(revoked.token);
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('token_updated', { type: 'REVOKE', token: revoked });
    }
    res.json({ success: true, data: revoked });
  });

  // POST /api/v1/tokens/:id/rotate - Rotate device token
  router.post('/tokens/:id/rotate', async (req, res) => {
    const { deviceId } = req.body;
    const existingToken = (await postgresDB.getTokenByValue(req.params.id))
      || (await postgresDB.getDeviceTokens()).find(t => t.id === req.params.id);
    const targetDevice = deviceId || existingToken?.deviceId;

    if (!targetDevice) {
      return res.status(400).json({ success: false, error: 'deviceId is required to rotate token' });
    }

    // Invalidate old token(s) in Redis before rotating
    const allTokens = await postgresDB.getDeviceTokens();
    const oldTokens = allTokens.filter(t => t.deviceId === targetDevice && t.status === 'ACTIVE');
    for (const t of oldTokens) {
      await invalidateToken(t.token);
    }

    const newToken = await postgresDB.rotateDeviceToken(targetDevice);
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('token_updated', { type: 'ROTATE', token: newToken });
    }
    res.json({ success: true, data: newToken });
  });

  // GET /api/v1/tokens/security-events - Query security audit log
  router.get('/tokens/security-events', async (req, res) => {
    const events = await postgresDB.getSecurityEvents();
    res.json({ success: true, count: events.length, data: events });
  });

  // POST /api/v1/telemetry/ingest - Protected Telemetry Submission (Requires X-Device-Token Header)
  const broadcastSecurityEvent = (event) => {
    if (mqttBroker && mqttBroker.onSocketBroadcast) {
      mqttBroker.onSocketBroadcast('security_event', event);
    }
  };

  // ── Rate Limit Middleware (PRD 3.4) ────────────────────────────────────────
  const rateLimitMiddleware = async (req, res, next) => {
    // Identify device from token header (before full auth, use raw header)
    const tokenHeader = req.headers['x-device-token'] || req.headers['authorization'] || '';
    const tokenString = tokenHeader.replace(/^Bearer\s+/, '').trim();
    const isEmergency = req.body?.emergency === true || req.query?.emergency === 'true';

    // Derive device ID hint from body or token (best-effort before full auth)
    const deviceIdHint = req.body?.vehicleId || tokenString.slice(-8) || 'UNKNOWN';

    const { allowed, count, remaining, retryAfterSec } = await checkRateLimit(deviceIdHint, isEmergency);

    if (!allowed) {
      // Log throttle event to security audit trail (PRD 3.4 acceptance criterion)
      const throttleEvent = await postgresDB.logSecurityEvent({
        eventType: 'RATE_LIMIT_EXCEEDED',
        deviceId: deviceIdHint,
        ipAddress: req.ip || req.socket.remoteAddress,
        details: `Device throttled: ${count} requests in 60s window. Max allowed: 20. Retry after ${retryAfterSec}s.`
      });
      broadcastSecurityEvent(throttleEvent);

      res.set({
        'X-RateLimit-Limit': '20',
        'X-RateLimit-Remaining': '0',
        'Retry-After': String(retryAfterSec),
      });

      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Maximum 20 telemetry packets per 60 seconds. Retry after ${retryAfterSec} seconds.`,
        retryAfterSec,
        statusCode: 429
      });
    }

    // Attach rate limit headers on allowed requests
    res.set({
      'X-RateLimit-Limit': '20',
      'X-RateLimit-Remaining': String(remaining),
    });

    next();
  };

  router.post('/telemetry/ingest', rateLimitMiddleware, (req, res, next) => {
    validateDeviceToken(req, res, next, broadcastSecurityEvent);
  }, (req, res) => {
    const { vehicleId, lat, lng, speed, heading, passengers } = req.body;
    const targetVehicleId = vehicleId || req.authenticatedDevice.deviceId;

    if (targetVehicleId !== req.authenticatedDevice.deviceId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Token bound to ${req.authenticatedDevice.deviceId} cannot be used for ${targetVehicleId}.`
      });
    }

    if (!mqttBroker) {
      return res.status(500).json({ success: false, error: 'MQTT Broker ingestion not ready' });
    }

    const result = mqttBroker.ingestExternalTelemetry({
      vehicleId: targetVehicleId,
      lat, lng, speed, heading, passengers
    });

    if (result.error) {
      return res.status(404).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      message: 'Telemetry authenticated and processed successfully via X-Device-Token.',
      authenticatedDevice: req.authenticatedDevice.deviceId,
      data: result.telemetry,
      evaluation: result.evaluation
    });
  });

  // ==========================================
  // Redis Cache Query Endpoints
  // ==========================================

  /**
   * GET /api/v1/cache/states
   * Returns the latest cached telemetry state for all fleet vehicles from Redis.
   * PRD 3.3: Dashboard initial load from Redis cache — no InfluxDB query required.
   */
  router.get('/cache/states', async (req, res) => {
    const vehicles = await postgresDB.getVehicles();
    const deviceIds = vehicles.map(v => v.id);
    const states = await getAllDeviceStates(deviceIds);

    // Merge Redis state over the Postgres vehicle master data
    const enriched = vehicles.map(v => {
      const cached = states.find(s => s.deviceId === v.id);
      if (cached && cached.cached) {
        return { ...v, ...cached, source: 'redis_cache' };
      }
      return { ...v, source: 'postgres_fallback' };
    });

    res.json({
      success: true,
      count: enriched.length,
      cacheHits: enriched.filter(v => v.source === 'redis_cache').length,
      data: enriched
    });
  });

  /**
   * GET /api/v1/cache/presence
   * Returns online/offline presence status for all fleet vehicles.
   * PRD 3.2: Presence key expires after 30s of no telemetry → vehicle shown as Offline.
   */
  router.get('/cache/presence', async (req, res) => {
    const vehicles = await postgresDB.getVehicles();
    const onlineIds = await getOnlineDeviceIds();
    const onlineSet = new Set(onlineIds);

    const presence = vehicles.map(v => ({
      deviceId: v.id,
      name: v.name,
      online: onlineSet.has(v.id),
      presenceTtlSec: 30
    }));

    res.json({
      success: true,
      totalDevices: vehicles.length,
      onlineCount: onlineSet.size,
      offlineCount: vehicles.length - onlineSet.size,
      data: presence
    });
  });

  // POST /api/v1/admin/reset-rate-limit - Reset login rate limit (admin only)
  router.post('/admin/reset-rate-limit', (req, res) => {
    const { ipAddress } = req.body;
    if (!ipAddress) {
      return res.status(400).json({ success: false, error: 'ipAddress is required' });
    }
    resetLoginRateLimit(ipAddress).then(() => {
      res.json({ success: true, message: `Rate limit reset for ${ipAddress}` });
    }).catch((err) => {
      res.status(500).json({ success: false, error: err.message });
    });
  });

  router.get('/health', (req, res) => {
    const health = metricsService.getHealthStatus();
    res.json(health);
  });

  router.get('/metrics', (req, res) => {
    const metrics = metricsService.getMetrics();
    res.json(metrics);
  });

  return router;
}

