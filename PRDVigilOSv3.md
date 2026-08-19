# Product Requirements Document (PRD)
## VigilOS V3 — B2B Tenant Management System & Tenant Portal

**Versi Dokumen:** 3.0.0
**Tanggal:** 18 Agustus 2026
**Status:** Draft — Menunggu Review

---

## 1. Ringkasan Eksekutif

Dokumen ini mendefinisikan arsitektur, fitur, dan rekomendasi implementasi untuk **VigilOS V3** dengan fokus pada **B2B Tenant Management System**. VigilOS bertransformasi dari single-tenant fleet management menjadi **multi-tenant SaaS platform** yang memungkinkan berbagai organisasi (Dishub, perusahaan transportasi, logistik) beroperasi secara terisolasi dalam satu instansi VigilOS.

### Tujuan V3
1. **Multi-Tenant Isolation** — Data, konfigurasi, dan akses setiap tenant terisolasi sempurna
2. **Self-Service Tenant Portal** — Tenant admin dapat mengelola tim, billing, API, dan konfigurasi tanpa bantuan VigilOS staff
3. **B2B Billing & Subscription** — Sistem langganan berjenjang dengan invoice otomatis
4. **Tenant Onboarding** — Provisi otomatis workspace baru dalam hitungan detik
5. **Observability per Tenant** — Monitoring konsumsi sumber daya dan SLA compliance per tenant

---

## 2. Arsitektur Multi-Tenancy

### 2.1. Strategi Isolasi

Rekomendasi: **Shared Database, Shared Schema with Tenant ID Discriminator**

```
┌─────────────────────────────────────────────────────────────┐
│                      NGINX / API GATEWAY                     │
│         Rate Limiting • JWT Validation • Tenant Resolution   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐  │
│  │  Command     │   │  Tenant     │   │  Super Admin    │  │
│  │  Center      │   │  Portal     │   │  Dashboard      │  │
│  │  (Web App)   │   │  (Web App)  │   │  (Web App)      │  │
│  └──────┬──────┘   └──────┬──────┘   └────────┬────────┘  │
│         │                  │                    │           │
│         └──────────────────┼────────────────────┘           │
│                            │                                │
│  ┌─────────────────────────┴─────────────────────────────┐  │
│  │              VIGIL-SERVER (Node.js/Express)            │  │
│  │                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │  │
│  │  │ Tenant       │  │ RBAC         │  │ Audit       │ │  │
│  │  │ Middleware   │  │ Middleware   │  │ Middleware  │ │  │
│  │  │ (resolve     │  │ (enforce     │  │ (log all   │ │  │
│  │  │  tenantId)   │  │  permissions)│  │  actions)  │ │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │              Service Layer                       │  │  │
│  │  │  Fleet • Incident • Telemetry • Billing • Portal │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────┴───────────────────────────────┐  │
│  │                    Data Layer                          │  │
│  │  PostgreSQL (shared) ── InfluxDB ── Redis              │  │
│  │  WHERE tenant_id = ? (row-level security)              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2. Tenant Resolution Flow

```
Request → Nginx → Express
  │
  ├─ 1. Extract tenant from:
  │     • JWT token claim (user session)
  │     • X-Tenant-ID header (API key)
  │     • Subdomain (portal.vigilos.io)
  │
  ├─ 2. Attach tenant context to request:
  │     req.tenant = { id, name, plan, status, config }
  │
  ├─ 3. Middleware chain:
  │     TenantGuard → RBACAudit → Route Handler
  │
  └─ 4. All DB queries filtered by tenant_id (Prisma middleware)
```

### 2.3. Database Schema (Enhanced)

#### Core Tenant Tables

```sql
-- Tenant registry
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          VARCHAR(50) UNIQUE NOT NULL,          -- e.g., "dishub-semarang"
  name          VARCHAR(255) NOT NULL,
  domain        VARCHAR(255),                          -- custom domain
  logo_url      TEXT,
  status        tenant_status DEFAULT 'ACTIVE',        -- ACTIVE, SUSPENDED, TRIAL, CANCELLED
  plan          subscription_plan DEFAULT 'BASIC',     -- BASIC, PRO, ENTERPRISE
  config        JSONB DEFAULT '{}',                    -- tenant-specific settings
  max_devices   INT DEFAULT 10,
  max_users     INT DEFAULT 5,
  trial_ends_at TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Tenant configuration (flat key-value for flexibility)
