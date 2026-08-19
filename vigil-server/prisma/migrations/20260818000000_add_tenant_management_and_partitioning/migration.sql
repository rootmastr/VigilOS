-- VigilOS V3 Rev1 — Tenant Management & Partitioning Migration
-- Date: 2026-08-18
-- Description: Add Tenant model, RBAC tables, partitioning for audit_logs & usage_records

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. DROP OLD ENUMS AND RECREATE WITH CORRECT VALUES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop old enum values that conflict
DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "vehicles_code_key";
DROP INDEX IF EXISTS "subscriptions_tenantId_key";
DROP INDEX IF EXISTS "api_keys_keyHash_key";
DROP INDEX IF EXISTS "audit_logs_tenantId_createdAt_idx";
DROP INDEX IF EXISTS "audit_logs_userId_createdAt_idx";
DROP INDEX IF EXISTS "telemetry_vehicleId_timestamp_idx";

-- Drop tables that need recreation with new schema
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "api_keys" CASCADE;
DROP TABLE IF EXISTS "invoices" CASCADE;
DROP TABLE IF EXISTS "subscriptions" CASCADE;
DROP TABLE IF EXISTS "field_reports" CASCADE;
DROP TABLE IF EXISTS "incidents" CASCADE;
DROP TABLE IF EXISTS "vehicles" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "telemetry" CASCADE;

-- Drop old enums
DROP TYPE IF EXISTS "UserRole" CASCADE;
DROP TYPE IF EXISTS "UserStatus" CASCADE;
DROP TYPE IF EXISTS "VehicleType" CASCADE;
DROP TYPE IF EXISTS "VehicleStatus" CASCADE;
DROP TYPE IF EXISTS "IncidentType" CASCADE;
DROP TYPE IF EXISTS "IncidentSeverity" CASCADE;
DROP TYPE IF EXISTS "IncidentStatus" CASCADE;
DROP TYPE IF EXISTS "ReportType" CASCADE;
DROP TYPE IF EXISTS "ReportStatus" CASCADE;
DROP TYPE IF EXISTS "SubscriptionPlan" CASCADE;
DROP TYPE IF EXISTS "SubscriptionStatus" CASCADE;
DROP TYPE IF EXISTS "InvoiceStatus" CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. CREATE NEW ENUMS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE "UserRole" AS ENUM (
  'SUPER_ADMIN',
  'TENANT_ADMIN',
  'TENANT_FINANCE',
  'TENANT_DISPATCHER',
  'TENANT_AUDITOR',
  'COMMAND_CENTER_OPERATOR',
  'PATROL_OFFICER',
  'PUBLIC_USER'
);

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED');

CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'PENDING');

CREATE TYPE "VehicleType" AS ENUM ('BUS', 'MINIBUS', 'MICROBUS', 'SHUTTLE', 'PATROL', 'TRUCK', 'OTHER');

CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OFFLINE');

CREATE TYPE "IncidentType" AS ENUM (
  'PANIC_BUTTON', 'SPEED_VIOLATION', 'GEOFENCE_BREACH', 'HARSH_BRAKING',
  'COLLISION', 'THEFT_ATTEMPT', 'MECHANICAL_FAILURE', 'ROUTE_DEVIATION', 'OTHER'
);

CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'ACKNOWLEDGED', 'ESCALATED', 'RESOLVED', 'CLOSED');

CREATE TYPE "ReportType" AS ENUM (
  'ROUTE_COMPLIANCE', 'VEHICLE_CONDITION', 'INCIDENT_WITNESS',
  'WEATHER_CONDITION', 'ROAD_CONDITION', 'PASSENGER_COMPLAINT', 'OTHER'
);

CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'ARCHIVED');

