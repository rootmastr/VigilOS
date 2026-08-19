# Product Requirements Document (PRD)
## VigilOS V3 — B2B Tenant Management System & Tenant Portal (Revision 1)

**Versi Dokumen:** 3.1.0 (Rev 1)
**Tanggal:** 18 Agustus 2026
**Status:** Approved for Implementation

---

## 1. Ringkasan Eksekutif

Dokumen ini mendefinisikan arsitektur, fitur, dan rekomendasi implementasi untuk **VigilOS V3** dengan fokus pada **B2B Tenant Management System**. VigilOS bertransformasi dari single-tenant fleet management menjadi **multi-tenant SaaS platform** yang memungkinkan berbagai organisasi (Dishub, perusahaan transportasi, logistik) beroperasi secara terisolasi dalam satu instansi VigilOS.

### Tujuan V3
1. **Multi-Tenant Isolation** — Data, konfigurasi, dan akses setiap tenant terisolasi sempurna
2. **Self-Service Tenant Portal** — Tenant admin dapat mengelola tim, billing, API, dan konfigurasi tanpa bantuan VigilOS staff
3. **B2B Billing & Subscription** — Sistem langganan berjenjang dengan invoice otomatis
4. **Tenant Onboarding** — Provisi otomatis workspace baru dalam hitungan detik
5. **Observability per Tenant** — Monitoring konsumsi sumber daya dan SLA compliance per tenant
6. **[NEW] Advanced Scaling & Compliance** — Optimasi database skala besar (Partitioning), kontrol trafik multi-lapis, dan kepatuhan privasi data (UU PDP/GDPR).

---

## 2. Arsitektur Multi-Tenancy

### 2.1. Strategi Isolasi

Rekomendasi: **Shared Database, Shared Schema with Tenant ID Discriminator**

```
┌─────────────────────────────────────────────────────────────┐
│                      NGINX / API GATEWAY                     │
│    Global DDoS Protection • Rate Limiting (L4/L7) • TLS      │
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
│  │  │ Tenant       │  │ API Quota    │  │ Audit       │ │  │
│  │  │ Middleware   │  │ Limit (Redis)│  │ Middleware  │ │  │
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
Request → Nginx (Global Throttling) → Express
  │
  ├─ 1. Extract tenant from:
  │     • JWT token claim (user session)
  │     • X-Tenant-ID header (API key)
  │     • Subdomain (portal.vigilos.io)
  │
  ├─ 2. Redis API Quota Check (Tenant-specific rate limits)
  │
  ├─ 3. Attach tenant context to request:
  │     req.tenant = { id, name, plan, status, config }
  │
  ├─ 4. Middleware chain:
  │     TenantGuard → RBACAudit → Route Handler
  │
  └─ 5. All DB queries filtered by tenant_id (Prisma middleware)
```

### 2.3. Multi-Layer Traffic Control (NGINX + Redis) [NEW]
Untuk menjaga stabilitas saat tenant mencapai ratusan:
* **NGINX (L4/L7 Rate Limiting):** Bertindak sebagai tameng terluar untuk menangkis serangan DDoS atau *brute-force* secara global berdasarkan alamat IP (misal: max 100 req/sec per IP).
* **Redis (API Quota Limiting):** Diatur di level aplikasi (Node.js). Membatasi *traffic* berdasarkan *tier* langganan masing-masing *tenant* atau *API Key* (misal: Tenant paket Basic maksimal 10.000 API calls/bulan, dibatasi dengan Redis Sliding Window).

---

## 3. Database Schema (Enhanced with Partitioning)

*Catatan: Pada tabel dengan volume transaksi masif seperti audit_logs dan usage_records, PostgreSQL Partitioning (RANGE berdasarkan tanggal) diterapkan untuk mencegah degradasi performa.*

### 3.1. Core Tenant Tables
*(Sama dengan V3.0.0 - tenants, tenant_settings, tenant_features)*

### 3.2. Enhanced Identity & RBAC
*(Sama dengan V3.0.0 - users, roles, permissions, role_permissions, user_roles, invitations)*

### 3.3. Billing & Subscription
*(Sama dengan V3.0.0 - subscription_plans, subscriptions, invoices, usage_records)*

**[NEW] Optimasi pada `usage_records`:**
```sql
-- Partitioning by period_start (Bulan/Tahun)
CREATE TABLE usage_records (
  id              UUID DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  period_start    TIMESTAMP NOT NULL,
  period_end      TIMESTAMP NOT NULL,
  device_count    INT DEFAULT 0,
  api_calls       BIGINT DEFAULT 0,
  storage_bytes   BIGINT DEFAULT 0,
  active_users    INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (id, period_start)
) PARTITION BY RANGE (period_start);
```

### 3.4. Audit & Compliance
**[NEW] Optimasi pada `audit_logs`:**
```sql
-- Partitioning by created_at (Bulan/Tahun) untuk query histori yang sangat cepat
CREATE TABLE audit_logs (
  id          UUID DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100),
  details     JSONB DEFAULT '{}',
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
```

---

## 4. Tenant Portal — Feature Specification
*(Fitur portal dipertahankan sama dengan V3.0.0: Portal Dashboard, Tenant Settings, Team Management, Subscription & Billing, API Management, SLA & Compliance, Device Settings)*

---

## 5. Security & Compliance Considerations (Enhanced)

### 5.1. Tenant Isolation
```javascript
// Prisma middleware — automatic tenant filtering
prisma.$use(async (params, next) => {
  const tenantId = params.args?.tenantId || context.tenant?.id;

  if (tenantId && isTenantScopedModel(params.model)) {
    params.args.where = { ...params.args.where, tenantId };
  }

  return next(params);
});
```

### 5.2. Data Encryption
- **At Rest**: PostgreSQL transparent data encryption
- **In Transit**: TLS 1.3 for all connections
- **Sensitive Fields**: Payment methods encrypted with AES-256
- **API Keys**: Stored as SHA-256 hashes, only plaintext shown on creation

### 5.3. Data Retention & Privacy Compliance (UU PDP / GDPR) [NEW]
VigilOS mematuhi standar privasi data dengan menerapkan kebijakan *Hard Delete*:
* **Soft Delete:** Saat *Tenant Admin* menghapus aset/user, data hanya disembunyikan (di-*flag* sebagai *deleted*).
* **Hard Delete Cron-Job:** Sebuah *job worker* otomatis berjalan setiap malam jam 02:00 AM. *Worker* ini akan memindai *Tenant* dengan status `CANCELLED` yang sudah melewati **masa retensi 90 hari**.
* **Purge Mechanism:** Setelah 90 hari, semua data terkait tenant tersebut (termasuk *audit logs*, telemetri di InfluxDB, dan baris relasional di PostgreSQL) akan dihapus secara fisik (*Hard Delete*) untuk membebaskan ruang penyimpanan dan mematuhi regulasi privasi.

---

## 6. Implementation Phases (Update)

### Phase 3A — Foundation (4 minggu)
*(Termasuk setup schema baru & PostgreSQL Partitioning untuk audit dan usage records)*

### Phase 3B — Billing & Subscription (4 minggu)
*(Integrasi Midtrans/Stripe, Invoice Engine)*

### Phase 3C — Advanced Features & Compliance (4 minggu)
*(Termasuk Data Retention Cron-Job, NGINX+Redis Sync, SLA Engine)*

---

**Document Owner:** VigilOS Product Team
**Last Updated:** 18 August 2026
**Version:** 3.1.0 (Revision 1)
