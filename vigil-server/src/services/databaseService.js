/**
 * Database Service Layer — Prisma Wrapper for VigilOS V3
 * 
 * Provides high-level database operations with:
 * - Automatic tenant isolation
 * - Transaction support
 * - Error handling
 * - Connection management
 */

import { createTenantPrismaClient } from '../middleware/tenantIsolation.js';

class DatabaseService {
  constructor() {
    this.prisma = null;
    this.isConnected = false;
  }

  /**
   * Initialize database connection
   */
  async connect() {
    try {
      this.prisma = createTenantPrismaClient();
      await this.prisma.$connect();
      this.isConnected = true;
      console.log('✅ Database connected successfully');
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    try {
      if (this.prisma) {
        await this.prisma.$disconnect();
        this.isConnected = false;
        console.log('Database disconnected');
      }
    } catch (error) {
      console.error('Database disconnect error:', error.message);
    }
  }

  /**
   * Get Prisma client instance
   */
  getClient() {
    if (!this.prisma) {
      throw new Error('Database not initialized. Call connect() first.');
    }
    return this.prisma;
  }

  /**
   * Execute a transaction
   */
  async transaction(fn) {
    return this.prisma.$transaction(fn);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TENANT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createTenant(data) {
    return this.prisma.tenant.create({ data });
  }

  async getTenantById(id) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async getTenantBySlug(slug) {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }

  async updateTenant(id, data) {
    return this.prisma.tenant.update({ where: { id }, data });
  }

  async listTenants(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    return this.prisma.tenant.findMany({
      skip,
      take,
      where: { deletedAt: null, ...where },
      orderBy,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // USER OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createUser(data) {
    return this.prisma.user.create({ data });
  }

  async getUserById(id) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async getUserByEmail(email) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async updateUser(id, data) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async listUsers(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    return this.prisma.user.findMany({
      skip,
      take,
      where: { deletedAt: null, ...where },
      orderBy,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        avatar: true,
        isMfaEnabled: true,
        officerId: true,
        createdAt: true,
        updatedAt: true,
        tenantId: true,
      },
    });
  }

  async suspendUser(id) {
    return this.prisma.user.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });
  }

  async activateUser(id) {
    return this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VEHICLE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createVehicle(data) {
    return this.prisma.vehicle.create({ data });
  }

  async getVehicleById(id) {
    return this.prisma.vehicle.findUnique({ where: { id } });
  }

  async getVehicleByCode(tenantId, code) {
    return this.prisma.vehicle.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
  }

  async updateVehicle(id, data) {
    return this.prisma.vehicle.update({ where: { id }, data });
  }

  async deleteVehicle(id) {
    return this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listVehicles(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    return this.prisma.vehicle.findMany({
      skip,
      take,
      where: { deletedAt: null, ...where },
      orderBy,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INCIDENT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createIncident(data) {
    return this.prisma.incident.create({ data });
  }

  async getIncidentById(id) {
    return this.prisma.incident.findUnique({ where: { id } });
  }

  async updateIncident(id, data) {
    return this.prisma.incident.update({ where: { id }, data });
  }

  async listIncidents(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    return this.prisma.incident.findMany({
      skip,
      take,
      where: { deletedAt: null, ...where },
      orderBy,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTION & BILLING OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createSubscription(data) {
    return this.prisma.subscription.create({ data });
  }

  async getSubscriptionById(id) {
    return this.prisma.subscription.findUnique({ where: { id } });
  }

  async getSubscriptionByTenantId(tenantId) {
    return this.prisma.subscription.findFirst({ where: { tenantId } });
  }

  async updateSubscription(id, data) {
    return this.prisma.subscription.update({ where: { id }, data });
  }

  async createInvoice(data) {
    return this.prisma.invoice.create({ data });
  }

  async getInvoiceById(id) {
    return this.prisma.invoice.findUnique({ where: { id } });
  }

  async updateInvoice(id, data) {
    return this.prisma.invoice.update({ where: { id }, data });
  }

  async listInvoices(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { issuedAt: 'desc' } } = params;
    return this.prisma.invoice.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // API KEY OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createApiKey(data) {
    return this.prisma.aPIKey.create({ data });
  }

  async getApiKeyByHash(keyHash) {
    return this.prisma.aPIKey.findUnique({ where: { keyHash } });
  }

  async updateApiKey(id, data) {
    return this.prisma.aPIKey.update({ where: { id }, data });
  }

  async listApiKeys(params = {}) {
    const { where = {} } = params;
    return this.prisma.aPIKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DEVICE TOKEN OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createDeviceToken(data) {
    return this.prisma.deviceToken.create({ data });
  }

  async getDeviceTokenByHash(tokenHash) {
    return this.prisma.deviceToken.findUnique({ where: { tokenHash } });
  }

  async updateDeviceToken(id, data) {
    return this.prisma.deviceToken.update({ where: { id }, data });
  }

  async listDeviceTokens(params = {}) {
    const { where = {} } = params;
    return this.prisma.deviceToken.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteDeviceToken(id) {
    return this.prisma.deviceToken.delete({ where: { id } });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUDIT LOG OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createAuditLog(data) {
    return this.prisma.auditLog.create({ data });
  }

  async listAuditLogs(params = {}) {
    const { skip = 0, take = 100, where = {}, orderBy = { createdAt: 'desc' } } = params;
    return this.prisma.auditLog.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // REFRESH TOKEN OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createRefreshToken(data) {
    return this.prisma.refreshToken.create({ data });
  }

  async getRefreshToken(token) {
    return this.prisma.refreshToken.findUnique({ where: { token } });
  }

  async revokeRefreshToken(token) {
    return this.prisma.refreshToken.update({
      where: { token },
      data: { revoked: true },
    });
  }

  async revokeAllUserRefreshTokens(userId) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INVITATION OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createInvitation(data) {
    return this.prisma.invitation.create({ data });
  }

  async getInvitationByToken(token) {
    return this.prisma.invitation.findUnique({ where: { token } });
  }

  async updateInvitation(id, data) {
    return this.prisma.invitation.update({ where: { id }, data });
  }

  async listInvitations(params = {}) {
    const { where = {} } = params;
    return this.prisma.invitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ROLE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createRole(data) {
    return this.prisma.role.create({ data });
  }

  async getRoleById(id) {
    return this.prisma.role.findUnique({ where: { id } });
  }

  async updateRole(id, data) {
    return this.prisma.role.update({ where: { id }, data });
  }

  async listRoles(params = {}) {
    const { where = {} } = params;
    return this.prisma.role.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECURITY EVENT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createSecurityEvent(data) {
    return this.prisma.securityEvent.create({ data });
  }

  async listSecurityEvents(params = {}) {
    const { skip = 0, take = 100, where = {}, orderBy = { timestamp: 'desc' } } = params;
    return this.prisma.securityEvent.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DRIVER OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createDriver(data) {
    return this.prisma.driver.create({ data });
  }

  async getDriverById(id) {
    return this.prisma.driver.findUnique({ where: { id } });
  }

  async updateDriver(id, data) {
    return this.prisma.driver.update({ where: { id }, data });
  }

  async deleteDriver(id) {
    return this.prisma.driver.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listDrivers(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    return this.prisma.driver.findMany({
      skip,
      take,
      where: { deletedAt: null, ...where },
      orderBy,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // OFFICER OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createOfficer(data) {
    return this.prisma.officer.create({ data });
  }

  async getOfficerById(id) {
    return this.prisma.officer.findUnique({ where: { id } });
  }

  async updateOfficer(id, data) {
    return this.prisma.officer.update({ where: { id }, data });
  }

  async deleteOfficer(id) {
    return this.prisma.officer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listOfficers(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    return this.prisma.officer.findMany({
      skip,
      take,
      where: { deletedAt: null, ...where },
      orderBy,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SLA DOCUMENT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createSlaDocument(data) {
    return this.prisma.slaDocument.create({ data });
  }

  async getSlaDocumentById(id) {
    return this.prisma.slaDocument.findUnique({ where: { id } });
  }

  async updateSlaDocument(id, data) {
    return this.prisma.slaDocument.update({ where: { id }, data });
  }

  async listSlaDocuments(params = {}) {
    const { where = {} } = params;
    return this.prisma.slaDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // USAGE RECORD OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createUsageRecord(data) {
    return this.prisma.usageRecord.create({ data });
  }

  async listUsageRecords(params = {}) {
    const { where = {} } = params;
    return this.prisma.usageRecord.findMany({
      where,
      orderBy: { periodStart: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TENANT STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════════

  async getTenantStats(tenantId) {
    const [totalVehicles, totalDrivers, totalUsers, totalIncidents, activeTokens, subscription] = await Promise.all([
      this.prisma.vehicle.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.driver.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.user.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.incident.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.deviceToken.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.subscription.findFirst({ where: { tenantId } }),
    ]);

    const deviceLimit = subscription?.deviceLimit || 0;
    const deviceUsagePercent = deviceLimit > 0 ? Math.round((activeTokens / deviceLimit) * 100) : 0;

    return {
      totalVehicles,
      activeVehicles: totalVehicles,
      warningVehicles: 0,
      emergencyVehicles: 0,
      totalDrivers,
      totalUsers,
      activeUsers: totalUsers,
      totalIncidents,
      activeIncidents: 0,
      resolvedIncidents: totalIncidents,
      totalTokens: activeTokens,
      activeTokens,
      subscription: subscription ? {
        id: subscription.id,
        planTier: subscription.plan,
        status: subscription.status,
        pricePerMonth: Number(subscription.pricePerMonth) || 0,
        currency: subscription.currency,
        deviceLimit: subscription.deviceLimit,
        features: subscription.features,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      } : null,
      deviceUsagePercent,
    };
  }
}

// Singleton instance
export const db = new DatabaseService();
export default db;
