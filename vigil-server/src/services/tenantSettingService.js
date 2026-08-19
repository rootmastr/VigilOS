/**
 * Tenant Setting Service — PRD §5.1
 *
 * Manages tenant settings with CRUD, validation, caching, defaults, import/export.
 * Settings are organized by category (general, branding, notifications, security, integrations).
 */

import { db } from './databaseService.js';
import { redisClient } from '../cache/redisClient.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT SETTINGS BY CATEGORY (PRD §6)
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_SETTINGS = {
  general: {
    timezone: {
      value: 'Asia/Jakarta',
      dataType: 'string',
      description: 'Timezone for date/time display',
      validation: { enum: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] },
    },
    language: {
      value: 'id',
      dataType: 'string',
      description: 'Interface language',
      validation: { enum: ['id', 'en'] },
    },
    currency: {
      value: 'IDR',
      dataType: 'string',
      description: 'Currency for billing display',
    },
    date_format: {
      value: 'DD/MM/YYYY',
      dataType: 'string',
      description: 'Date display format',
      validation: { enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] },
    },
    time_format: {
      value: '24h',
      dataType: 'string',
      description: 'Time display format',
      validation: { enum: ['12h', '24h'] },
    },
  },
  branding: {
    logo_url: {
      value: null,
      dataType: 'string',
      description: 'Company logo URL',
    },
    theme: {
      value: 'light',
      dataType: 'string',
      description: 'UI theme',
      validation: { enum: ['light', 'dark', 'auto'] },
    },
    primary_color: {
      value: '#1E40AF',
      dataType: 'string',
      description: 'Primary brand color',
      validation: { pattern: '^#[0-9A-Fa-f]{6}$' },
    },
    company_name: {
      value: '',
      dataType: 'string',
      description: 'Company name for reports',
    },
    footer_text: {
      value: '',
      dataType: 'string',
      description: 'Custom footer text',
    },
  },
  notifications: {
    email_enabled: {
      value: true,
      dataType: 'boolean',
      description: 'Enable email notifications',
    },
    sms_enabled: {
      value: false,
      dataType: 'boolean',
      description: 'Enable SMS notifications',
    },
    push_enabled: {
      value: true,
      dataType: 'boolean',
      description: 'Enable push notifications',
    },
    webhook_enabled: {
      value: false,
      dataType: 'boolean',
      description: 'Enable webhook notifications',
    },
    webhook_url: {
      value: null,
      dataType: 'string',
      description: 'Webhook endpoint URL',
      validation: { pattern: '^https?://.*' },
    },
    alert_contacts: {
      value: [],
      dataType: 'array',
      description: 'Email contacts for alerts',
    },
    escalation_policy: {
      value: { enabled: false, levels: [] },
      dataType: 'json',
      description: 'Escalation policy for incidents',
    },
  },
  security: {
    mfa_required: {
      value: false,
      dataType: 'boolean',
      description: 'Require MFA for all users',
    },
    session_timeout: {
      value: 30,
      dataType: 'number',
      description: 'Session timeout in minutes',
      validation: { min: 5, max: 480 },
    },
    ip_whitelist: {
      value: [],
      dataType: 'array',
      description: 'IP whitelist for API access',
    },
    password_policy: {
      value: {
        min_length: 8,
        require_uppercase: true,
        require_lowercase: true,
        require_numbers: true,
        require_symbols: false,
        max_age_days: 90,
      },
      dataType: 'json',
      description: 'Password complexity policy',
    },
    api_rate_limit: {
      value: 1000,
      dataType: 'number',
      description: 'API rate limit per minute',
      validation: { min: 100, max: 100000 },
    },
  },
  integrations: {
    api_endpoint: {
      value: null,
      dataType: 'string',
      description: 'External API endpoint',
      isReadonly: true,
    },
    mqtt_broker: {
      value: 'mqtt://localhost:1883',
      dataType: 'string',
      description: 'MQTT broker URL',
    },
    storage_provider: {
      value: 'local',
      dataType: 'string',
      description: 'Storage provider',
      validation: { enum: ['local', 's3', 'gcs', 'azure'] },
    },
    storage_bucket: {
      value: null,
      dataType: 'string',
      description: 'Storage bucket name',
    },
    sms_provider: {
      value: null,
      dataType: 'string',
      description: 'SMS provider',
      validation: { enum: [null, 'twilio', 'nexmo'] },
    },
    maps_provider: {
      value: 'openstreetmap',
      dataType: 'string',
      description: 'Maps provider',
      validation: { enum: ['openstreetmap', 'google', 'mapbox'] },
    },
  },
};

const CACHE_PREFIX = 'tenant:settings:';
const CACHE_TTL = 300; // 5 minutes

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