CREATE TYPE "SubscriptionPlan" AS ENUM ('TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

CREATE TYPE "APIKeyStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TYPE "DeviceTokenStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TYPE "SlaDocumentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. CREATE TENANT TABLE (PRD §2.1 — Multi-Tenant Isolation)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "tenants" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
  "region" TEXT,
  "contactEmail" TEXT NOT NULL,
  "phone" TEXT,
  "address" TEXT,
  "config" JSONB NOT NULL DEFAULT '{}',
  "planTier" "SubscriptionPlan" NOT NULL DEFAULT 'TRIAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. CREATE TENANT SETTINGS & FEATURES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "tenant_settings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_settings_tenantId_key_key" ON "tenant_settings"("tenantId", "key");

CREATE TABLE "tenant_features" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_features_tenantId_feature_key" ON "tenant_features"("tenantId", "feature");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. CREATE RBAC TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "roles" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "permissions" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_tenantId_name_key" ON "roles"("tenantId", "name");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. CREATE USER TABLE (Updated with passwordHash, avatar, MFA)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'PATROL_OFFICER',
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "avatar" TEXT,
  "isMfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  "officerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_tenantId_email_idx" ON "users"("tenantId", "email");
CREATE INDEX "users_tenantId_role_idx" ON "users"("tenantId", "role");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. CREATE INVITATION TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "invitations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "roleId" TEXT,
  "invitedById" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");
CREATE INDEX "invitations_tenantId_email_idx" ON "invitations"("tenantId", "email");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. CREATE REFRESH TOKEN TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "refresh_tokens" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revoked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");
CREATE INDEX "refresh_tokens_userId_revoked_idx" ON "refresh_tokens"("userId", "revoked");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. CREATE VEHICLE TABLE (Updated with soft delete)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "vehicles" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "VehicleType" NOT NULL DEFAULT 'BUS',
  "lat" DOUBLE PRECISION NOT NULL DEFAULT -6.9666,
  "lng" DOUBLE PRECISION NOT NULL DEFAULT 110.4196,
  "heading" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "speed" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
  "driver" TEXT,
  "speedLimit" INTEGER NOT NULL DEFAULT 50,
  "heartBeatIntervalSec" INTEGER NOT NULL DEFAULT 10,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicles_tenantId_code_key" ON "vehicles"("tenantId", "code");
CREATE INDEX "vehicles_tenantId_status_idx" ON "vehicles"("tenantId", "status");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. CREATE DRIVER TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "drivers" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "vehicleId" TEXT,
  "licenseNo" TEXT NOT NULL,
  "phone" TEXT,
  "safetyScore" INTEGER NOT NULL DEFAULT 90,
  "status" TEXT NOT NULL DEFAULT 'normal',
  "trips" INTEGER NOT NULL DEFAULT 0,
  "hoursOnDuty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "drivers_tenantId_status_idx" ON "drivers"("tenantId", "status");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. CREATE OFFICER TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "officers" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rank" TEXT,
  "unit" TEXT,
  "phone" TEXT,
  "dutyStatus" TEXT NOT NULL DEFAULT 'offline',
  "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "officers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "officers_tenantId_dutyStatus_idx" ON "officers"("tenantId", "dutyStatus");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. CREATE INCIDENT TABLE (Updated with soft delete)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "incidents" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "officerId" TEXT,
  "type" "IncidentType" NOT NULL,
  "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
  "lat" DOUBLE PRECISION NOT NULL DEFAULT -6.9666,
  "lng" DOUBLE PRECISION NOT NULL DEFAULT 110.4196,
  "description" TEXT,
  "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "videos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "voiceNote" TEXT,
  "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "acknowledgedBy" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incidents_tenantId_status_idx" ON "incidents"("tenantId", "status");
CREATE INDEX "incidents_tenantId_createdAt_idx" ON "incidents"("tenantId", "createdAt");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 13. CREATE FIELD REPORT TABLE (Updated with soft delete)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "field_reports" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "officerId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "type" "ReportType" NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL DEFAULT -6.9666,
  "lng" DOUBLE PRECISION NOT NULL DEFAULT 110.4196,
  "description" TEXT NOT NULL,
  "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "audio" TEXT,
  "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "field_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "field_reports_tenantId_status_idx" ON "field_reports"("tenantId", "status");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 14. CREATE TELEMETRY TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "telemetry" (
  "id" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "speed" DOUBLE PRECISION NOT NULL,
  "heading" DOUBLE PRECISION NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "telemetry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telemetry_vehicleId_timestamp_idx" ON "telemetry"("vehicleId", "timestamp");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 15. CREATE SUBSCRIPTION TABLE (Updated with pricing fields)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "plan" "SubscriptionPlan" NOT NULL DEFAULT 'TRIAL',
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "pricePerMonth" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'IDR',
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3),
  "deviceLimit" INTEGER NOT NULL DEFAULT 10,
  "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "vehicleCount" INTEGER NOT NULL DEFAULT 0,
  "officerCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 16. CREATE INVOICE TABLE (Updated with line items & payment method)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "invoices" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IDR',
  "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
  "paymentMethod" TEXT,
  "invoiceNumber" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "lineItems" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
CREATE INDEX "invoices_tenantId_status_idx" ON "invoices"("tenantId", "status");
CREATE INDEX "invoices_tenantId_issuedAt_idx" ON "invoices"("tenantId", "issuedAt");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 17. CREATE API KEY TABLE (Updated with prefix & status)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "api_keys" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "APIKeyStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");
CREATE INDEX "api_keys_tenantId_status_idx" ON "api_keys"("tenantId", "status");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 18. CREATE DEVICE TOKEN TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "device_tokens" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "vehicleId" TEXT,
  "status" "DeviceTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_tokens_tokenHash_key" ON "device_tokens"("tokenHash");
