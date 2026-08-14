-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DISPATCHER', 'OFFICER', 'VIEWER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED');
CREATE TYPE "VehicleType" AS ENUM ('BUS', 'MINIBUS', 'MICROBUS', 'SHUTTLE', 'PATROL', 'OTHER');
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OFFLINE');
CREATE TYPE "IncidentType" AS ENUM ('PANIC_BUTTON', 'SPEED_VIOLATION', 'GEOFENCE_BREACH', 'HARSH_BRAKING', 'COLLISION', 'THEFT_ATTEMPT', 'MECHANICAL_FAILURE', 'ROUTE_DEVIATION', 'OTHER');
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'ESCALATED', 'RESOLVED', 'CLOSED');
CREATE TYPE "ReportType" AS ENUM ('ROUTE_COMPLIANCE', 'VEHICLE_CONDITION', 'INCIDENT_WITNESS', 'WEATHER_CONDITION', 'ROAD_CONDITION', 'PASSENGER_COMPLAINT', 'OTHER');
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'ARCHIVED');
CREATE TYPE "SubscriptionPlan" AS ENUM ('TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateUsersTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OFFICER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateVehiclesTable
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "vehicles_code_key" ON "vehicles"("code");

-- CreateIncidentsTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
    "lat" DOUBLE PRECISION NOT NULL DEFAULT -6.9666,
    "lng" DOUBLE PRECISION NOT NULL DEFAULT 110.4196,
    "description" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "voiceNote" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateFieldReportsTable
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
    CONSTRAINT "field_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTelemetryTable
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

-- CreateIndex
CREATE INDEX "telemetry_vehicleId_timestamp_idx" ON "telemetry"("vehicleId", "timestamp");

-- CreateSubscriptionsTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'TRIAL',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "vehicleCount" INTEGER NOT NULL DEFAULT 0,
    "officerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");

-- CreateInvoicesTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateAPIKeysTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateAuditLogsTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- SeedData
INSERT INTO "users" ("id", "tenantId", "email", "name", "role", "status") VALUES
('usr-admin-001', 'ws-semarang-01', 'admin@semarang.go.id', 'Administrator', 'ADMIN', 'ACTIVE'),
('usr-dispatcher-001', 'ws-semarang-01', 'dispatcher@semarang.go.id', 'Dispatcher', 'DISPATCHER', 'ACTIVE'),
('usr-officer-001', 'ws-semarang-01', 'budi@semarang.go.id', 'Budi Hartono', 'OFFICER', 'ACTIVE'),
('usr-officer-002', 'ws-semarang-01', 'sari@semarang.go.id', 'Sari Dewi', 'OFFICER', 'ACTIVE');

INSERT INTO "vehicles" ("id", "tenantId", "code", "name", "type", "lat", "lng") VALUES
('veh-bus-101', 'ws-semarang-01', 'TS-101', 'Koridor 1 - Terboyo Express', 'BUS', -6.9567, 110.4383),
('veh-bus-102', 'ws-semarang-01', 'TS-102', 'Koridor 1 - Simpang Lima', 'BUS', -6.9900, 110.4200),
('veh-bus-103', 'ws-semarang-01', 'TS-103', 'Koridor 2 - Pandanaran Feeder', 'BUS', -6.9750, 110.4220),
('veh-bus-104', 'ws-semarang-01', 'TS-104', 'Koridor 3 - Kota Lama Express', 'BUS', -6.9650, 110.4300),
('veh-patrol-01', 'ws-semarang-01', 'TS-P1', 'Patroli Kota Semarang', 'PATROL', -6.9700, 110.4250);

INSERT INTO "subscriptions" ("id", "tenantId", "plan", "status", "startDate", "vehicleCount", "officerCount") VALUES
('sub-semarang-01', 'ws-semarang-01', 'ENTERPRISE', 'ACTIVE', '2024-01-01T00:00:00.000Z', 5, 4);