CREATE TABLE tenant_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  category    VARCHAR(50) NOT NULL,                   -- "branding", "notification", "security"
  key         VARCHAR(100) NOT NULL,
  value       JSONB NOT NULL,
  UNIQUE(tenant_id, category, key)
);

-- Feature flags per tenant
CREATE TABLE tenant_features (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL,                  -- "geofencing", "analytics", "api_access"
  enabled     BOOLEAN DEFAULT false,
  config      JSONB DEFAULT '{}',
  UNIQUE(tenant_id, feature_key)
);
```

#### Enhanced Identity & RBAC

```sql
-- Users (enhanced)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(255),
  avatar_url      TEXT,
  is_mfa_enabled  BOOLEAN DEFAULT false,
  mfa_secret      VARCHAR(255),
  status          user_status DEFAULT 'ACTIVE',        -- ACTIVE, SUSPENDED, INVITED
  last_login_at   TIMESTAMP,
  login_count     INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- Roles (system-defined + custom)
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system role
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  is_system   BOOLEAN DEFAULT false,                  -- cannot delete system roles
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

-- Permissions (granular)
CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module      VARCHAR(50) NOT NULL,                   -- "fleet", "incident", "billing"
  action      VARCHAR(50) NOT NULL,                   -- "read", "write", "delete", "manage"
  description TEXT,
  UNIQUE(module, action)
);