CREATE INDEX "device_tokens_tenantId_deviceId_idx" ON "device_tokens"("tenantId", "deviceId");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 19. CREATE AUDIT LOG TABLE (PRD §3.4 — Partitioned by created_at)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "resource" TEXT,
  "resourceId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}',
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id", "createdAt")
);

CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 20. CREATE SECURITY EVENT TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "security_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "deviceId" TEXT,
  "ipAddress" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}',
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_events_tenantId_timestamp_idx" ON "security_events"("tenantId", "timestamp");
CREATE INDEX "security_events_eventType_timestamp_idx" ON "security_events"("eventType", "timestamp");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 21. CREATE SLA DOCUMENT TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "sla_documents" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "SlaDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sla_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sla_documents_tenantId_status_idx" ON "sla_documents"("tenantId", "status");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 22. CREATE USAGE RECORD TABLE (PRD §3.3 — Partitioned by period_start)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "usage_records" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "deviceCount" INTEGER NOT NULL DEFAULT 0,
  "apiCalls" BIGINT NOT NULL DEFAULT 0,
  "storageBytes" BIGINT NOT NULL DEFAULT 0,
  "activeUsers" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id", "periodStart")
);

CREATE INDEX "usage_records_tenantId_periodStart_idx" ON "usage_records"("tenantId", "periodStart");

