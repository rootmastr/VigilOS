/**
 * PostgreSQL + PostGIS Relational Database & Workspace Adapter
 * Handles Multi-Tenancy, RBAC, Vehicle Master Registry, and Incident Audit Trails.
 */

import bcrypt from 'bcryptjs';

class PostgresAdapter {
  constructor() {
    // Multi-tenant workspaces
    this.workspaces = [
      { id: 'ws-semarang-01', name: 'Dishub Kota Semarang', status: 'ACTIVE', region: 'Jawa Tengah' }
    ];

    // Master vehicle registry — EMPTY (add real vehicles via API)
    this.vehicles = [];

    // Drivers — EMPTY (add real drivers via API)
    this.drivers = [];

    // Patrol Officers — EMPTY (add real officers via API)
    this.officers = [];

    // Device Tokens — EMPTY (add real tokens via Fleet Admin)
    this.deviceTokens = [];

    // Security Audit Log
    this.securityEvents = [];

    // Incident audit logs
    this.incidents = [];

    // Auth users (required for login)
    this.users = [
      { id: 'usr-01', name: 'Cmdr. Rahmat', email: 'admin@vigilos.id', password: bcrypt.hashSync('admin123', 10), role: 'SUPER_ADMIN', tenantId: 'ws-semarang-01', avatar: null, isMfaEnabled: false, status: 'ACTIVE', createdAt: '2024-01-15T08:00:00Z' },
      { id: 'usr-02', name: 'Operator 04', email: 'operator@vigilos.id', password: bcrypt.hashSync('operator123', 10), role: 'COMMAND_CENTER_OPERATOR', tenantId: 'ws-semarang-01', avatar: null, isMfaEnabled: false, status: 'ACTIVE', createdAt: '2024-02-01T09:30:00Z' },
      { id: 'usr-03', name: 'Officer Hendra', email: 'hendra@vigilos.id', password: bcrypt.hashSync('officer123', 10), role: 'PATROL_OFFICER', tenantId: 'ws-semarang-01', officerId: 'OFF-101', avatar: null, isMfaEnabled: false, status: 'ACTIVE', createdAt: '2024-02-10T10:00:00Z' },
    ];

    // Tenant
    this.tenants = [
      { id: 'ws-semarang-01', name: 'Dishub Kota Semarang', status: 'ACTIVE', region: 'Jawa Tengah', contactEmail: 'admin@semarang.go.id', phone: '+62 24-5555-0100', address: 'Jl. Pemuda 148, Semarang', createdAt: '2024-01-10T00:00:00Z', planTier: 'ENTERPRISE' },
    ];

    // RBAC roles
    this.roles = [
      { id: 'role-super-admin', name: 'SUPER_ADMIN', description: 'Internal VigilOS staff. Global access across all tenants.', isSystem: true },
      { id: 'role-tenant-admin', name: 'TENANT_ADMIN', description: 'Client owner. Full access to billing, team management, and API settings.', isSystem: false },
      { id: 'role-tenant-finance', name: 'TENANT_FINANCE', description: 'Read/write access restricted to invoices, billing methods, and usage quotas.', isSystem: false },
      { id: 'role-tenant-dispatcher', name: 'TENANT_DISPATCHER', description: 'No portal access; automatic redirect to the Command Center.', isSystem: false },
      { id: 'role-tenant-auditor', name: 'TENANT_AUDITOR', description: 'Read-only access to SLA documents, audit logs, and auto-generated compliance reports.', isSystem: false },
      { id: 'role-command-center', name: 'COMMAND_CENTER_OPERATOR', description: 'Real-time fleet monitoring and incident response.', isSystem: false },
      { id: 'role-patrol', name: 'PATROL_OFFICER', description: 'Field patrol officer with emergency response capabilities.', isSystem: false },
    ];

    // Role permissions mapping
    this.rolePermissions = [
      { roleId: 'role-super-admin', permissions: ['*'] },
      { roleId: 'role-tenant-admin', permissions: ['team:manage', 'billing:manage', 'api_keys:manage', 'vehicles:read', 'vehicles:write', 'incidents:read', 'reports:read', 'sla:read', 'sla:write'] },
      { roleId: 'role-tenant-finance', permissions: ['billing:read', 'billing:write', 'invoices:read', 'invoices:write', 'usage:read'] },
      { roleId: 'role-tenant-dispatcher', permissions: ['vehicles:read', 'incidents:read', 'incidents:write'] },
      { roleId: 'role-tenant-auditor', permissions: ['sla:read', 'audit_logs:read', 'reports:read', 'invoices:read'] },
      { roleId: 'role-command-center', permissions: ['vehicles:read', 'incidents:read', 'incidents:write', 'officers:read', 'officers:write'] },
      { roleId: 'role-patrol', permissions: ['incidents:read', 'incidents:write', 'vehicles:read'] },
    ];

    // Subscriptions — EMPTY
    this.subscriptions = [];

    // Invoices — EMPTY
    this.invoices = [];

    // API Keys — EMPTY
    this.apiKeys = [];

    // Auth audit log
    this.authAuditLog = [];

    // Refresh tokens
    this.refreshTokens = [];

    // Pending invitations — EMPTY
    this.invitations = [];
  }