function validateSettingValue(value, dataType, validation) {
  if (value === null || value === undefined) {
    return { valid: true, value };
  }

  switch (dataType) {
    case 'string': {
      if (typeof value !== 'string') {
        return { valid: false, error: `Expected string, got ${typeof value}` };
      }
      if (validation?.enum && !validation.enum.includes(value)) {
        return { valid: false, error: `Value must be one of: ${validation.enum.join(', ')}` };
      }
      if (validation?.pattern) {
        const regex = new RegExp(validation.pattern);
        if (!regex.test(value)) {
          return { valid: false, error: `Value does not match pattern: ${validation.pattern}` };
        }
      }
      break;
    }
    case 'number': {
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, error: `Expected number, got "${value}"` };
      }
      if (validation?.min !== undefined && num < validation.min) {
        return { valid: false, error: `Value must be >= ${validation.min}` };
      }
      if (validation?.max !== undefined && num > validation.max) {
        return { valid: false, error: `Value must be <= ${validation.max}` };
      }
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        return { valid: false, error: `Expected boolean, got ${typeof value}` };
      }
      break;
    }
    case 'json': {
      if (typeof value !== 'object') {
        return { valid: false, error: `Expected object, got ${typeof value}` };
      }
      break;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        return { valid: false, error: `Expected array, got ${typeof value}` };
      }
      break;
    }
  }

  return { valid: true, value };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function cacheKey(tenantId, category) {
  return category ? `${CACHE_PREFIX}${tenantId}:${category}` : `${CACHE_PREFIX}${tenantId}:all`;
}

