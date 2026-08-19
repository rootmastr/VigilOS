/**
 * VigilOS V3 — Database Seed Script
 * 
 * Migrates data from in-memory postgresAdapter to PostgreSQL via Prisma.
 * Run with: node prisma/seed.js
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════════════════

const TENANTS = [
  {
    id: 'ws-semarang-01',
    name: 'Dishub Kota Semarang',
    slug: 'semarang',
    status: 'ACTIVE',
    region: 'Jawa Tengah',
    contactEmail: 'admin@semarang.go.id',
    phone: '+62 24-5555-0100',
    address: 'Jl. Pemuda 148, Semarang',
    planTier: 'ENTERPRISE',
  },
];

const USERS = [
  {
    id: 'usr-01',
    tenantId: 'ws-semarang-01',
    email: 'admin@vigilos.id',
    name: 'Cmdr. Rahmat',
    password: 'admin123',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  },
  {
    id: 'usr-02',
    tenantId: 'ws-semarang-01',
    email: 'operator@vigilos.id',
    name: 'Operator 04',
    password: 'operator123',
    role: 'COMMAND_CENTER_OPERATOR',
    status: 'ACTIVE',
  },
  {
    id: 'usr-03',
    tenantId: 'ws-semarang-01',
    email: 'hendra@vigilos.id',
    name: 'Officer Hendra',
    password: 'officer123',
    role: 'PATROL_OFFICER',
    status: 'ACTIVE',
    officerId: 'OFF-101',
  },
  {
    id: 'usr-04',
    tenantId: 'ws-semarang-01',
    email: 'public@vigilos.id',
    name: 'Public User',
    password: 'public123',
    role: 'PUBLIC_USER',
    status: 'ACTIVE',
  },
  {
    id: 'usr-05',
    tenantId: 'ws-semarang-01',
    email: 'rina@semarang.go.id',
    name: 'Rina Wulandari',
    password: 'finance123',
    role: 'TENANT_FINANCE',
    status: 'ACTIVE',
    isMfaEnabled: true,
  },
  {
    id: 'usr-06',
    tenantId: 'ws-semarang-01',
    email: 'joko@semarang.go.id',
    name: 'Dispt. Joko',
    password: 'dispatch123',
    role: 'TENANT_DISPATCHER',
    status: 'ACTIVE',
  },
  {
    id: 'usr-07',
    tenantId: 'ws-semarang-01',
    email: 'sari@semarang.go.id',
    name: 'Auditor Sari',
    password: 'audit123',
    role: 'TENANT_AUDITOR',
    status: 'ACTIVE',
  },
];

const VEHICLES = [];

const DRIVERS = [];

const SUBSCRIPTIONS = [
  {
    id: 'sub-01',
    tenantId: 'ws-semarang-01',
    plan: 'ENTERPRISE',
    status: 'ACTIVE',
    pricePerMonth: 5000000,
    currency: 'IDR',
    currentPeriodStart: new Date('2026-08-01'),
    currentPeriodEnd: new Date('2026-09-01'),
    deviceLimit: 100,
    features: ['vehicles:read', 'vehicles:write', 'geofence', 'deviation_alerts', 'ai_reports', 'api_access', 'webhooks', 'priority_support', 'custom_branding', 'advanced_analytics'],
    vehicleCount: 0,
    officerCount: 0,
  },
];

const INVOICES = [];

const API_KEYS = [];

// ═══════════════════════════════════════════════════════════════════════════════
// SEED FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function seedTenants() {
  console.log(' Seeding tenants...');
  for (const tenant of TENANTS) {
    await prisma.tenant.upsert({
      where: { id: tenant.id },
      update: tenant,
      create: tenant,
    });
  }
  console.log(`  ✅ ${TENANTS.length} tenants seeded`);
}

async function seedUsers() {
  console.log(' Seeding users...');
  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        name: user.name,
        passwordHash,
        role: user.role,
        status: user.status,
        isMfaEnabled: user.isMfaEnabled || false,
        officerId: user.officerId || null,
      },
      create: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        passwordHash,
        role: user.role,
        status: user.status,
        isMfaEnabled: user.isMfaEnabled || false,
        officerId: user.officerId || null,
      },
    });
  }
  console.log(`  ✅ ${USERS.length} users seeded`);
}

async function seedVehicles() {
  console.log(' Seeding vehicles...');
  for (const vehicle of VEHICLES) {
    await prisma.vehicle.upsert({
      where: { id: vehicle.id },
      update: vehicle,
      create: vehicle,
    });
  }
  console.log(`  ✅ ${VEHICLES.length} vehicles seeded`);
}

async function seedDrivers() {
  console.log(' Seeding drivers...');
  for (const driver of DRIVERS) {
    await prisma.driver.upsert({
      where: { id: driver.id },
      update: driver,
      create: driver,
    });
  }
  console.log(`  ✅ ${DRIVERS.length} drivers seeded`);
}

async function seedSubscriptions() {
  console.log(' Seeding subscriptions...');
  for (const sub of SUBSCRIPTIONS) {
    await prisma.subscription.upsert({
      where: { id: sub.id },
      update: sub,
      create: sub,
    });
  }
  console.log(`  ✅ ${SUBSCRIPTIONS.length} subscriptions seeded`);
}

async function seedInvoices() {
  console.log(' Seeding invoices...');
  for (const invoice of INVOICES) {
    await prisma.invoice.upsert({
      where: { id: invoice.id },
      update: invoice,
      create: invoice,
    });
  }
  console.log(`  ✅ ${INVOICES.length} invoices seeded`);
}

async function seedApiKeys() {
  console.log(' Seeding API keys...');
  for (const key of API_KEYS) {
    await prisma.aPIKey.upsert({
      where: { id: key.id },
      update: key,
      create: key,
    });
  }
  console.log(`  ✅ ${API_KEYS.length} API keys seeded`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT SETTINGS & FEATURES (PRD §5 — Tenant Setting Management)
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_SETTINGS = {
  general: {
    timezone: { value: 'Asia/Jakarta', dataType: 'string', description: 'Timezone for date/time display', validation: { enum: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] } },
    language: { value: 'id', dataType: 'string', description: 'Interface language', validation: { enum: ['id', 'en'] } },
    currency: { value: 'IDR', dataType: 'string', description: 'Currency for billing display' },
    date_format: { value: 'DD/MM/YYYY', dataType: 'string', description: 'Date display format', validation: { enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] } },
    time_format: { value: '24h', dataType: 'string', description: 'Time display format', validation: { enum: ['12h', '24h'] } },
  },
  branding: {
    logo_url: { value: null, dataType: 'string', description: 'Company logo URL' },
    theme: { value: 'light', dataType: 'string', description: 'UI theme', validation: { enum: ['light', 'dark', 'auto'] } },
    primary_color: { value: '#1E40AF', dataType: 'string', description: 'Primary brand color', validation: { pattern: '^#[0-9A-Fa-f]{6}$' } },
    company_name: { value: '', dataType: 'string', description: 'Company name for reports' },
    footer_text: { value: '', dataType: 'string', description: 'Custom footer text' },
  },
  notifications: {
    email_enabled: { value: true, dataType: 'boolean', description: 'Enable email notifications' },
    sms_enabled: { value: false, dataType: 'boolean', description: 'Enable SMS notifications' },
    push_enabled: { value: true, dataType: 'boolean', description: 'Enable push notifications' },
    webhook_enabled: { value: false, dataType: 'boolean', description: 'Enable webhook notifications' },
    webhook_url: { value: null, dataType: 'string', description: 'Webhook endpoint URL' },
    alert_contacts: { value: [], dataType: 'array', description: 'Email contacts for alerts' },
    escalation_policy: { value: { enabled: false, levels: [] }, dataType: 'json', description: 'Escalation policy for incidents' },
  },
  security: {
    mfa_required: { value: false, dataType: 'boolean', description: 'Require MFA for all users' },
    session_timeout: { value: 30, dataType: 'number', description: 'Session timeout in minutes', validation: { min: 5, max: 480 } },
    ip_whitelist: { value: [], dataType: 'array', description: 'IP whitelist for API access' },
    password_policy: { value: { min_length: 8, require_uppercase: true, require_lowercase: true, require_numbers: true, require_symbols: false, max_age_days: 90 }, dataType: 'json', description: 'Password complexity policy' },
    api_rate_limit: { value: 1000, dataType: 'number', description: 'API rate limit per minute', validation: { min: 100, max: 100000 } },
  },
  integrations: {
    api_endpoint: { value: null, dataType: 'string', description: 'External API endpoint', isReadonly: true },
    mqtt_broker: { value: 'mqtt://localhost:1883', dataType: 'string', description: 'MQTT broker URL' },
    storage_provider: { value: 'local', dataType: 'string', description: 'Storage provider', validation: { enum: ['local', 's3', 'gcs', 'azure'] } },
    storage_bucket: { value: null, dataType: 'string', description: 'Storage bucket name' },
    sms_provider: { value: null, dataType: 'string', description: 'SMS provider', validation: { enum: [null, 'twilio', 'nexmo'] } },
    maps_provider: { value: 'openstreetmap', dataType: 'string', description: 'Maps provider', validation: { enum: ['openstreetmap', 'google', 'mapbox'] } },
  },
};

const ALL_FEATURES = [
  'vehicles:read', 'vehicles:write', 'geofence', 'deviation_alerts',
  'ai_reports', 'api_access', 'webhooks', 'priority_support',
  'custom_branding', 'advanced_analytics',
];

const PLAN_FEATURES = {
  TRIAL: ['vehicles:read'],
  STARTER: ['vehicles:read', 'vehicles:write', 'geofence', 'deviation_alerts'],
  PROFESSIONAL: ['vehicles:read', 'vehicles:write', 'geofence', 'deviation_alerts', 'ai_reports', 'api_access'],
  ENTERPRISE: ['vehicles:read', 'vehicles:write', 'geofence', 'deviation_alerts', 'ai_reports', 'api_access', 'webhooks', 'priority_support', 'custom_branding', 'advanced_analytics'],
};

async function seedTenantSettings() {
  console.log(' Seeding tenant settings...');
  let count = 0;

  for (const tenant of TENANTS) {
    for (const [category, settings] of Object.entries(DEFAULT_SETTINGS)) {
      for (const [key, def] of Object.entries(settings)) {
        await prisma.tenantSetting.upsert({
          where: { tenantId_category_key: { tenantId: tenant.id, category, key } },
          update: {},
          create: {
            tenantId: tenant.id,
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
        count++;
      }
    }
  }
  console.log(`  ✅ ${count} tenant settings seeded`);
}

async function seedTenantFeatures() {
  console.log(' Seeding tenant features...');
  let count = 0;

  for (const tenant of TENANTS) {
    const plan = tenant.planTier || 'ENTERPRISE';
    const planFeatures = PLAN_FEATURES[plan] || PLAN_FEATURES.TRIAL;

    for (const feature of ALL_FEATURES) {
      const enabled = planFeatures.includes(feature);
      await prisma.tenantFeature.upsert({
        where: { tenantId_feature: { tenantId: tenant.id, feature } },
        update: { enabled },
        create: { tenantId: tenant.id, feature, enabled },
      });
      count++;
    }
  }
  console.log(`  ✅ ${count} tenant features seeded`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🚀 VigilOS V3 — Database Seed Script');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Connect to database
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Seed data
    await seedTenants();
    await seedUsers();
    await seedVehicles();
    await seedDrivers();
    await seedSubscriptions();
    await seedInvoices();
    await seedApiKeys();
    await seedTenantSettings();
    await seedTenantFeatures();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🎉 Database seeding completed successfully!');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Print summary
    const counts = {
      tenants: await prisma.tenant.count(),
      users: await prisma.user.count(),
      vehicles: await prisma.vehicle.count(),
      drivers: await prisma.driver.count(),
      subscriptions: await prisma.subscription.count(),
      invoices: await prisma.invoice.count(),
      apiKeys: await prisma.aPIKey.count(),
      tenantSettings: await prisma.tenantSetting.count(),
      tenantFeatures: await prisma.tenantFeature.count(),
    };

    console.log('📊 Database Summary:');
    Object.entries(counts).forEach(([table, count]) => {
      console.log(`  ${table}: ${count} records`);
    });

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed
main();