  // ── Authentication Methods ──────────────────────────────────────────────────

  /** Find user by email */
  getUserByEmail(email) {
    return this.users.find(u => u.email === email);
  }

  /** Find user by ID */
  getUserById(id) {
    return this.users.find(u => u.id === id);
  }

  /** Validate user credentials */
  async validateUser(email, password) {
    const user = this.getUserByEmail(email);
    if (!user) return null;
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return null;
    // Return user without password
    const { password: _, ...safeUser } = user;
    return safeUser;
  }

  /** Create new user */
  createUser({ name, email, password, role, tenantId, officerId }) {
    const existing = this.getUserByEmail(email);
    if (existing) return null;
    const newUser = {
      id: `usr-${Date.now()}`,
      name,
      email,
      password: bcrypt.hashSync(password, 10),
      role: role || 'PUBLIC_USER',
      tenantId: tenantId || 'ws-semarang-01',
      officerId: officerId || null,
      avatar: null,
      createdAt: new Date().toISOString()
    };
    this.users.push(newUser);
    const { password: _, ...safeUser } = newUser;
    return safeUser;
  }

  /** Update user profile */
  updateUser(id, updates) {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return null;
    // Don't allow password update through this method
    delete updates.password;
    this.users[index] = { ...this.users[index], ...updates };
    const { password: _, ...safeUser } = this.users[index];
    return safeUser;
  }

  getVehicles(tenantId = 'ws-semarang-01') {
    return this.vehicles.filter(v => v.tenantId === tenantId);
  }

  getVehicleById(id) {
    return this.vehicles.find(v => v.id === id || v.code === id);
  }

  createVehicle(data) {
    if (!data || !data.code || !data.name) {
      return null; // Require real data
    }
    const newVehicle = {
      id: data.id || `VEH-${Date.now()}`,
      code: data.code,
      name: data.name,
      type: data.type || 'Bus',
      tenantId: data.tenantId || 'ws-semarang-01',
      driver: data.driver || 'UNASSIGNED',
      speedLimit: Number(data.speedLimit) || 50,
      lat: Number(data.lat) || 0,
      lng: Number(data.lng) || 0,
      speed: 0,
      heading: 0,
      status: 'normal',
      heartBeatIntervalSec: 10
    };
    this.vehicles.push(newVehicle);
    return newVehicle;
  }

  updateVehicle(id, updates) {
    const index = this.vehicles.findIndex(v => v.id === id);
    if (index === -1) return null;
    this.vehicles[index] = { ...this.vehicles[index], ...updates };
    return this.vehicles[index];
  }

  deleteVehicle(id) {
    const index = this.vehicles.findIndex(v => v.id === id);
    if (index === -1) return false;
    this.vehicles.splice(index, 1);
    return true;
  }

  getDrivers(tenantId = 'ws-semarang-01') {
    return this.drivers.filter(d => d.tenantId === tenantId);
  }

  getDriverById(id) {
    return this.drivers.find(d => d.id === id);
  }

  createDriver(data) {
    const newDriver = {
      id: data.id || `DRV-${100 + this.drivers.length + 1}`,
      name: data.name,
      vehicleId: data.vehicleId || 'UNASSIGNED',
      licenseNo: data.licenseNo || `SIM-B2-${Math.floor(10000 + Math.random() * 90000)}`,
      phone: data.phone || '+62 812-0000-0000',
      safetyScore: Number(data.safetyScore) || 90,
      status: 'normal',
      trips: 0,
      hoursOnDuty: 0.0,
      tenantId: data.tenantId || 'ws-semarang-01'
    };
    this.drivers.push(newDriver);

    // If assigned to a vehicle, update vehicle's driver field
    if (data.vehicleId && data.vehicleId !== 'UNASSIGNED') {
      const v = this.getVehicleById(data.vehicleId);
      if (v) v.driver = newDriver.name;
    }

    return newDriver;
  }