async function getCachedSettings(tenantId, category) {
  const key = cacheKey(tenantId, category);
  const raw = await redisClient.get(key);
  if (raw) {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

async function setCachedSettings(tenantId, category, data) {
  const key = cacheKey(tenantId, category);
  await redisClient.setex(key, CACHE_TTL, JSON.stringify(data));
}

async function invalidateSettingsCache(tenantId) {
  const keys = await redisClient.scanKeys(`${CACHE_PREFIX}${tenantId}:*`);
  if (keys.length > 0) {
    await redisClient.del(...keys);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all settings for a tenant, grouped by category
 */
export async function getAllSettings(tenantId) {
  const cached = await getCachedSettings(tenantId, 'all');
  if (cached) return cached;

  const settings = await db.prisma.tenantSetting.findMany({
    where: { tenantId },
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  });

  const grouped = {};
  for (const s of settings) {
    if (!grouped[s.category]) grouped[s.category] = {};
    grouped[s.category][s.key] = {
      id: s.id,
      value: s.value,
      dataType: s.dataType,
      isSecret: s.isSecret,
      isReadonly: s.isReadonly,
      description: s.description,
      validation: s.validation,
      updatedAt: s.updatedAt,
    };
  }

  await setCachedSettings(tenantId, 'all', grouped);
  return grouped;
}

/**
 * Get settings by category
 */
export async function getSettingsByCategory(tenantId, category) {
  const allSettings = await getAllSettings(tenantId);
  return allSettings[category] || {};
}

/**
 * Get a single setting
 */
export async function getSetting(tenantId, category, key) {
  const allSettings = await getAllSettings(tenantId);
  return allSettings[category]?.[key] || null;
}

/**
 * Update a single setting
 */
export async function updateSetting(tenantId, category, key, value, userId, meta = {}) {
  // Check if setting definition exists
  const defaultDef = DEFAULT_SETTINGS[category]?.[key];
  if (!defaultDef) {
    // Allow dynamic settings without a default definition
  }

  const dataType = defaultDef?.dataType || 'string';
  const isReadonly = defaultDef?.isReadonly || false;
  const isSecret = defaultDef?.isSecret || false;

  if (isReadonly) {
    throw new Error('SETTING_READONLY');
  }

  // Validate value
  const validation = defaultDef?.validation;
  const result = validateSettingValue(value, dataType, validation);
  if (!result.valid) {
    throw new Error(`SETTING_INVALID: ${result.error}`);
  }

  // Get old value for audit
  const existing = await db.prisma.tenantSetting.findUnique({
    where: { tenantId_category_key: { tenantId, category, key } },
  });

  const oldValue = existing?.value ?? null;

  // Upsert the setting
  const setting = await db.prisma.tenantSetting.upsert({
    where: { tenantId_category_key: { tenantId, category, key } },
    update: { value: result.value, dataType },
    create: {
      tenantId,
      category,
      key,
      value: result.value,
      dataType,
      isSecret,
      isReadonly,
      description: defaultDef?.description || null,
      validation: validation || null,
    },
  });

  // Audit log
  await db.prisma.tenantAuditLog.create({
    data: {
      tenantId,
      userId: userId || null,
      action: existing ? 'setting:updated' : 'setting:created',
      category,
      settingKey: key,
      oldValue,
      newValue: result.value,
      ipAddress: meta.ipAddress || null,
      userAgent: meta.userAgent || null,
    },
  });

  // Invalidate cache
  await invalidateSettingsCache(tenantId);

  return {
    id: setting.id,
    category: setting.category,
    key: setting.key,
    value: setting.value,
    dataType: setting.dataType,
    isSecret: setting.isSecret,
    isReadonly: setting.isReadonly,
    description: setting.description,
    validation: setting.validation,
  };
}

/**
 * Bulk update settings in a category
 */
export async function bulkUpdateSettings(tenantId, category, settings, userId, meta = {}) {
  const results = [];
  const errors = [];

  for (const [key, value] of Object.entries(settings)) {
    try {
      const result = await updateSetting(tenantId, category, key, value, userId, meta);
      results.push(result);
    } catch (error) {
      errors.push({ key, error: error.message });
    }
  }

  return { results, errors };
}

/**
 * Validate settings without saving
 */
export async function validateSettings(tenantId, settings) {
  const errors = [];

  for (const [category, categorySettings] of Object.entries(settings)) {
    for (const [key, value] of Object.entries(categorySettings)) {
      const defaultDef = DEFAULT_SETTINGS[category]?.[key];
      const dataType = defaultDef?.dataType || 'string';
      const validation = defaultDef?.validation;

      const result = validateSettingValue(value, dataType, validation);
      if (!result.valid) {
        errors.push({ category, key, error: result.error });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Export all settings as JSON
 */
export async function exportSettings(tenantId) {
  const settings = await getAllSettings(tenantId);
  return {
    tenantId,
    exportedAt: new Date().toISOString(),
    settings,
  };
}

/**
 * Import settings from JSON (Super Admin only)
 */
export async function importSettings(tenantId, settingsData, userId, meta = {}) {
  const results = [];
  const errors = [];

  for (const [category, categorySettings] of Object.entries(settingsData)) {
    if (typeof categorySettings !== 'object') continue;
    for (const [key, value] of Object.entries(categorySettings)) {
      try {
        const result = await updateSetting(tenantId, category, key, value, userId, meta);
        results.push(result);
      } catch (error) {
        errors.push({ category, key, error: error.message });
      }
    }
  }

  return { results, errors };
}

/**
 * Reset a category to defaults
 */
export async function resetCategoryToDefaults(tenantId, category, userId, meta = {}) {
  const defaults = DEFAULT_SETTINGS[category];
  if (!defaults) {
    throw new Error(`Unknown category: ${category}`);
  }

  // Delete all existing settings in category
  await db.prisma.tenantSetting.deleteMany({
    where: { tenantId, category },
  });

  // Create defaults
  const created = [];
  for (const [key, def] of Object.entries(defaults)) {
    const setting = await db.prisma.tenantSetting.create({
      data: {
        tenantId,
        category,
        key,
        value: def.value,
        dataType: def.dataType,
        isSecret: def.isSecret || false,
        isReadonly: def.isReadonly || false,
        description: def.description || null,
        validation: def.validation || null,
      },
    });
    created.push(setting);
  }

  // Audit log
  await db.prisma.tenantAuditLog.create({
    data: {
      tenantId,
      userId: userId || null,
      action: 'setting:reset',
      category,
      settingKey: null,
      oldValue: null,
      newValue: { resetTo: 'defaults' },
      ipAddress: meta.ipAddress || null,
      userAgent: meta.userAgent || null,
    },
  });

  await invalidateSettingsCache(tenantId);
  return created;
}

/**
 * Seed default settings for a new tenant
 */
export async function seedDefaultSettings(tenantId) {
  const created = [];

  for (const [category, settings] of Object.entries(DEFAULT_SETTINGS)) {
    for (const [key, def] of Object.entries(settings)) {
      const setting = await db.prisma.tenantSetting.upsert({
        where: { tenantId_category_key: { tenantId, category, key } },
        update: {},
        create: {
          tenantId,
          category,
          key,
          value: def.value,
          dataType: def.dataType,
          isSecret: def.isSecret || false,
          isReadonly: def.isReadonly || false,
          description: def.description || null,
          validation: def.validation || null,
        },
      });
      created.push(setting);
    }
  }

  return created.length;
}

/**
 * Get settings audit history
 */
export async function getSettingsAuditLog(tenantId, options = {}) {
  const { skip = 0, take = 50, category, settingKey } = options;

  const where = { tenantId };
  if (category) where.category = category;
  if (settingKey) where.settingKey = settingKey;

  return db.prisma.tenantAuditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip,
    take,
  });
}

export default {
  DEFAULT_SETTINGS,
  getAllSettings,
  getSettingsByCategory,
  getSetting,
  updateSetting,
  bulkUpdateSettings,
  validateSettings,
  exportSettings,
  importSettings,
  resetCategoryToDefaults,
  seedDefaultSettings,
  getSettingsAuditLog,
};