-- Role-Permission mapping
CREATE TABLE role_permissions (
  role_id       UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- User-Role assignment
CREATE TABLE user_roles (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id     UUID REFERENCES roles(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id, tenant_id)
);

-- Invitations
CREATE TABLE invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  role_id     UUID REFERENCES roles(id),
  token       VARCHAR(255) UNIQUE NOT NULL,
  invited_by  UUID REFERENCES users(id),
  expires_at  TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

#### Billing & Subscription

```sql
-- Subscription plans (reference data)
CREATE TABLE subscription_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,               -- "BASIC", "PRO", "ENTERPRISE"
  display_name    VARCHAR(255) NOT NULL,
  price_monthly   DECIMAL(12,2) NOT NULL,              -- in IDR
  price_yearly    DECIMAL(12,2),
  max_devices     INT NOT NULL,
  max_users       INT NOT NULL,
  max_api_calls   INT NOT NULL,                        -- per month
  features        JSONB DEFAULT '[]',                  -- list of feature keys included
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Tenant subscriptions
CREATE TABLE subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id           UUID REFERENCES subscription_plans(id),
  status            subscription_status DEFAULT 'ACTIVE',
  billing_cycle     billing_cycle DEFAULT 'MONTHLY',
  current_period_start TIMESTAMP NOT NULL,
  current_period_end   TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  payment_method    JSONB,                             -- encrypted payment details
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  invoice_number  VARCHAR(50) UNIQUE NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  tax_amount      DECIMAL(12,2) DEFAULT 0,
  total_amount    DECIMAL(12,2) NOT NULL,
  currency        VARCHAR(3) DEFAULT 'IDR',
  status          invoice_status DEFAULT 'PENDING',    -- PENDING, PAID, OVERDUE, CANCELLED
  due_date        DATE NOT NULL,
  paid_at         TIMESTAMP,
  payment_method  VARCHAR(50),
  pdf_url         TEXT,
  line_items      JSONB DEFAULT '[]',
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Usage tracking (per tenant, per billing cycle)
CREATE TABLE usage_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  period_start    TIMESTAMP NOT NULL,
  period_end      TIMESTAMP NOT NULL,
  device_count    INT DEFAULT 0,
  api_calls       BIGINT DEFAULT 0,
  storage_bytes   BIGINT DEFAULT 0,
  active_users    INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW()
);
```

#### API Key Management

```sql
CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  key_hash      VARCHAR(255) UNIQUE NOT NULL,
  key_prefix    VARCHAR(10) NOT NULL,                  -- first 8 chars for display
  scopes        JSONB DEFAULT '[]',                    -- ["fleet:read", "telemetry:write"]
  rate_limit    INT DEFAULT 1000,                      -- requests per minute
  expires_at    TIMESTAMP,
  last_used_at  TIMESTAMP,
  usage_count   BIGINT DEFAULT 0,
  status        api_key_status DEFAULT 'ACTIVE',
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMP DEFAULT NOW()
);
```

#### Audit & Compliance

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,                   -- "user.login", "vehicle.create"
  resource    VARCHAR(100),                            -- "vehicle:v123"
  details     JSONB DEFAULT '{}',
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- SLA tracking
CREATE TABLE sla_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  metric          VARCHAR(100) NOT NULL,               -- "uptime", "response_time"
  target_value    DECIMAL(10,2) NOT NULL,
  actual_value    DECIMAL(10,2),
  period_start    TIMESTAMP NOT NULL,
  period_end      TIMESTAMP NOT NULL,
  is_compliant    BOOLEAN,
  created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## 3. Tenant Portal — Feature Specification

### 3.1. Portal Dashboard

| Komponen | Deskripsi |
|----------|-----------|
| **KPI Cards** | Total kendaraan aktif, insiden bulan ini, uptime SLA, pengguna aktif |
| **Usage Chart** | Grafik penggunaan device & API calls (30 hari terakhir) |
| **Subscription Card** | Status langganan, tanggal perpanjangan, sisa kuota |
| **Recent Activity** | Log aktivitas terakhir (login, perubahan konfigurasi, dll) |
| **Alert Banner** | Peringatan: kuota hampir habis, SLA breach, invoice overdue |

### 3.2. Tenant Settings (NEW — V3 Core)

#### 3.2.1. General Settings
- **Profil Organisasi**: Nama, alamat, kontak, logo, domain kustom
- **Branding**: Warna tema, logo portal, email template kustom
- **Lokasi & Zona Waktu**: Timezone, format tanggal, bahasa

#### 3.2.2. Notification Settings
- **Email Notification**: Toggle per jenis notifikasi (insiden, SLA, billing)
- **Webhook Configuration**: URL endpoint untuk integrasi eksternal
- **Alert Thresholds**: Konfigurasi threshold notifikasi (kecepatan, waktu respons)
- **Escalation Policy**: Urutan notifikasi berdasarkan severity

#### 3.2.3. Security Settings
- **MFA Enforcement**: Wajibkan MFA untuk semua pengguna
- **Password Policy**: Minimum length, complexity, expiry
- **Session Management**: Maximum concurrent sessions, idle timeout
- **IP Whitelist**: Batasi akses dari IP tertentu
- **API Rate Limit**: Konfigurasi rate limit per API key

#### 3.2.4. Integration Settings
- **SAML/SSO Configuration**: IdP metadata, certificate, mapping
- **Webhook URLs**: Endpoint untuk event notifikasi
- **Third-Party Integrations**: Google Maps, FCM, MQTT broker config

### 3.3. Team Management (Enhanced)

| Fitur | Deskripsi |
|-------|-----------|
| **User List** | Tabel dengan filter, search, pagination, bulk actions |
| **Invite Users** | Multi-email invite dengan role assignment & custom message |
| **Role Management** | System roles + custom roles dengan granular permissions |
| **User Profile** | Detail user, activity log, session history |
| **Bulk Actions** | Suspend, activate, delete multiple users |
| **User Impersonation** | Super Admin dapat impersonate tenant user (dengan audit log) |

### 3.4. Subscription & Billing (Enhanced)

| Fitur | Deskripsi |
|-------|-----------|
| **Plan Comparison** | Tabel perbandingan fitur antar tier |
| **Upgrade/Downgrade** | Prorated billing saat pergantian plan |
| **Payment Methods** | Kelola kartu kredit, virtual account |
| **Invoice History** | Daftar invoice dengan download PDF |
| **Usage Dashboard** | Grafik konsumsi device, API calls, storage |
| **Billing Alerts** | Notifikasi saat mendekati batas kuota |
| **Auto-Renewal** | Toggle perpanjangan otomatis |

### 3.5. API Management (Enhanced)

| Fitur | Deskripsi |
|-------|-----------|
| **API Keys** | Create, revoke, rotate, set expiration |
| **Scope Management** | Granular permission per API key |
| **Usage Analytics** | Grafik API calls per jam/hari/bulan |
| **Rate Limit Config** | Set rate limit per API key |
| **Webhook Logs** | Logs untuk webhook yang dikirim |
| **API Documentation** | Interactive API docs (Swagger/OpenAPI) |

### 3.6. SLA & Compliance (Enhanced)

| Fitur | Deskripsi |
|-------|-----------|
| **SLA Dashboard** | Real-time compliance status per metrik |
| **SLA History** | Histori compliance per bulan |
| **Incident Reports** | Laporan insiden otomatis |
| **Compliance Reports** | Export laporan kepatuhan (PDF/CSV) |
| **Audit Trail** | Log semua aktivitas tenant dengan filter |

### 3.7. Device & Fleet Settings

| Fitur | Deskripsi |
|-------|-----------|
| **Device Quota** | Visualisasi penggunaan device vs kuota |
| **Device Tokens** | Kelola token per device |
| **Geofence Config** | Konfigurasi zona geofence per tenant |
| **Alert Rules** | Aturan custom alert per tenant |
| **Route Config** | Konfigurasi route & stop untuk public transit |

---

## 4. API Design — Tenant Management Endpoints

### 4.1. Tenant CRUD (Super Admin Only)

```
POST   /api/v3/admin/tenants              — Create tenant
GET    /api/v3/admin/tenants              — List all tenants (paginated, filterable)
GET    /api/v3/admin/tenants/:id          — Tenant details + stats
PUT    /api/v3/admin/tenants/:id          — Update tenant
DELETE /api/v3/admin/tenants/:id          — Soft delete tenant
POST   /api/v3/admin/tenants/:id/suspend  — Suspend tenant
POST   /api/v3/admin/tenants/:id/reactivate — Reactivate tenant
GET    /api/v3/admin/tenants/:id/usage    — Usage statistics
POST   /api/v3/admin/tenants/:id/provision — Auto-provision workspace
```

### 4.2. Tenant Settings (Tenant Admin)

```
GET    /api/v3/tenant/settings             — Get all settings
PUT    /api/v3/tenant/settings/:category   — Update settings by category
GET    /api/v3/tenant/settings/:category/:key — Get specific setting
PUT    /api/v3/tenant/settings/:category/:key — Update specific setting
DELETE /api/v3/tenant/settings/:category/:key — Delete setting
```

### 4.3. User Management (Tenant Admin)

```
GET    /api/v3/tenant/users               — List users
POST   /api/v3/tenant/users/invite        — Invite user
GET    /api/v3/tenant/users/:id           — User details
PUT    /api/v3/tenant/users/:id           — Update user
DELETE /api/v3/tenant/users/:id           — Remove user
POST   /api/v3/tenant/users/:id/suspend   — Suspend user
POST   /api/v3/tenant/users/:id/activate  — Activate user
POST   /api/v3/tenant/users/bulk-action   — Bulk operations
GET    /api/v3/tenant/users/:id/activity  — User activity log
```

### 4.4. Role Management

```
GET    /api/v3/tenant/roles               — List roles
POST   /api/v3/tenant/roles               — Create custom role
PUT    /api/v3/tenant/roles/:id           — Update role
DELETE /api/v3/tenant/roles/:id           — Delete custom role
GET    /api/v3/tenant/roles/:id/permissions — Get role permissions
PUT    /api/v3/tenant/roles/:id/permissions — Update role permissions
GET    /api/v3/permissions                — List all available permissions
```

### 4.5. Subscription & Billing

```
GET    /api/v3/tenant/subscription        — Current subscription
PUT    /api/v3/tenant/subscription        — Update subscription (upgrade/downgrade)
POST   /api/v3/tenant/subscription/cancel — Cancel subscription
GET    /api/v3/tenant/invoices            — List invoices
GET    /api/v3/tenant/invoices/:id        — Invoice details
GET    /api/v3/tenant/invoices/:id/pdf    — Download invoice PDF
GET    /api/v3/tenant/usage               — Usage summary
GET    /api/v3/tenant/usage/history       — Usage history (chart data)
```

### 4.6. API Key Management

```
GET    /api/v3/tenant/api-keys            — List API keys
POST   /api/v3/tenant/api-keys            — Create API key
GET    /api/v3/tenant/api-keys/:id        — API key details
PUT    /api/v3/tenant/api-keys/:id        — Update API key
DELETE /api/v3/tenant/api-keys/:id        — Revoke API key
POST   /api/v3/tenant/api-keys/:id/rotate — Rotate API key
GET    /api/v3/tenant/api-keys/:id/usage  — API key usage stats
```

### 4.7. Audit & Compliance

```
GET    /api/v3/tenant/audit-logs          — List audit logs (filterable)
GET    /api/v3/tenant/audit-logs/export   — Export audit logs (CSV/JSON)
GET    /api/v3/tenant/sla                 — SLA status
GET    /api/v3/tenant/sla/history         — SLA compliance history
GET    /api/v3/tenant/reports             — Available reports
POST   /api/v3/tenant/reports/generate    — Generate compliance report
GET    /api/v3/tenant/reports/:id         — Get report
GET    /api/v3/tenant/reports/:id/download — Download report
```

### 4.8. Portal Dashboard

```
GET    /api/v3/tenant/dashboard           — Dashboard stats
GET    /api/v3/tenant/activity            — Recent activity feed
GET    /api/v3/tenant/alerts              — Active alerts
GET    /api/v3/tenant/notifications       — Notification list
PUT    /api/v3/tenant/notifications/:id/read — Mark as read
```

---

## 5. Rekomendasi Sistem B2B

### 5.1. Pendekatan: Build vs Buy

| Aspek | Build In-House | Third-Party SaaS |
|-------|---------------|------------------|
| **Kontrol** | ✅ Full control | ⚠️ Limited |
| **Biaya Awal** | ❌ Tinggi (3-6 bulan dev) | ✅ Low (subscription) |
| **Maintenance** | ❌ Tim khusus | ✅ Managed by vendor |
| **Customization** | ✅ Unlimited | ⚠️ Terbatas |
| **Time to Market** | ❌ 3-6 bulan | ✅ 1-2 minggu |
| **Skalabilitas** | ⚠️ Perlu effort | ✅ Auto-scale |

### 5.2. Rekomendasi: Hybrid Approach

**Build** untuk komponen inti yang memerlukan kontrol penuh:
- Tenant data isolation & RBAC
- Fleet management core
- Telemetry pipeline
- Real-time WebSocket

**Buy/Integrate** untuk komponen pendukung:
- Billing & Payment: **Midtrans** (Indonesia) atau **Stripe**
- Email Transactional: **SendGrid** atau **Mailgun**
- SSO/SAML: **WorkOS** atau **Auth0**
- Monitoring: Tetap **Prometheus + Grafana** (sudah ada)
- PDF Generation: **Puppeteer** atau **WeasyPrint**

### 5.3. Rekomendasi Stack Teknologi

#### Backend Enhancement
```
Node.js/Express (existing)
  + Prisma ORM (aktifkan, ganti in-memory adapter)
  + Bull/BullMQ (job queue untuk invoice generation, report generation)
  + node-cron (scheduled tasks: usage aggregation, invoice generation)
  + ioredis (existing, extend untuk session management)
```

#### Frontend Enhancement
```
React/Vite (existing)
  + TanStack Table (advanced data tables)
  + React Hook Form + Zod (form validation)
  + Recharts (existing, extend untuk billing charts)
  + Shadcn/ui (enterprise-grade UI components)
```

#### Infrastructure
```
PostgreSQL 16 (shared database, row-level security)
Redis 7 (session, cache, rate limiting, job queue)
InfluxDB 2.7 (telemetry time-series)
Mosquitto (MQTT broker)
```

---

## 6. Implementation Phases

### Phase 3A — Foundation (4 minggu)

| Week | Task | Deliverable |
|------|------|-------------|
| 1 | Database schema migration ke Prisma aktif | Prisma client, migrations, seed data |
| 1 | Tenant middleware & resolution | `tenantGuard.js`, `tenantContext.js` |
| 2 | RBAC middleware enhancement | Permission matrix, role hierarchy |
| 2 | User invitation flow | Email template, token generation, acceptance flow |
| 3 | Tenant Settings API | CRUD endpoints untuk tenant settings |
| 3 | Tenant Settings UI | Settings page di Portal (general, notification, security) |
| 4 | Testing & documentation | Unit tests, API docs, integration tests |

### Phase 3B — Billing & Subscription (4 minggu)

| Week | Task | Deliverable |
|------|------|-------------|
| 5 | Subscription plan management | Plan CRUD, pricing table |
| 5 | Invoice generation engine | Monthly invoice generation, PDF export |
| 6 | Usage tracking & aggregation | Usage recording, periodic aggregation |
| 6 | Midtrans payment integration | Payment link, callback handling |
| 7 | Billing dashboard UI | Usage charts, invoice list, payment history |
| 7 | Billing alerts & notifications | Email alerts for quota, overdue |
| 8 | Testing & QA | End-to-end billing flow tests |

### Phase 3C — Advanced Features (4 minggu)

| Week | Task | Deliverable |
|------|------|-------------|
| 9 | SSO/SAML integration (WorkOS) | SSO configuration page, SAML metadata |
| 9 | Custom role management | Role CRUD, permission assignment UI |
| 10 | API key management enhancement | Scope-based keys, usage analytics |
| 10 | SLA tracking engine | Automated SLA monitoring, compliance reports |
| 11 | Audit log enhancement | Structured logging, export, filtering |
| 11 | Super Admin dashboard | Tenant overview, system health, revenue metrics |
| 12 | Security hardening | MFA enforcement, IP whitelist, session management |

---

## 7. Security Considerations

### 7.1. Tenant Isolation

```javascript
// Prisma middleware — automatic tenant filtering
prisma.$use(async (params, next) => {
  const tenantId = params.args?.tenantId || context.tenant?.id;

  if (tenantId && isTenantScopedModel(params.model)) {
    // Inject tenant_id filter
    params.args.where = { ...params.args.where, tenantId };
  }

  return next(params);
});
```

### 7.2. API Security Matrix

| Endpoint | Super Admin | Tenant Admin | Tenant Finance | Tenant Auditor |
|----------|-------------|--------------|----------------|----------------|
| Tenant CRUD | ✅ | ❌ | ❌ | ❌ |
| User Management | ✅ | ✅ (own tenant) | ❌ | ❌ (read only) |
| Billing | ✅ | ✅ | ✅ | ❌ (read only) |
| API Keys | ✅ | ✅ | ❌ | ❌ |
| Audit Logs | ✅ | ✅ | ✅ | ✅ (read only) |
| Settings | ✅ | ✅ | ❌ | ❌ |

### 7.3. Data Encryption

- **At Rest**: PostgreSQL transparent data encryption
- **In Transit**: TLS 1.3 for all connections
- **Sensitive Fields**: Payment methods encrypted with AES-256
- **API Keys**: Stored as SHA-256 hashes, only plaintext shown on creation

---

## 8. Monitoring & Observability

### 8.1. Metrics per Tenant

```
vigilos_tenant_device_count{tenant="dishub-semarang"}
vigilos_tenant_api_calls_total{tenant="dishub-semarang"}
vigilos_tenant_active_users{tenant="dishub-semarang"}
vigilos_tenant_storage_bytes{tenant="dishub-semarang"}
vigilos_tenant_incident_count{tenant="dishub-semarang"}
```

### 8.2. Alerting Rules

```yaml
groups:
  - name: tenant_alerts
    rules:
      - alert: TenantQuotaWarning
        expr: vigilos_tenant_device_count / vigilos_tenant_max_devices > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Tenant {{ $labels.tenant }} using >80% device quota"

      - alert: TenantSLABreach
        expr: vigilos_tenant_sla_uptime < 0.99
        for: 15m
        labels:
          severity: critical
        annotations:
          summary: "Tenant {{ $labels.tenant }} SLA breach"

      - alert: TenantHighAPIUsage
        expr: rate(vigilos_tenant_api_calls_total[5m]) > 800
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Tenant {{ $labels.tenant }} API usage near limit"
```

---

## 9. UI/UX Design Guidelines

### 9.1. Portal Layout

```
┌──────────────────────────────────────────────────────────┐
│  LOGO    [Tenant Name]              🔔  👤 Admin User ▼  │
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│ Dashboard│     ┌─────────────────────────────────────┐   │
│          │     │                                     │   │
│ Team     │     │         MAIN CONTENT AREA           │   │
│  ├ Users │     │                                     │   │
│  ├ Roles │     │                                     │   │
│          │     │                                     │   │
│ Billing  │     │                                     │   │
│  ├ Plans │     │                                     │   │
│  ├ Invoices    │                                     │   │
│          │     │                                     │   │
│ API Keys │     └─────────────────────────────────────┘   │
│          │                                               │
│ Settings │                                               │
│  ├ General   ┌─────────────────────────────────────┐   │
│  ├ Security  │ Quick Actions  │  Usage Stats       │   │
│  ├ Notif │     │  Alerts      │  SLA Status        │   │
│  └ Integration│ └─────────────────────────────────────┘   │
│          │                                               │
│ SLA      │                                               │
│ Audit    │                                               │
│          │                                               │
├──────────┴───────────────────────────────────────────────┤
│  © 2026 VigilOS  │  Privacy  │  Terms  │  Support       │
└──────────────────────────────────────────────────────────┘
```

### 9.2. Design System

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#2563EB` | Primary actions, links |
| `--success` | `#16A34A` | Active status, success |
| `--warning` | `#CA8A04` | Warnings, pending |
| `--danger` | `#DC2626` | Errors, critical alerts |
| `--bg-surface` | `#F8FAFC` | Card backgrounds |
| `--bg-page` | `#F1F5F9` | Page background |
| `--text-primary` | `#0F172A` | Primary text |
| `--text-secondary` | `#64748B` | Secondary text |

### 9.3. Component Library

Rekomendasi menggunakan **Shadcn/ui** (compatible dengan React + Tailwind):
- Data tables dengan sorting, filtering, pagination
- Form components dengan validation
- Dialog, sheet, dan modal components
- Toast notifications
- Badge dan status indicators
- Calendar date picker

---

## 10. Migration Strategy

### 10.1. Existing Data Migration

1. **Users**: Migrate existing users ke schema baru dengan default tenant
2. **Vehicles**: Attach `tenant_id` ke semua vehicle records
3. **Incidents**: Attach `tenant_id` ke semua incident records
4. **Subscriptions**: Map existing subscriptions ke new schema
5. **API Keys**: Re-hash existing API keys ke new format

### 10.2. Backward Compatibility

- V2 API endpoints tetap berjalan selama 6 bulan
- V3 API endpoints menggunakan prefix `/api/v3/`
- Client apps (mobile) diupdate secara bertahap
- Feature flags untuk progressive rollout

### 10.3. Rollback Plan

- Database migrations menggunakan Prisma (reversible)
- Feature flags untuk instant disable
- Blue-green deployment untuk zero-downtime
- Automated backup sebelum migration

---

## 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tenant Onboarding Time | < 5 menit | Dari signup sampai workspace ready |
| API Response Time (p99) | < 200ms | Endpoint response time |
| Tenant Data Isolation | 100% | Zero cross-tenant data leakage |
| SLA Uptime | 99.9% | Monthly uptime percentage |
| Invoice Generation Accuracy | 100% | Correct amount calculation |
| User Invitation Accept Rate | > 80% | Within 7 days |
| Portal Page Load Time | < 2s | First contentful paint |

---

## 12. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data leakage antar tenant | 🔴 Critical | Row-level security, Prisma middleware, penetration testing |
| Billing calculation error | 🔴 Critical | Automated tests, manual review, audit trail |
| Performance degradation | 🟡 Medium | Database indexing, query optimization, caching |
| Scope creep | 🟡 Medium | Strict phase boundaries, MVP focus |
| Third-party service outage | 🟢 Low | Graceful degradation, fallback mechanisms |

---

## 13. Glossary

| Istilah | Definisi |
|---------|----------|
| **Tenant** | Organisasi atau instansi yang menggunakan VigilOS |
| **Tenant Admin** | Administrator utama dari sebuah tenant |
| **Workspace** | Isolated environment untuk setiap tenant |
| **Subscription** | Paket langganan yang dipilih tenant |
| **API Key** | Token autentikasi untuk akses API eksternal |
| **RBAC** | Role-Based Access Control |
| **SSO** | Single Sign-On |
| **SLA** | Service Level Agreement |
| **Provisioning** | Proses setup workspace baru untuk tenant |

---

**Document Owner:** VigilOS Product Team
**Last Updated:** 18 August 2026
**Next Review:** 25 August 2026
