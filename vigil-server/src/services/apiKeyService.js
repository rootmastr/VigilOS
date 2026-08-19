/**
 * API Key Service — Rotation & Management
 * 
 * Handles API key creation, rotation, revocation, and validation.
 * Implements PRD §3.4 Security enhancements.
 */

import crypto from 'crypto';
import { db } from './databaseService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const API_KEY_CONFIG = {
  prefix: 'vig_',
  keyLength: 32,
  rotationWarningDays: 7,
  maxKeysPerTenant: 10,
};

// ═══════════════════════════════════════════════════════════════════════════════
// KEY GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a new API key
 * 
 * @returns {Object} { apiKey, keyHash, prefix }
 */
export function generateApiKey() {
  const randomBytes = crypto.randomBytes(API_KEY_CONFIG.keyLength);
  const apiKey = `${API_KEY_CONFIG.prefix}${randomBytes.toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const prefix = apiKey.substring(0, 12);

  return { apiKey, keyHash, prefix };
}

/**
 * Hash an API key for comparison
 */
export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new API key for a tenant
 * 
 * @param {string} tenantId - Tenant ID
 * @param {Object} options - Key options
 * @returns {Object} Created API key (with plaintext key)
 */
export async function createApiKey(tenantId, options = {}) {
  try {
    // Check key limit
    const existingKeys = await db.prisma.apiKey.count({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
    });

    if (existingKeys >= API_KEY_CONFIG.maxKeysPerTenant) {
      throw new Error(`Maximum ${API_KEY_CONFIG.maxKeysPerTenant} active keys per tenant`);
    }

    // Generate key
    const { apiKey, keyHash, prefix } = generateApiKey();

    // Create key record
    const key = await db.createApiKey({
      tenantId,
      keyHash,
      prefix,
      name: options.name || `API Key ${existingKeys + 1}`,
      permissions: options.permissions || ['vehicles:read', 'incidents:read'],
      status: 'ACTIVE',
      expiresAt: options.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    });

    // Log key creation
    await db.createAuditLog({
      tenantId,
      action: 'API_KEY_CREATED',
      resource: 'api_key',
      resourceId: key.id,
      details: {
        name: key.name,
        prefix,
        permissions: key.permissions,
        expiresAt: key.expiresAt,
      },
    });

    return {
      success: true,
      data: {
        id: key.id,
        apiKey, // Only returned on creation
        prefix,
        name: key.name,
        permissions: key.permissions,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
      },
    };
  } catch (error) {
    console.error('Create API key error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Rotate an API key (create new, revoke old)
 * 
 * @param {string} keyId - Key ID to rotate
 * @param {string} tenantId - Tenant ID
 * @returns {Object} New API key
 */
export async function rotateApiKey(keyId, tenantId) {
  try {
    // Get existing key
    const existingKey = await db.prisma.apiKey.findUnique({
      where: { id: keyId },
    });

    if (!existingKey) {
      throw new Error('API key not found');
    }

    if (existingKey.tenantId !== tenantId) {
      throw new Error('Access denied');
    }

    // Create new key
    const newKey = await createApiKey(tenantId, {
      name: `${existingKey.name} (rotated)`,
      permissions: existingKey.permissions,
    });

    if (!newKey.success) {
      return newKey;
    }

    // Revoke old key
    await db.prisma.apiKey.update({
      where: { id: keyId },
      data: { status: 'REVOKED' },
    });

    // Log rotation
    await db.createAuditLog({
      tenantId,
      action: 'API_KEY_ROTATED',
      resource: 'api_key',
      resourceId: keyId,
      details: {
        oldKeyPrefix: existingKey.prefix,
        newKeyPrefix: newKey.data.prefix,
      },
    });

    return newKey;
  } catch (error) {
    console.error('Rotate API key error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Revoke an API key
 * 
 * @param {string} keyId - Key ID
 * @param {string} tenantId - Tenant ID
 */
export async function revokeApiKey(keyId, tenantId) {
  try {
    const key = await db.prisma.apiKey.findUnique({
      where: { id: keyId },
    });

    if (!key) {
      throw new Error('API key not found');
    }

    if (key.tenantId !== tenantId) {
      throw new Error('Access denied');
    }

    await db.prisma.apiKey.update({
      where: { id: keyId },
      data: { status: 'REVOKED' },
    });

    // Log revocation
    await db.createAuditLog({
      tenantId,
      action: 'API_KEY_REVOKED',
      resource: 'api_key',
      resourceId: keyId,
      details: {
        prefix: key.prefix,
        name: key.name,
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Revoke API key error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate an API key
 * 
 * @param {string} apiKey - Plain text API key
 * @returns {Object} Validation result
 */
export async function validateApiKey(apiKey) {
  try {
    const keyHash = hashApiKey(apiKey);

    const key = await db.prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        tenant: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    if (!key) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (key.status !== 'ACTIVE') {
      return { valid: false, error: 'API key is revoked' };
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }

    if (key.tenant.status !== 'ACTIVE') {
      return { valid: false, error: 'Tenant account is suspended' };
    }

    // Update last used timestamp
    await db.prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      valid: true,
      data: {
        keyId: key.id,
        tenantId: key.tenantId,
        tenantName: key.tenant.name,
        permissions: key.permissions,
      },
    };
  } catch (error) {
    console.error('Validate API key error:', error);
    return { valid: false, error: 'Validation error' };
  }
}

/**
 * Check if API key needs rotation warning
 * 
 * @param {string} keyId - Key ID
 * @returns {Object} Rotation status
 */
export async function checkRotationStatus(keyId) {
  try {
    const key = await db.prisma.apiKey.findUnique({
      where: { id: keyId },
    });

    if (!key) {
      return { error: 'Key not found' };
    }

    if (!key.expiresAt) {
      return { needsRotation: false, reason: 'No expiration set' };
    }

    const daysUntilExpiry = Math.ceil(
      (new Date(key.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
    );

    const needsRotation = daysUntilExpiry <= API_KEY_CONFIG.rotationWarningDays;

    return {
      needsRotation,
      daysUntilExpiry,
      expiresAt: key.expiresAt,
      warningDays: API_KEY_CONFIG.rotationWarningDays,
    };
  } catch (error) {
    console.error('Check rotation status error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEY LISTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List API keys for a tenant
 * 
 * @param {string} tenantId - Tenant ID
 * @returns {Array} List of API keys
 */
export async function listApiKeys(tenantId) {
  try {
    const keys = await db.prisma.apiKey.findMany({
      where: { tenantId },
      select: {
        id: true,
        prefix: true,
        name: true,
        permissions: true,
        status: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Check rotation status for each key
    const keysWithRotation = await Promise.all(
      keys.map(async (key) => {
        const rotation = await checkRotationStatus(key.id);
        return { ...key, rotation };
      })
    );

    return {
      success: true,
      data: keysWithRotation,
    };
  } catch (error) {
    console.error('List API keys error:', error);
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
  API_KEY_CONFIG,
  generateApiKey,
  hashApiKey,
  createApiKey,
  rotateApiKey,
  revokeApiKey,
  validateApiKey,
  checkRotationStatus,
  listApiKeys,
};