  updateDriver(id, updates) {
    const index = this.drivers.findIndex(d => d.id === id);
    if (index === -1) return null;
    this.drivers[index] = { ...this.drivers[index], ...updates };
    return this.drivers[index];
  }

  deleteDriver(id) {
    const index = this.drivers.findIndex(d => d.id === id);
    if (index === -1) return false;
    this.drivers.splice(index, 1);
    return true;
  }

  getOfficers(tenantId = 'ws-semarang-01') {
    return this.officers.filter(o => o.tenantId === tenantId);
  }

  updateOfficerDutyStatus(id, dutyStatus) {
    const officer = this.officers.find(o => o.id === id);
    if (officer) {
      officer.dutyStatus = dutyStatus;
      officer.lastUpdated = new Date().toISOString();
    }
    return officer;
  }

  updateVehicleStatus(id, status, heartBeatIntervalSec) {
    const vehicle = this.getVehicleById(id);
    if (vehicle) {
      vehicle.status = status;
      if (heartBeatIntervalSec) vehicle.heartBeatIntervalSec = heartBeatIntervalSec;
    }
    return vehicle;
  }

  updateVehicleLocation(id, { lat, lng, speed, heading, passengers }) {
    const vehicle = this.getVehicleById(id);
    if (vehicle) {
      vehicle.lat = lat;
      vehicle.lng = lng;
      vehicle.speed = speed;
      vehicle.heading = heading;
      vehicle.passengers = passengers;
    }
    return vehicle;
  }

  // Audit trail log creation
  createIncidentRecord({ vehicleId, type, severity, location, details }) {
    if (!location || !location.lat || !location.lng) {
      return null; // Require real location
    }
    const vehicle = this.getVehicleById(vehicleId);
    const incident = {
      id: `INC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      vehicleId: vehicleId || 'UNKNOWN',
      vehicleCode: vehicle ? vehicle.code : 'UNKNOWN',
      driverName: vehicle ? vehicle.driver : 'Unknown Driver',
      type: type || 'PANIC_BUTTON',
      severity: severity || 'CRITICAL',
      location: location,
      status: 'ACTIVE',
      timestamp: new Date().toISOString(),
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedAt: null,
      details: details || 'Emergency panic trigger activated from vehicle onboard unit.'
    };
    this.incidents.unshift(incident);
    return incident;
  }

  acknowledgeIncident(incidentId, operatorId = 'Operator 04') {
    const inc = this.incidents.find(i => i.id === incidentId);
    if (inc) {
      inc.status = 'ACKNOWLEDGED';
      inc.acknowledgedBy = operatorId;
      inc.acknowledgedAt = new Date().toISOString();
    }
    return inc;
  }

  resolveIncident(incidentId, operatorId = 'Operator 04', fieldReport = null) {
    const inc = this.incidents.find(i => i.id === incidentId);
    if (inc) {
      inc.status = 'RESOLVED';
      inc.resolvedAt = new Date().toISOString();
      if (fieldReport) {
        inc.fieldReport = {
          officerId: fieldReport.officerId || 'OFF-101',
          notes: fieldReport.notes || '',
          photoUrl: fieldReport.photoUrl || null,
          submittedAt: new Date().toISOString()
        };
      }
      const vehicle = this.getVehicleById(inc.vehicleId);
      if (vehicle) {
        vehicle.status = 'normal';
        vehicle.heartBeatIntervalSec = 10;
      }
    }
    return inc;
  }

  getIncidents(status) {
    if (status) {
      return this.incidents.filter(i => i.status === status);
    }
    return this.incidents;
  }

  // PostGIS spatial query simulation: Find vehicles within N meters radius
  findNearbyVehicles(lat, lng, radiusMeters = 5000) {
    const R = 6371e3; // metres
    return this.vehicles.filter(v => {
      const φ1 = (lat * Math.PI) / 180;
      const φ2 = (v.lat * Math.PI) / 180;
      const Δφ = ((v.lat - lat) * Math.PI) / 180;
      const Δλ = ((v.lng - lng) * Math.PI) / 180;

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      return distance <= radiusMeters;
    });
  }

  // Device Token Authentication & Lifecycle Management
  getDeviceTokens(tenantId = 'ws-semarang-01') {
    return this.deviceTokens.filter(t => t.tenantId === tenantId);
  }

  getTokenByValue(tokenString) {
    return this.deviceTokens.find(t => t.token === tokenString);
  }

  generateDeviceToken(deviceId, tenantId = 'ws-semarang-01', expiryDays = null) {
    // Generate secure 32-char hex string
    const hexChars = '0123456789abcdef';
    let randomHex = '';
    for (let i = 0; i < 32; i++) {
      randomHex += hexChars[Math.floor(Math.random() * 16)];
    }
    const tokenVal = `vgl_live_${randomHex}`;

    const createdAt = new Date().toISOString();
    const newToken = {
      id: `TOK-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      token: tokenVal,
      deviceId,
      tenantId,
      status: 'ACTIVE',
      createdAt,
      expiresAt: expiryDays
        ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
        : null,
      lastUsedAt: null
    };

    this.deviceTokens.push(newToken);
    return newToken;
  }