-- ═══════════════════════════════════════════════════════════════════════════════
-- 23. ADD FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "drivers" ADD CONSTRAINT "drivers_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "officers" ADD CONSTRAINT "officers_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_officerId_fkey"
  FOREIGN KEY ("officerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_events" ADD CONSTRAINT "security_events_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sla_documents" ADD CONSTRAINT "sla_documents_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 24. SEED DATA — Default Tenant & Users
-- ═══════════════════════════════════════════════════════════════════════════════

-- Default tenant
INSERT INTO "tenants" ("id", "name", "slug", "status", "region", "contactEmail", "phone", "address", "planTier") VALUES
('ws-semarang-01', 'Dishub Kota Semarang', 'semarang', 'ACTIVE', 'Jawa Tengah', 'admin@semarang.go.id', '+62 24-5555-0100', 'Jl. Pemuda 148, Semarang', 'ENTERPRISE');

-- Default users (passwords are bcrypt hashed)
INSERT INTO "users" ("id", "tenantId", "email", "name", "passwordHash", "role", "status") VALUES
('usr-01', 'ws-semarang-01', 'admin@vigilos.id', 'Cmdr. Rahmat', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'SUPER_ADMIN', 'ACTIVE'),
('usr-02', 'ws-semarang-01', 'operator@vigilos.id', 'Operator 04', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'COMMAND_CENTER_OPERATOR', 'ACTIVE'),
('usr-03', 'ws-semarang-01', 'hendra@vigilos.id', 'Officer Hendra', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'PATROL_OFFICER', 'ACTIVE'),
('usr-04', 'ws-semarang-01', 'public@vigilos.id', 'Public User', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'PUBLIC_USER', 'ACTIVE'),
('usr-05', 'ws-semarang-01', 'rina@semarang.go.id', 'Rina Wulandari', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'TENANT_FINANCE', 'ACTIVE'),
('usr-06', 'ws-semarang-01', 'joko@semarang.go.id', 'Dispt. Joko', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'TENANT_DISPATCHER', 'ACTIVE'),
('usr-07', 'ws-semarang-01', 'sari@semarang.go.id', 'Auditor Sari', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'TENANT_AUDITOR', 'ACTIVE');

-- Default subscription
INSERT INTO "subscriptions" ("id", "tenantId", "plan", "status", "pricePerMonth", "currency", "currentPeriodStart", "currentPeriodEnd", "deviceLimit", "features", "vehicleCount", "officerCount") VALUES
('sub-001', 'ws-semarang-01', 'ENTERPRISE', 'ACTIVE', 45000000, 'IDR', '2024-08-01T00:00:00.000Z', '2024-09-01T00:00:00.000Z', 100, ARRAY['geofence', 'deviation_alerts', 'api_access', 'webhooks', 'ai_reports', 'priority_support'], 5, 4);

-- Default invoice
INSERT INTO "invoices" ("id", "tenantId", "subscriptionId", "amount", "currency", "status", "paymentMethod", "invoiceNumber", "issuedAt", "dueAt", "paidAt", "lineItems") VALUES
('INV-2024-001', 'ws-semarang-01', 'sub-001', 45000000, 'IDR', 'PAID', 'Virtual Account', 'VGL-2024-08-001', '2024-08-01T00:00:00.000Z', '2024-08-15T00:00:00.000Z', '2024-08-05T10:30:00.000Z', '[{"description":"ENTERPRISE Plan - August 2024","quantity":1,"unitPrice":45000000,"total":45000000}]');

-- Default vehicles
INSERT INTO "vehicles" ("id", "tenantId", "code", "name", "type", "lat", "lng") VALUES
('veh-bus-101', 'ws-semarang-01', 'TS-101', 'Koridor 1 - Terboyo Express', 'BUS', -6.9567, 110.4383),
('veh-bus-102', 'ws-semarang-01', 'TS-102', 'Koridor 1 - Simpang Lima', 'BUS', -6.9900, 110.4200),
('veh-bus-103', 'ws-semarang-01', 'TS-103', 'Koridor 2 - Pandanaran Feeder', 'BUS', -6.9750, 110.4220),
('veh-bus-104', 'ws-semarang-01', 'TS-104', 'Koridor 3 - Kota Lama Express', 'BUS', -6.9650, 110.4300),
('veh-patrol-01', 'ws-semarang-01', 'TS-P1', 'Patroli Kota Semarang', 'PATROL', -6.9700, 110.4250);

-- Default drivers
INSERT INTO "drivers" ("id", "tenantId", "name", "vehicleId", "licenseNo", "phone", "safetyScore", "status", "trips", "hoursOnDuty") VALUES
('DRV-101', 'ws-semarang-01', 'Budi Santoso', NULL, 'SIM-B2-99812', '+62 812-3456-7890', 92, 'normal', 142, 5.2),
('DRV-102', 'ws-semarang-01', 'Siti Aminah', NULL, 'SIM-B2-88714', '+62 813-9876-5432', 88, 'normal', 118, 4.8),
('DRV-103', 'ws-semarang-01', 'Agus Setiawan', NULL, 'SIM-B2-77123', '+62 815-2233-4455', 95, 'normal', 186, 6.1),
('DRV-104', 'ws-semarang-01', 'Dewi Lestari', NULL, 'SIM-B2-66541', '+62 817-6677-8899', 78, 'normal', 3, 0),
('DRV-105', 'ws-semarang-01', 'Officer Hendra', NULL, 'POL-A1-00912', '+62 811-9988-7766', 98, 'normal', 210, 7.0);

-- Default API keys
INSERT INTO "api_keys" ("id", "tenantId", "keyHash", "prefix", "name", "permissions", "status") VALUES
('key-001', 'ws-semarang-01', 'ak_prod_smg_a1b2c3d4e5f6g7h8i9j0', 'ak_prod_smg_', 'Production API Key', ARRAY['vehicles:read', 'incidents:read', 'telemetry:read'], 'ACTIVE'),
('key-002', 'ws-semarang-01', 'ak_stg_smg_x1y2z3w4v5u6t7s8r9q0', 'ak_stg_smg_', 'Staging Webhook Key', ARRAY['webhooks:write'], 'ACTIVE');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 25. PARTITIONING FUNCTIONS (PRD §3.3 & §3.4)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Function to create monthly partitions for audit_logs
CREATE OR REPLACE FUNCTION create_audit_logs_partition()
RETURNS TRIGGER AS $$
DECLARE
  partition_name TEXT;
  partition_date DATE;
BEGIN
  partition_date := DATE_TRUNC('month', NEW."createdAt");
  partition_name := 'audit_logs_' || TO_CHAR(partition_date, 'YYYY_MM');

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = partition_name) THEN
    EXECUTE FORMAT(
      'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      partition_date,
      partition_date + INTERVAL '1 month'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create monthly partitions for usage_records
CREATE OR REPLACE FUNCTION create_usage_records_partition()
RETURNS TRIGGER AS $$
DECLARE
  partition_name TEXT;
  partition_date DATE;
BEGIN
  partition_date := DATE_TRUNC('month', NEW."periodStart");
  partition_name := 'usage_records_' || TO_CHAR(partition_date, 'YYYY_MM');

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = partition_name) THEN
    EXECUTE FORMAT(
      'CREATE TABLE %I PARTITION OF usage_records FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      partition_date,
      partition_date + INTERVAL '1 month'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for auto-partitioning
CREATE TRIGGER audit_logs_partition_trigger
  BEFORE INSERT ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION create_audit_logs_partition();

CREATE TRIGGER usage_records_partition_trigger
  BEFORE INSERT ON "usage_records"
  FOR EACH ROW EXECUTE FUNCTION create_usage_records_partition();

-- Create initial partitions for current and next month
DO $$
DECLARE
  current_month DATE := DATE_TRUNC('month', CURRENT_DATE);
  next_month DATE := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
BEGIN
  -- Audit logs partitions
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_logs_' || TO_CHAR(current_month, 'YYYY_MM')) THEN
    EXECUTE FORMAT('CREATE TABLE audit_logs_%s PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
      TO_CHAR(current_month, 'YYYY_MM'), current_month, next_month);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_logs_' || TO_CHAR(next_month, 'YYYY_MM')) THEN
    EXECUTE FORMAT('CREATE TABLE audit_logs_%s PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
      TO_CHAR(next_month, 'YYYY_MM'), next_month, next_month + INTERVAL '1 month');
  END IF;

  -- Usage records partitions
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'usage_records_' || TO_CHAR(current_month, 'YYYY_MM')) THEN
    EXECUTE FORMAT('CREATE TABLE usage_records_%s PARTITION OF usage_records FOR VALUES FROM (%L) TO (%L)',
      TO_CHAR(current_month, 'YYYY_MM'), current_month, next_month);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'usage_records_' || TO_CHAR(next_month, 'YYYY_MM')) THEN
    EXECUTE FORMAT('CREATE TABLE usage_records_%s PARTITION OF usage_records FOR VALUES FROM (%L) TO (%L)',
      TO_CHAR(next_month, 'YYYY_MM'), next_month, next_month + INTERVAL '1 month');
  END IF;
END $$;
