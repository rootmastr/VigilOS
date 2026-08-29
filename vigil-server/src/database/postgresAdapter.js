/**
 * PostgreSQL Adapter — Delegates all operations to Prisma via DatabaseService.
 * No in-memory data stores. All reads/writes go directly to the database.
 */

import bcrypt from 'bcryptjs';
import { db } from '../services/databaseService.js';

class PostgresAdapter {
  // ── Authentication Methods ──────────────────────────────────────────────────

  async getUserByEmail(email) {
    return db.getUserByEmail(email);
  }

  async getUserById(id) {
    return db.getUserById(id);
  }

  async validateUser(email, password) {
    const user = await db.getUserByEmail(email);
    if (!user) return null;
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async createUser({ name, email, password, role, tenantId, officerId }) {
    const existing = await db.getUserByEmail(email);
    if (existing) return null;
    const newUser = await db.createUser({
      name,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role: role || 'PUBLIC_USER',
      tenantId: tenantId || 'ws-semarang-01',
      officerId: officerId || null,
    });
    const { passwordHash: _, ...safeUser } = newUser;
    return safeUser;
  }

  async updateUser(id, updates) {
    if (updates.password) delete updates.password;
    try {
      const updated = await db.updateUser(id, updates);
      const { passwordHash: _, ...safeUser } = updated;
      return safeUser;
    } catch {
      return null;
    }
  }

  // ── Vehicle Methods ─────────────────────────────────────────────────────────

  async getVehicles(tenantId) {
    if (tenantId) return db.listVehicles({ where: { tenantId }, take: 500 });
    return db.listVehicles({ take: 500 });
  }

  async getVehicleById(id) {
    const v = await db.getVehicleById(id);
    if (v) return v;
    // Fallback: try finding by code
    const all = await db.listVehicles({ take: 500 });
    return all.find(vehicle => vehicle.code === id) || null;
  }

  async createVehicle(data) {
    if (!data || !data.code || !data.name) return null;
    try {
      return await db.createVehicle({
        code: data.code,
        name: data.name,
        type: data.type || 'BUS',
        tenantId: data.tenantId || 'ws-semarang-01',
        driver: data.driver || 'UNASSIGNED',
        speedLimit: Number(data.speedLimit) || 50,
        lat: Number(data.lat) || -6.9666,
        lng: Number(data.lng) || 110.4196,
        speed: 0,
        heading: 0,
        status: 'ACTIVE',
        heartBeatIntervalSec: 10,
      });
    } catch {
      return null;
    }
  }

  async updateVehicle(id, updates) {
    try {
      return await db.updateVehicle(id, updates);
    } catch {
      return null;
    }
  }

  async deleteVehicle(id) {
    try {
      await db.deleteVehicle(id);
      return true;
    } catch {
      return false;
    }
  }

  // ── Driver Methods ──────────────────────────────────────────────────────────

  async getDrivers(tenantId = 'ws-semarang-01') {
    return db.listDrivers({ where: { tenantId }, take: 500 });
  }

  async getDriverById(id) {
    return db.getDriverById(id);
  }

  async createDriver(data) {
    try {
      const newDriver = await db.createDriver({
        name: data.name,
        vehicleId: data.vehicleId || null,
        licenseNo: data.licenseNo || `SIM-B2-${Math.floor(10000 + Math.random() * 90000)}`,
        phone: data.phone || '+62 812-0000-0000',
        safetyScore: Number(data.safetyScore) || 90,
        status: 'normal',
        trips: 0,
        hoursOnDuty: 0.0,
        tenantId: data.tenantId || 'ws-semarang-01',
      });

      if (data.vehicleId && data.vehicleId !== 'UNASSIGNED') {
        const v = await this.getVehicleById(data.vehicleId);
        if (v) await db.updateVehicle(data.vehicleId, { driver: newDriver.name });
      }

      return newDriver;
    } catch {
      return null;
    }
  }

  async updateDriver(id, updates) {
    try {
      return await db.updateDriver(id, updates);
    } catch {
      return null;
    }
  }

  async deleteDriver(id) {
    try {
      await db.deleteDriver(id);
      return true;
    } catch {
      return false;
    }
  }

  // ── Officer Methods ─────────────────────────────────────────────────────────

  async getOfficers(tenantId = 'ws-semarang-01') {
    return db.listOfficers({ where: { tenantId }, take: 500 });
  }

  async updateOfficerDutyStatus(id, dutyStatus) {
    try {
      return await db.updateOfficer(id, { dutyStatus, lastUpdated: new Date().toISOString() });
    } catch {
      return null;
    }
  }

  // ── Vehicle Status & Location ───────────────────────────────────────────────

  async updateVehicleStatus(id, status, heartBeatIntervalSec) {
    try {
      const data = { status };
      if (heartBeatIntervalSec) data.heartBeatIntervalSec = heartBeatIntervalSec;
      return await db.updateVehicle(id, data);
    } catch {
      return null;
    }
  }

  async updateVehicleLocation(id, { lat, lng, speed, heading, passengers }) {
    try {
      return await db.updateVehicle(id, { lat, lng, speed, heading });
    } catch {
      return null;
    }
  }

  // ── Incident Methods ────────────────────────────────────────────────────────

  async createIncidentRecord({ vehicleId, type, severity, location, details }) {
    if (!location || !location.lat || !location.lng) return null;
    try {
      const vehicle = await this.getVehicleById(vehicleId);
      return await db.createIncident({
        vehicleId: vehicleId || 'UNKNOWN',
        type: type || 'PANIC_BUTTON',
        severity: severity || 'CRITICAL',
        lat: location.lat,
        lng: location.lng,
        description: details || 'Emergency panic trigger activated from vehicle onboard unit.',
        status: 'OPEN',
      });
    } catch {
      return null;
    }
  }

  async acknowledgeIncident(incidentId, operatorId = 'Operator 04') {
    try {
      return await db.updateIncident(incidentId, {
        status: 'ACKNOWLEDGED',
        acknowledgedBy: operatorId,
        acknowledgedAt: new Date().toISOString(),
      });
    } catch {
      return null;
    }
  }

  async resolveIncident(incidentId, operatorId = 'Operator 04', fieldReport = null) {
    try {
      const update = {
        status: 'RESOLVED',
        resolvedAt: new Date().toISOString(),
      };
      const inc = await db.updateIncident(incidentId, update);
      if (inc) {
        const vehicle = await this.getVehicleById(inc.vehicleId);
        if (vehicle) {
          await db.updateVehicle(inc.vehicleId, { status: 'ACTIVE', heartBeatIntervalSec: 10 });
        }
      }
      return inc;
    } catch {
      return null;
    }
  }

  async getIncidents(status) {
    const where = {};
    if (status) where.status = status;
    return db.listIncidents({ where, take: 500 });
  }

  // ── Spatial Query (Haversine in JS — PostGIS not available) ─────────────────

  async findNearbyVehicles(lat, lng, radiusMeters = 5000) {
    const vehicles = await this.getVehicles();
    const R = 6371e3;
    return vehicles.filter(v => {
      if (!v.lat || !v.lng) return false;
      const φ1 = (lat * Math.PI) / 180;
      const φ2 = (v.lat * Math.PI) / 180;
      const Δφ = ((v.lat - lat) * Math.PI) / 180;
      const Δλ = ((v.lng - lng) * Math.PI) / 180;
      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return (R * c) <= radiusMeters;
    });
  }

  // ── Device Token Methods ────────────────────────────────────────────────────

  async getDeviceTokens(tenantId = 'ws-semarang-01') {
    return db.listDeviceTokens({ where: { tenantId }, take: 500 });
  }

  async getTokenByValue(tokenString) {
    return db.getDeviceTokenByHash(tokenString);
  }

  async generateDeviceToken(deviceId, tenantId = 'ws-semarang-01', expiryDays = null) {
    const hexChars = '0123456789abcdef';
    let randomHex = '';
    for (let i = 0; i < 32; i++) {
      randomHex += hexChars[Math.floor(Math.random() * 16)];
    }
    const tokenVal = `vgl_live_${randomHex}`;

    return db.createDeviceToken({
      deviceId,
      tokenHash: tokenVal,
      tenantId,
      status: 'ACTIVE',
      permissions: ['telemetry:read', 'telemetry:write'],
      expiresAt: expiryDays
        ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
        : null,
    });
  }

  async isTokenValid(tokenRecord) {
    if (!tokenRecord) return false;
    if (tokenRecord.status === 'REVOKED') return false;
    if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) <= new Date()) return false;
    return true;
  }

  async revokeDeviceToken(tokenId) {
    try {
      const updated = await db.updateDeviceToken(tokenId, {
        status: 'REVOKED',
        revokedAt: new Date().toISOString(),
      });
      if (updated) {
        this.logSecurityEvent({
          eventType: 'TOKEN_REVOKED',
          deviceId: updated.deviceId,
          details: `Device token ${tokenId} revoked by administrator.`,
        });
      }
      return updated;
    } catch {
      return null;
    }
  }

  async deleteDeviceToken(tokenId) {
    try {
      await db.deleteDeviceToken(tokenId);
      return true;
    } catch {
      return false;
    }
  }

  async rotateDeviceToken(deviceId, tenantId = 'ws-semarang-01') {
    // Revoke active tokens for this device
    const tokens = await this.getDeviceTokens(tenantId);
    for (const t of tokens) {
      if (t.deviceId === deviceId && t.status === 'ACTIVE') {
        await db.updateDeviceToken(t.id, { status: 'REVOKED', revokedAt: new Date().toISOString() });
      }
    }
    // Issue new token
    const newToken = await this.generateDeviceToken(deviceId, tenantId);
    await this.logSecurityEvent({
      eventType: 'TOKEN_ROTATED',
      deviceId,
      details: `Device token rotated for ${deviceId}. Issued new token ID ${newToken.id}.`,
    });
    return newToken;
  }

  // ── Security Event Methods ──────────────────────────────────────────────────

  async logSecurityEvent({ eventType, deviceId, ipAddress, details }) {
    return db.createSecurityEvent({
      eventType: eventType || 'UNAUTHORIZED_ACCESS_ATTEMPT',
      deviceId: deviceId || 'UNKNOWN_DEVICE',
      ipAddress: ipAddress || '127.0.0.1',
      tenantId: 'ws-semarang-01',
      details: details || 'Authentication failure: missing or invalid X-Device-Token header.',
    });
  }

  async getSecurityEvents(tenantId = 'ws-semarang-01') {
    return db.listSecurityEvents({ where: { tenantId }, take: 500 });
  }

  // ── Tenant Methods ──────────────────────────────────────────────────────────

  async getTenants() {
    return db.listTenants({ take: 100 });
  }

  async getTenantById(id) {
    return db.getTenantById(id);
  }

  async createTenant({ name, region, contactEmail, phone, address, planTier }) {
    const slug = `ws-${region.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const tenant = await db.createTenant({
      name,
      slug,
      status: 'ACTIVE',
      region,
      contactEmail,
      phone,
      address,
      planTier: planTier || 'STARTER',
    });
    await this.createSubscription({ tenantId: tenant.id, planTier: tenant.planTier });
    return tenant;
  }

  async updateTenant(id, updates) {
    try {
      return await db.updateTenant(id, updates);
    } catch {
      return null;
    }
  }

  // ── RBAC Methods ────────────────────────────────────────────────────────────

  async getRoles() {
    return db.listRoles({ take: 50 });
  }

  async getRolePermissions(roleId) {
    const role = await db.getRoleById(roleId);
    return role ? (role.permissions || []) : [];
  }

  async getUserPermissions(userId) {
    const user = await this.getUserById(userId);
    if (!user) return [];
    return this.getRolePermissions(user.role);
  }

  async hasPermission(userId, permission) {
    const perms = await this.getUserPermissions(userId);
    if (perms.includes('*')) return true;
    return perms.includes(permission);
  }

  // ── Subscription Methods ────────────────────────────────────────────────────

  async getSubscriptions(tenantId) {
    const prisma = db.getClient();
    if (tenantId) {
      return prisma.subscription.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    }
    return prisma.subscription.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async getSubscriptionById(id) {
    return db.getSubscriptionById(id);
  }

  async createSubscription({ tenantId, planTier }) {
    const plans = {
      STARTER: { pricePerMonth: 5000000, deviceLimit: 10, features: ['vehicles:read'] },
      PROFESSIONAL: { pricePerMonth: 18000000, deviceLimit: 30, features: ['geofence', 'deviation_alerts', 'ai_reports'] },
      ENTERPRISE: { pricePerMonth: 45000000, deviceLimit: 100, features: ['geofence', 'deviation_alerts', 'api_access', 'webhooks', 'ai_reports', 'priority_support'] },
    };
    const plan = plans[planTier] || plans.STARTER;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    return db.createSubscription({
      tenantId,
      plan: planTier || 'STARTER',
      status: 'ACTIVE',
      pricePerMonth: plan.pricePerMonth,
      currency: 'IDR',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      deviceLimit: plan.deviceLimit,
      features: plan.features,
    });
  }

  async updateSubscription(id, updates) {
    try {
      return await db.updateSubscription(id, updates);
    } catch {
      return null;
    }
  }

  // ── Invoice Methods ─────────────────────────────────────────────────────────

  async getInvoices(tenantId) {
    const prisma = db.getClient();
    if (tenantId) {
      return prisma.invoice.findMany({ where: { tenantId }, orderBy: { issuedAt: 'desc' } });
    }
    return prisma.invoice.findMany({ orderBy: { issuedAt: 'desc' }, take: 200 });
  }

  async getInvoiceById(id) {
    return db.getInvoiceById(id);
  }

  async createInvoice({ tenantId, subscriptionId, amount, lineItems }) {
    const prisma = db.getClient();
    const count = await prisma.invoice.count();
    const invNum = `VGL-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(count + 1).padStart(3, '0')}`;
    return db.createInvoice({
      tenantId,
      subscriptionId,
      amount,
      currency: 'IDR',
      status: 'PENDING',
      paymentMethod: 'Virtual Account',
      dueAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      invoiceNumber: invNum,
      lineItems: lineItems || [{ description: 'Subscription', quantity: 1, unitPrice: amount, total: amount }],
    });
  }

  async markInvoicePaid(id, paymentMethod) {
    try {
      return await db.updateInvoice(id, {
        status: 'PAID',
        paidAt: new Date().toISOString(),
        ...(paymentMethod ? { paymentMethod } : {}),
      });
    } catch {
      return null;
    }
  }

  // ── API Key Methods ─────────────────────────────────────────────────────────

  async getApiKeys(tenantId) {
    const prisma = db.getClient();
    if (tenantId) {
      return prisma.aPIKey.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    }
    return prisma.aPIKey.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async getApiKeyById(id) {
    const prisma = db.getClient();
    return prisma.aPIKey.findUnique({ where: { id } });
  }

  async createApiKey({ tenantId, name, permissions, expiresAt }) {
    const hex = '0123456789abcdefghijklmnopqrstuvwxyz';
    let key = '';
    for (let i = 0; i < 40; i++) key += hex[Math.floor(Math.random() * hex.length)];
    const prefix = `ak_${tenantId.slice(3, 7)}_`;
    return db.createApiKey({
      tenantId,
      name,
      keyHash: prefix + key,
      prefix,
      permissions: permissions || ['vehicles:read'],
      status: 'ACTIVE',
      expiresAt: expiresAt || null,
    });
  }

  async revokeApiKey(id) {
    try {
      return await db.updateApiKey(id, { status: 'REVOKED' });
    } catch {
      return null;
    }
  }

  // ── Invitation Methods ──────────────────────────────────────────────────────

  async getInvitations(tenantId) {
    const prisma = db.getClient();
    if (tenantId) {
      return prisma.invitation.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    }
    return prisma.invitation.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async createInvitation({ tenantId, email, role, invitedBy }) {
    const token = `inv_${crypto.randomUUID()}`;
    return db.createInvitation({
      tenantId,
      email,
      roleId: role,
      invitedById: invitedBy,
      token,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  async acceptInvitation(invId, password) {
    const prisma = db.getClient();
    const inv = await prisma.invitation.findUnique({ where: { id: invId } });
    if (!inv || inv.status !== 'PENDING') return null;
    await db.updateInvitation(invId, { status: 'ACCEPTED' });
    return this.createUser({
      name: inv.email.split('@')[0],
      email: inv.email,
      password,
      role: inv.roleId,
      tenantId: inv.tenantId,
    });
  }

  async revokeInvitation(invId) {
    try {
      return await db.updateInvitation(invId, { status: 'REVOKED' });
    } catch {
      return null;
    }
  }

  // ── User Management Methods ─────────────────────────────────────────────────

  async getUsers(tenantId) {
    const prisma = db.getClient();
    const where = { deletedAt: null };
    if (tenantId) where.tenantId = tenantId;
    return prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true, status: true,
        avatar: true, isMfaEnabled: true, officerId: true,
        createdAt: true, updatedAt: true, tenantId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async suspendUser(userId) {
    try {
      const updated = await db.suspendUser(userId);
      await db.revokeAllUserRefreshTokens(userId);
      return updated;
    } catch {
      return null;
    }
  }

  async activateUser(userId) {
    try {
      return await db.activateUser(userId);
    } catch {
      return null;
    }
  }

  // ── SLA Methods ─────────────────────────────────────────────────────────────

  async getSlaDocuments(tenantId) {
    return db.listSlaDocuments({ where: { tenantId }, take: 100 });
  }

  // ── Auth Audit Log Methods ──────────────────────────────────────────────────

  async logAuthEvent({ eventType, userId, email, ipAddress, userAgent, tenantId, details, success }) {
    return db.createAuditLog({
      action: eventType,
      userId,
      tenantId: tenantId || 'ws-semarang-01',
      resource: 'auth',
      details: { email, details, success: success !== false },
      ipAddress: ipAddress || '127.0.0.1',
      userAgent: userAgent || 'unknown',
    });
  }

  async getAuthAuditLog(tenantId, limit = 50) {
    const prisma = db.getClient();
    const where = {};
    if (tenantId) where.tenantId = tenantId;
    return prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ── Refresh Token Methods ───────────────────────────────────────────────────

  async createRefreshToken(userId, tenantId) {
    const token = `rt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return db.createRefreshToken({
      token,
      userId,
      tenantId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  async validateRefreshToken(token) {
    const record = await db.getRefreshToken(token);
    if (!record) return null;
    if (record.revoked) return null;
    if (new Date(record.expiresAt) <= new Date()) return null;
    return record;
  }

  async revokeRefreshToken(token) {
    try {
      return await db.revokeRefreshToken(token);
    } catch {
      return null;
    }
  }

  // ── Tenant Dashboard Stats ──────────────────────────────────────────────────

  async getTenantStats(tenantId) {
    return db.getTenantStats(tenantId);
  }
}

export const postgresDB = new PostgresAdapter();