  // Determine whether a token record is usable for device authentication
  isTokenValid(tokenRecord) {
    if (!tokenRecord) return false;
    if (tokenRecord.status === 'REVOKED') return false;
    if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) <= new Date()) return false;
    return true;
  }

  revokeDeviceToken(tokenId) {
    const tokenObj = this.deviceTokens.find(t => t.id === tokenId || t.token === tokenId);
    if (tokenObj) {
      tokenObj.status = 'REVOKED';
      tokenObj.revokedAt = new Date().toISOString();
      this.logSecurityEvent({
        eventType: 'TOKEN_REVOKED',
        deviceId: tokenObj.deviceId,
        details: `Device token ${tokenObj.id} revoked by administrator.`
      });
    }
    return tokenObj;
  }

  rotateDeviceToken(deviceId, tenantId = 'ws-semarang-01') {
    // Revoke old tokens for this device
    this.deviceTokens
      .filter(t => t.deviceId === deviceId && t.status === 'ACTIVE')
      .forEach(t => {
        t.status = 'REVOKED';
        t.revokedAt = new Date().toISOString();
      });

    // Issue new token
    const newToken = this.generateDeviceToken(deviceId, tenantId);
    this.logSecurityEvent({
      eventType: 'TOKEN_ROTATED',
      deviceId,
      details: `Device token rotated for ${deviceId}. Issued new token ID ${newToken.id}.`
    });

    return newToken;
  }

  // Security Event Audit Logging
  logSecurityEvent({ eventType, deviceId, ipAddress, details }) {
    const event = {
      id: `SEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      eventType: eventType || 'UNAUTHORIZED_ACCESS_ATTEMPT',
      deviceId: deviceId || 'UNKNOWN_DEVICE',
      ipAddress: ipAddress || '127.0.0.1',
      tenantId: 'ws-semarang-01',
      details: details || 'Authentication failure: missing or invalid X-Device-Token header.',
      timestamp: new Date().toISOString()
    };
    this.securityEvents.unshift(event);
    if (this.securityEvents.length > 500) this.securityEvents.pop();
    return event;
  }

  getSecurityEvents(tenantId = 'ws-semarang-01') {
    return this.securityEvents.filter(s => s.tenantId === tenantId);
  }

  // ── PRDportaltennant: Tenant Management Methods ──────────────────────────

  getTenants() {
    return this.tenants;
  }

  getTenantById(id) {
    return this.tenants.find(t => t.id === id);
  }

  createTenant({ name, region, contactEmail, phone, address, planTier }) {
    const id = `ws-${region.toLowerCase().replace(/\s+/g, '-')}-${String(this.tenants.length + 1).padStart(2, '0')}`;
    const tenant = {
      id,
      name,
      status: 'ACTIVE',
      region,
      contactEmail,
      phone,
      address,
      createdAt: new Date().toISOString(),
      planTier: planTier || 'BASIC',
    };
    this.tenants.push(tenant);
    // Create default subscription
    this.createSubscription({ tenantId: id, planTier: tenant.planTier });
    return tenant;
  }

  updateTenant(id, updates) {
    const idx = this.tenants.findIndex(t => t.id === id);
    if (idx === -1) return null;
    this.tenants[idx] = { ...this.tenants[idx], ...updates };
    return this.tenants[idx];
  }

  // ── RBAC Methods ─────────────────────────────────────────────────────────

  getRoles() {
    return this.roles;
  }

  getRolePermissions(roleId) {
    const rp = this.rolePermissions.find(r => r.roleId === roleId);
    return rp ? rp.permissions : [];
  }

  getUserPermissions(userId) {
    const user = this.getUserById(userId);
    if (!user) return [];
    return this.getRolePermissions(user.role);
  }

  hasPermission(userId, permission) {
    const perms = this.getUserPermissions(userId);
    if (perms.includes('*')) return true;
    return perms.includes(permission);
  }

  // ── Subscription & Billing Methods ───────────────────────────────────────

  getSubscriptions(tenantId) {
    if (tenantId) return this.subscriptions.filter(s => s.tenantId === tenantId);
    return this.subscriptions;
  }

  getSubscriptionById(id) {
    return this.subscriptions.find(s => s.id === id);
  }

  createSubscription({ tenantId, planTier }) {
    const plans = {
      BASIC: { pricePerMonth: 5000000, deviceLimit: 10, features: ['vehicles:read'] },
      PRO: { pricePerMonth: 18000000, deviceLimit: 30, features: ['geofence', 'deviation_alerts', 'ai_reports'] },
      ENTERPRISE: { pricePerMonth: 45000000, deviceLimit: 100, features: ['geofence', 'deviation_alerts', 'api_access', 'webhooks', 'ai_reports', 'priority_support'] },
    };
    const plan = plans[planTier] || plans.BASIC;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const sub = {
      id: `sub-${Date.now()}`,
      tenantId,
      planTier,
      status: 'ACTIVE',
      pricePerMonth: plan.pricePerMonth,
      currency: 'IDR',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      deviceLimit: plan.deviceLimit,
      features: plan.features,
    };
    this.subscriptions.push(sub);
    return sub;
  }

  updateSubscription(id, updates) {
    const idx = this.subscriptions.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.subscriptions[idx] = { ...this.subscriptions[idx], ...updates };
    return this.subscriptions[idx];
  }

  // ── Invoice Methods ──────────────────────────────────────────────────────

  getInvoices(tenantId) {
    if (tenantId) return this.invoices.filter(i => i.tenantId === tenantId);
    return this.invoices;
  }

  getInvoiceById(id) {
    return this.invoices.find(i => i.id === id);
  }

  createInvoice({ tenantId, subscriptionId, amount, lineItems }) {
    const invNum = `VGL-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(this.invoices.length + 1).padStart(3, '0')}`;
    const invoice = {
      id: `INV-${Date.now()}`,
      tenantId,
      subscriptionId,
      amount,
      currency: 'IDR',
      status: 'PENDING',
      paymentMethod: 'Virtual Account',
      issuedAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      paidAt: null,
      invoiceNumber: invNum,
      lineItems: lineItems || [{ description: 'Subscription', quantity: 1, unitPrice: amount, total: amount }],
    };
    this.invoices.push(invoice);
    return invoice;
  }

  markInvoicePaid(id, paymentMethod) {
    const inv = this.invoices.find(i => i.id === id);
    if (inv) {
      inv.status = 'PAID';
      inv.paidAt = new Date().toISOString();
      if (paymentMethod) inv.paymentMethod = paymentMethod;
    }
    return inv;
  }

  // ── API Key Methods ──────────────────────────────────────────────────────

  getApiKeys(tenantId) {
    if (tenantId) return this.apiKeys.filter(k => k.tenantId === tenantId);
    return this.apiKeys;
  }

  getApiKeyById(id) {
    return this.apiKeys.find(k => k.id === id);
  }

  createApiKey({ tenantId, name, permissions, expiresAt }) {
    const hex = '0123456789abcdefghijklmnopqrstuvwxyz';
    let key = '';
    for (let i = 0; i < 40; i++) key += hex[Math.floor(Math.random() * hex.length)];
    const prefix = `ak_${tenantId.slice(3, 7)}_`;
    const apiKey = {
      id: `key-${Date.now()}`,
      tenantId,
      name,
      keyHash: prefix + key,
      prefix,
      permissions: permissions || ['vehicles:read'],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: expiresAt || null,
    };
    this.apiKeys.push(apiKey);
    return apiKey;
  }

  revokeApiKey(id) {
    const key = this.apiKeys.find(k => k.id === id);
    if (key) key.status = 'REVOKED';
    return key;
  }

  // ── Invitation Methods ───────────────────────────────────────────────────

  getInvitations(tenantId) {
    if (tenantId) return this.invitations.filter(i => i.tenantId === tenantId);
    return this.invitations;
  }

  createInvitation({ tenantId, email, role, invitedBy }) {
    const inv = {
      id: `inv-${Date.now()}`,
      tenantId,
      email,
      role,
      invitedBy,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    this.invitations.push(inv);
    return inv;
  }

  acceptInvitation(invId, password) {
    const inv = this.invitations.find(i => i.id === invId);
    if (!inv || inv.status !== 'PENDING') return null;
    inv.status = 'ACCEPTED';
    return this.createUser({ name: inv.email.split('@')[0], email: inv.email, password, role: inv.role, tenantId: inv.tenantId });
  }

  revokeInvitation(invId) {
    const inv = this.invitations.find(i => i.id === invId);
    if (inv) inv.status = 'REVOKED';
    return inv;
  }

  // ── User Management Methods ──────────────────────────────────────────────

  getUsers(tenantId) {
    if (tenantId) return this.users.filter(u => u.tenantId === tenantId);
    return this.users.map(({ password, ...u }) => u);
  }

  suspendUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      user.status = 'SUSPENDED';
      // Invalidate all refresh tokens for this user
      this.refreshTokens = this.refreshTokens.filter(t => t.userId !== userId);
    }
    return user;
  }

  activateUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (user) user.status = 'ACTIVE';
    return user;
  }

  // ── SLA Methods ──────────────────────────────────────────────────────────

  getSlaDocuments(tenantId) {
    if (tenantId) return this.slaDocuments.filter(s => s.tenantId === tenantId);
    return this.slaDocuments;
  }

  // ── Auth Audit Log Methods ───────────────────────────────────────────────

  logAuthEvent({ eventType, userId, email, ipAddress, userAgent, tenantId, details, success }) {
    const event = {
      id: `AUTH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      eventType,
      userId: userId || null,
      email: email || null,
      ipAddress: ipAddress || '127.0.0.1',
      userAgent: userAgent || 'unknown',
      tenantId: tenantId || null,
      details: details || '',
      success: success !== false,
      timestamp: new Date().toISOString(),
    };
    this.authAuditLog.unshift(event);
    if (this.authAuditLog.length > 1000) this.authAuditLog.pop();
    return event;
  }

  getAuthAuditLog(tenantId, limit = 50) {
    let logs = tenantId
      ? this.authAuditLog.filter(l => l.tenantId === tenantId)
      : this.authAuditLog;
    return logs.slice(0, limit);
  }

  // ── Refresh Token Methods ────────────────────────────────────────────────

  createRefreshToken(userId, tenantId) {
    const token = `rt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const record = {
      id: `rt-${Date.now()}`,
      token,
      userId,
      tenantId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      revoked: false,
    };
    this.refreshTokens.push(record);
    return record;
  }

  validateRefreshToken(token) {
    const record = this.refreshTokens.find(t => t.token === token);
    if (!record) return null;
    if (record.revoked) return null;
    if (new Date(record.expiresAt) <= new Date()) return null;
    return record;
  }

  revokeRefreshToken(token) {
    const record = this.refreshTokens.find(t => t.token === token);
    if (record) record.revoked = true;
    return record;
  }

  // ── Tenant Dashboard Stats ───────────────────────────────────────────────

  getTenantStats(tenantId) {
    const vehicles = this.vehicles.filter(v => v.tenantId === tenantId);
    const drivers = this.drivers.filter(d => d.tenantId === tenantId);
    const users = this.users.filter(u => u.tenantId === tenantId);
    const incidents = this.incidents.filter(i => {
      const v = this.vehicles.find(veh => veh.id === i.vehicleId);
      return v && v.tenantId === tenantId;
    });
    const tokens = this.deviceTokens.filter(t => t.tenantId === tenantId);
    const activeTokens = tokens.filter(t => t.status === 'ACTIVE');
    const sub = this.subscriptions.find(s => s.tenantId === tenantId && s.status === 'ACTIVE');

    return {
      totalVehicles: vehicles.length,
      activeVehicles: vehicles.filter(v => v.status === 'normal').length,
      warningVehicles: vehicles.filter(v => v.status === 'warning').length,
      emergencyVehicles: vehicles.filter(v => v.status === 'emergency').length,
      totalDrivers: drivers.length,
      totalUsers: users.length,
      activeUsers: users.filter(u => u.status === 'ACTIVE').length,
      totalIncidents: incidents.length,
      activeIncidents: incidents.filter(i => i.status === 'ACTIVE').length,
      resolvedIncidents: incidents.filter(i => i.status === 'RESOLVED').length,
      totalTokens: tokens.length,
      activeTokens: activeTokens.length,
      subscription: sub || null,
      deviceUsagePercent: sub ? Math.round((activeTokens.length / sub.deviceLimit) * 100) : 0,
    };
  }
}

export const postgresDB = new PostgresAdapter();


