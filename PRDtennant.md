# Product Requirements Document (PRD)
## VigilOS V3 — Tenant Provisioning Wizard

**Versi Dokumen:** 1.0.0
**Tanggal:** 18 Agustus 2026
**Status:** Draft
**Document Owner:** VigilOS Team

---

## 1. Ringkasan Eksekutif

Dokumen ini mendefinisikan **Tenant Provisioning Wizard** — alur onboarding multi-langkah untuk membuat, mengkonfigurasi, dan mengaktifkan tenant baru di VigilOS V3. Sistem ini menyediakan UI terpadu bagi Super Admin untuk melakukan provisioning dari awal hingga tenant siap digunakan.

### Problem Statement
- Saat ini pembuatan tenant hanya bisa via API `POST /tenants` — tidak ada UI
- Tenant switcher di `TopHeader.jsx` masih hardcoded (3 demo tenant)
- Saat buat tenant via API, **tidak ada auto-provisioning** default settings (28 settings) dan features (10 fitur)
- Tidak ada alur onboarding untuk admin user pertama tenant baru
- Tidak ada validasi configuration sebelum tenant diaktifkan
- Tidak ada wizard step-by-step — user harus tahu exact field apa yang perlu diisi

### Solution
Wizard 5-langkah yang memandu Super Admin dari input data tenant hingga tenant siap digunakan, termasuk: basic info, plan selection, admin user creation, settings review, dan final activation.

---

## 2. Goals & Objectives

| Goal | Objective | Success Metric |
|------|-----------|----------------|
| **One-Click Provisioning** | Buat tenant lengkap dalam satu alur | < 3 menit dari start hingga active |
| **Auto-Provisioning** | Settings & features otomatis dibuat | 100% default settings ter-create |
| **Data Integrity** | Validasi semua input sebelum save | 0 invalid config errors |
| **Self-Service Ready** | Tenant admin bisa lanjut setup sendiri | 0 support ticket untuk initial setup |
| **Dynamic Tenant List** | Tenant switcher dari database, bukan hardcoded | Real-time tenant list |

---

## 3. Scope

### In Scope
- Super Admin Tenant Provisioning Wizard (5 langkah)
- Auto-provisioning default settings & features
- Dynamic tenant switcher (database-driven)
- Tenant list & management page untuk Super Admin
- Tenant detail/edit page
- Tenant activation/suspension/deletion

### Out of Scope
- Self-service tenant signup (public registration)
- Tenant cloning/duplication
- Multi-language provisioning wizard
- Tenant migration between regions

---

## 4. User Roles & Permissions

| Role | Can Create Tenant | Can List All Tenants | Can Edit Tenant | Can Suspend Tenant | Can Delete Tenant | Can Switch Tenant |
|------|-------------------|---------------------|-----------------|-------------------|-------------------|-------------------|
| SUPER_ADMIN | Ya | Ya | Ya | Ya | Ya | Ya |
| TENANT_ADMIN | Tidak | Tidak | Own tenant only | Tidak | Tidak | Own tenant only |
| Other roles | Tidak | Tidak | Tidak | Tidak | Tidak | Tidak |

---

## 5. Provisioning Flow

### 5.1. Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TENANT PROVISIONING WIZARD                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Step 1   │→ │ Step 2   │→ │ Step 3   │→ │ Step 4   │→ │ Step 5   │ │
│  │ Basic    │  │ Plan &   │  │ Admin    │  │ Settings │  │ Review   │ │
│  │ Info     │  │ Billing  │  │ User     │  │ & Config │  │ & Launch │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                                         │
│  [Back]                              [Save Draft]     [Publish Tenant] │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2. Step 1 — Basic Information

**Tujuan:** Input data identitas tenant

**Fields:**
| Field | Type | Required | Validation | Default |
|-------|------|----------|------------|---------|
| Company Name | text | Ya | Min 3 chars | — |
| Slug | text | Ya | Unique, lowercase, alphanumeric + hyphens | Auto-generate from name |
| Region | select | Ya | Enum: provinsi Indonesia | — |
| Industry | select | Ya | Public Transit, Logistics, Government, Mining, Other | — |
| Contact Email | email | Ya | Valid email, unique | — |
| Phone | text | Tidak | Phone format | — |
| Address | textarea | Tidak | — | — |

**Auto-generate Slug Logic:**
```
Input: "PT Transportasi Jaya Barat"
Slug: "transportasi-jaya-barat"
```

### 5.3. Step 2 — Plan & Billing

**Tujuan:** Pilih subscription plan dan konfigurasi billing

**Plan Cards:**
| Feature | TRIAL | STARTER | PROFESSIONAL | ENTERPRISE |
|---------|-------|---------|--------------|------------|
| Harga/bulan | Gratis | Rp 5M | Rp 18M | Rp 45M |
| Device Limit | 5 | 10 | 30 | 100 |
| User Limit | 3 | 5 | 20 | 50 |
| API Calls/bulan | 10K | 100K | 1M | 10M |
| Durasi Trial | 30 hari | — | — | — |
| Geofence | ❌ | ✅ | ✅ | ✅ |
| AI Reports | ❌ | ❌ | ✅ | ✅ |
| API Access | ❌ | ❌ | ✅ | ✅ |
| Webhooks | ❌ | ❌ | ❌ | ✅ |

**Billing Fields (untuk plan berbayar):**
| Field | Type | Required |
|-------|------|----------|
| Billing Contact | text | Ya (paid plans) |
| Billing Email | email | Ya (paid plans) |
| Payment Method | select | Virtual Account, Credit Card, Bank Transfer |
| PO Number | text | Tidak |
| Start Date | date | Ya (default: hari ini) |

### 5.4. Step 3 — Admin User Creation

**Tujuan:** Buat user pertama (TENANT_ADMIN) untuk tenant baru

**Fields:**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Full Name | text | Ya | Min 2 words |
| Email | email | Ya | Valid email |
| Password | password | Ya | Min 8 chars, 1 uppercase, 1 number |
| Confirm Password | password | Ya | Must match |
| Role | select | Ya | TENANT_ADMIN (default), TENANT_FINANCE |

**Behavior:**
- Email dicek unik di seluruh sistem
- Password di-hash dengan bcrypt (10 rounds)
- User langsung ACTIVE
- Invitation token tidak diperlukan (langsung dibuat)

### 5.5. Step 4 — Settings & Configuration

**Tujuan:** Review dan customize default settings sebelum publish

**Settings yang di-review (5 kategori):**

**General:**
| Setting | Default | Editable |
|---------|---------|----------|
| Timezone | Asia/Jakarta | Ya |
| Language | id | Ya |
| Currency | IDR | Ya |
| Date Format | DD/MM/YYYY | Ya |
| Time Format | 24h | Ya |

**Branding:**
| Setting | Default | Editable |
|---------|---------|----------|
| Theme | light | Ya |
| Primary Color | #1E40AF | Ya |
| Company Name | (dari Step 1) | Ya |
| Logo URL | null | Ya |

**Notifications:**
| Setting | Default | Editable |
|---------|---------|----------|
| Email Enabled | true | Ya |
| Push Enabled | true | Ya |
| SMS Enabled | false | Ya |
| Webhook Enabled | false | Ya |

**Security:**
| Setting | Default | Editable |
|---------|---------|----------|
| MFA Required | false | Ya |
| Session Timeout | 30 min | Ya |
| API Rate Limit | 1000/min | Ya |
| Password Policy | standard | Ya |

**Integrations:**
| Setting | Default | Editable |
|---------|---------|----------|
| MQTT Broker | mqtt://localhost:1883 | Ya |
| Storage Provider | local | Ya |
| Maps Provider | openstreetmap | Ya |

**Features (per plan):**
| Feature | Status | Configurable |
|---------|--------|-------------|
| vehicles:read | ON | Tidak |
| vehicles:write | ON (STARTER+) | Tidak |
| geofence | ON (STARTER+) | Max geofences |
| deviation_alerts | ON (STARTER+) | Tidak |
| ai_reports | ON (PRO+) | Max reports/day |
| api_access | ON (PRO+) | Rate limit |
| webhooks | ON (ENTERPRISE) | Max webhooks |

### 5.6. Step 5 — Review & Launch

**Tujuan:** Final review sebelum tenant diaktifkan

**Review Checklist:**
```
✅ Tenant Information
   ├── Company Name: PT Transportasi Jaya Barat
   ├── Slug: transportasi-jaya-barat
   ├── Region: Jawa Barat
   └── Industry: Public Transit

✅ Subscription
   ├── Plan: STARTER
   ├── Price: Rp 5,000,000/month
   ├── Device Limit: 10 units
   └── Start Date: 18 Aug 2026

✅ Admin User
   ├── Name: Budi Santoso
   ├── Email: budi@transportasi.co.id
   └── Role: TENANT_ADMIN

✅ Configuration
   ├── 28 settings configured
   ├── 10 features enabled
   └── All validations passed
```

**Actions:**
- **Save as Draft** — Tenant dibuat dengan status `PENDING`, bisa dilanjutkan nanti
- **Publish Tenant** — Tenant diaktifkan dengan status `ACTIVE`, semua provisioning selesai

---

## 6. API Endpoints

### 6.1. Tenant Management (Enhanced)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tenants` | Super Admin | List all tenants (with filters) |
| `GET` | `/tenants/:id` | Admin | Get tenant details + stats |
| `POST` | `/tenants` | Super Admin | Create tenant (basic) |
| `POST` | `/tenants/provision` | Super Admin | **NEW** — Full provisioning wizard |
| `PUT` | `/tenants/:id` | Admin | Update tenant |
| `PUT` | `/tenants/:id/status` | Super Admin | **NEW** — Activate/suspend/cancel |
| `DELETE` | `/tenants/:id` | Super Admin | **NEW** — Soft delete tenant |
| `GET` | `/tenants/:id/provision-status` | Super Admin | **NEW** — Check provisioning progress |

### 6.2. New Endpoint: Full Provisioning

**`POST /api/v1/tenants/provision`**

Request:
```json
{
  "tenant": {
    "name": "PT Transportasi Jaya Barat",
    "slug": "transportasi-jaya-barat",
    "region": "Jawa Barat",
    "industry": "Public Transit",
    "contactEmail": "admin@transportasi.co.id",
    "phone": "+62 22-5555-0100",
    "address": "Jl. Asia Afrika 123, Bandung"
  },
  "subscription": {
    "plan": "STARTER",
    "startDate": "2026-08-18",
    "billingContact": "Finance Dept",
    "billingEmail": "finance@transportasi.co.id",
    "paymentMethod": "virtual_account",
    "poNumber": "PO-2026-08-001"
  },
  "admin": {
    "name": "Budi Santoso",
    "email": "budi@transportasi.co.id",
    "password": "SecurePass123!",
    "role": "TENANT_ADMIN"
  },
  "settings": {
    "general": {
      "timezone": "Asia/Jakarta",
      "language": "id"
    },
    "branding": {
      "theme": "light",
      "primary_color": "#1E40AF"
    }
  },
  "activate": true
}
```

Response (201):
```json
{
  "success": true,
  "data": {
    "tenant": {
      "id": "uuid",
      "name": "PT Transportasi Jaya Barat",
      "slug": "transportasi-jaya-barat",
      "status": "ACTIVE",
      "planTier": "STARTER"
    },
    "subscription": {
      "id": "uuid",
      "plan": "STARTER",
      "status": "ACTIVE",
      "deviceLimit": 10
    },
    "admin": {
      "id": "uuid",
      "email": "budi@transportasi.co.id",
      "role": "TENANT_ADMIN"
    },
    "provisioning": {
      "settingsCreated": 28,
      "featuresCreated": 10,
      "auditLogsCreated": 5
    }
  }
}
```

### 6.3. Tenant Status Management

**`PUT /api/v1/tenants/:id/status`**

Request:
```json
{
  "status": "SUSPENDED",
  "reason": "Payment overdue"
}
```

Allowed transitions:
```
PENDING → ACTIVE (activation)
ACTIVE → SUSPENDED (suspension)
SUSPENDED → ACTIVE (re-activation)
ACTIVE → CANCELLED (cancellation)
SUSPENDED → CANCELLED (cancellation)
```

---

## 7. UI/UX Design

### 7.1. Tenant Management Page (Super Admin)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Tenant Management                                         [+ Add New] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 🔍 Search tenants...          Filter: [All ▼] Sort: [Name ▼]   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ │ Name              │ Plan       │ Status   │ Users │ Devices │  │   │
│  │ ├───────────────────┼────────────┼──────────┼───────┼─────────┤  │   │
│  │ │ 🏢 Dishub Kota    │ ENTERPRISE │ ● ACTIVE │   7   │  5/100  │  │   │
│  │ │    Semarang       │            │          │       │         │  │   │
│  │ ├───────────────────┼────────────┼──────────┼───────┼─────────┤  │   │
│  │ │ 🏢 PT Transportasi│ STARTER    │ ● ACTIVE │   3   │  2/10   │  │   │
│  │ │    Jaya Barat     │            │          │       │         │  │   │
│  │ ├───────────────────┼────────────┼──────────┼───────┼─────────┤  │   │
│  │ │ 🏢 PT Logistik Nas│ PROFESSION │ ⏸ PENDING│   0   │  0/30   │  │   │
│  │ │                   │ AL         │          │       │         │  │   │
│  │ └───────────────────┴────────────┴──────────┴───────┴─────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Showing 1-3 of 3 tenants                           [← Previous] 1/1  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2. Provisioning Wizard — Step Indicator

```
┌─────────────────────────────────────────────────────────────────────────┐
│  New Tenant Setup                                            Step 2/5  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐   │
│  │ ✓ Done │───→│ ● Here │───→│ ○ Next │───→│ ○ Next │───→│ ○ Next │   │
│  │ Basic  │    │  Plan  │    │ Admin  │    │ Config │    │ Launch │   │
│  │  Info  │    │&Billing│    │  User  │    │  &The  │    │        │   │
│  └────────┘    └────────┘    └────────┘    └────────┘    └────────┘   │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  [Cancel]                                          [Back]  [Next →]   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.3. Step 1 — Basic Information Form

```
┌─────────────────────────────────────────────────────────────────────────┐
│  New Tenant Setup — Basic Information                    Step 1/5      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Company Information                                                    │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Company Name *                                                         │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ PT Transportasi Jaya Barat                                     │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  Slug *                                    (auto-generated, editable)   │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ transportasi-jaya-barat                              ✓ Unique │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  Region *                          Industry *                           │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐     │
│  │ Jawa Barat               ▼ │  │ Public Transit            ▼ │     │
│  └─────────────────────────────┘  └─────────────────────────────┘     │
│                                                                         │
│  Contact Details                                                        │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Contact Email *                       Phone                            │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐     │
│  │ admin@transportasi.co.id    │  │ +62 22-5555-0100            │     │
│  └─────────────────────────────┘  └─────────────────────────────┘     │
│                                                                         │
│  Address                                                                │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ Jl. Asia Afrika 123, Bandung, Jawa Barat 40111               │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  [Cancel]                                          [Back]  [Next →]   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.4. Step 2 — Plan Selection

```
┌─────────────────────────────────────────────────────────────────────────┐
│  New Tenant Setup — Plan & Billing                      Step 2/5      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Select Subscription Plan                                               │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │    TRIAL     │ │   STARTER ◉  │ │ PROFESSIONAL │ │  ENTERPRISE  │  │
│  │              │ │              │ │              │ │              │  │
│  │    Gratis    │ │  Rp 5M/bln   │ │  Rp 18M/bln  │ │  Rp 45M/bln  │  │
│  │              │ │              │ │              │ │              │  │
│  │  5 devices   │ │ 10 devices   │ │ 30 devices   │ │ 100 devices  │  │
│  │  3 users     │ │ 5 users      │ │ 20 users     │ │ 50 users     │  │
│  │  10K API     │ │ 100K API     │ │ 1M API       │ │ 10M API      │  │
│  │              │ │              │ │              │ │              │  │
│  │  30-day trial│ │              │ │              │ │              │  │
│  │  No payment  │ │  Payment req │ │  Payment req │ │  Payment req │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                         │
│  Billing Details (STARTER Plan Selected)                                │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Start Date *                      Billing Contact                      │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐     │
│  │ 📅 18 Aug 2026             │  │ Finance Dept                │     │
│  └─────────────────────────────┘  └─────────────────────────────┘     │
│                                                                         │
│  Billing Email *                    Payment Method                      │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐     │
│  │ finance@transportasi.co.id  │  │ Virtual Account          ▼  │     │
│  └─────────────────────────────┘  └─────────────────────────────┘     │
│                                                                         │
│  PO Number (optional)                                                   │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ PO-2026-08-001                                                 │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  [Cancel]                                     [← Back]  [Next →]       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.5. Step 3 — Admin User

```
┌─────────────────────────────────────────────────────────────────────────┐
│  New Tenant Setup — Admin User                          Step 3/5      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Create the first admin user for this tenant                            │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Full Name *                                                            │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ Budi Santoso                                                   │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  Email *                                                                │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ budi@transportasi.co.id                              ✓ Unique │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  Password *                                                             │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ ••••••••••••••••                                    [👁 Show] │     │
│  └───────────────────────────────────────────────────────────────┘     │
│  ✅ Min 8 chars  ✅ 1 uppercase  ✅ 1 number  ✅ 1 special char       │
│                                                                         │
│  Confirm Password *                                                     │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ ••••••••••••••••                                               │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  Role *                                                                 │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ ● TENANT_ADMIN — Full access to tenant portal                 │     │
│  │ ○ TENANT_FINANCE — Billing and payment access only            │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │ ℹ️  This user will receive login credentials via email       │       │
│  │     after the tenant is published.                           │       │
│  └─────────────────────────────────────────────────────────────┘       │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  [Cancel]                                     [← Back]  [Next →]       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.6. Step 4 — Settings & Features

```
┌─────────────────────────────────────────────────────────────────────────┐
│  New Tenant Setup — Configuration                       Step 4/5      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────────────────────────────────────┐    │
│  │ General    ◉ │  │ General Settings                              │    │
│  │ Branding     │  │ ────────────────────────────────────────────  │    │
│  │ Notif.       │  │                                               │    │
│  │ Security     │  │ Timezone     [Asia/Jakarta                ▼]  │    │
│  │ Integr.      │  │ Language     [Indonesian (id)             ▼]  │    │
│  │ Features     │  │ Currency     [IDR                       ▼]  │    │
│  │              │  │ Date Format  [DD/MM/YYYY                ▼]  │    │
│  │              │  │ Time Format  [24h                       ▼]  │    │
│  │              │  │                                               │    │
│  │              │  │ [Reset to Defaults]                           │    │
│  └──────────────┘  └──────────────────────────────────────────────┘    │
│                                                                         │
│  Features (STARTER Plan)                                                │
│  ─────────────────────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Feature            │ Status │ Plan Access │ Config              │   │
│  ├────────────────────┼────────┼─────────────┼─────────────────────┤   │
│  │ vehicles:read      │ ON  ◉  │ ✅ Included │ —                   │   │
│  │ vehicles:write     │ ON  ◉  │ ✅ Included │ —                   │   │
│  │ geofence           │ ON  ◉  │ ✅ Included │ Max: 5 zones       │   │
│  │ deviation_alerts   │ ON  ◉  │ ✅ Included │ —                   │   │
│  │ ai_reports         │ OFF ○  │ 🔒 Upgrade  │ PRO plan required  │   │
│  │ api_access         │ OFF ○  │ 🔒 Upgrade  │ PRO plan required  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  [Cancel]                                     [← Back]  [Next →]       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.7. Step 5 — Review & Launch

```
┌─────────────────────────────────────────────────────────────────────────┐
│  New Tenant Setup — Review & Launch                     Step 5/5      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Review all details before publishing                                   │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐     │
│  │ ✅ Tenant Information       │  │ ✅ Subscription              │     │
│  │                             │  │                             │     │
│  │ Company: PT Transportasi    │  │ Plan: STARTER               │     │
│  │   Jaya Barat                │  │ Price: Rp 5,000,000/month   │     │
│  │ Slug: transportasi-jaya-    │  │ Devices: 10 units           │     │
│  │   barat                     │  │ Users: 5                    │     │
│  │ Region: Jawa Barat          │  │ Start: 18 Aug 2026          │     │
│  │ Industry: Public Transit    │  │                             │     │
│  │ Email: admin@transportasi   │  │ Billing: finance@transport  │     │
│  │   .co.id                    │  │   asi.co.id                 │     │
│  │ Phone: +62 22-5555-0100     │  │ PO: PO-2026-08-001         │     │
│  └─────────────────────────────┘  └─────────────────────────────┘     │
│                                                                         │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐     │
│  │ ✅ Admin User               │  │ ✅ Configuration             │     │
│  │                             │  │                             │     │
│  │ Name: Budi Santoso          │  │ Settings: 28 configured     │     │
│  │ Email: budi@transportasi    │  │ Features: 10 enabled        │     │
│  │   .co.id                    │  │ Categories:                 │     │
│  │ Role: TENANT_ADMIN          │     │ • General (5)           │     │
│  │ Status: Will be ACTIVE      │     │ • Branding (5)          │     │
│  │                             │     │ • Notifications (7)     │     │
│  │                             │     │ • Security (5)          │     │
│  │                             │     │ • Integrations (6)      │     │
│  └─────────────────────────────┘  └─────────────────────────────┘     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ⚠️  Publishing will:                                            │   │
│  │   • Create the tenant and subscription record                   │   │
│  │   • Provision 28 default settings                               │   │
│  │   • Enable 10 feature flags for STARTER plan                    │   │
│  │   • Create admin user with login credentials                    │   │
│  │   • Send welcome email to admin (if configured)                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  [Cancel]              [Save as Draft]          [← Back] [🚀 Publish]  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.8. Success State

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                      ┌─────────────────────┐                           │
│                      │                     │                           │
│                      │      🎉             │                           │
│                      │                     │                           │
│                      │  Tenant Published!  │                           │
│                      │                     │                           │
│                      └─────────────────────┘                           │
│                                                                         │
│  Tenant "PT Transportasi Jaya Barat" has been successfully created.    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Summary                                                         │   │
│  │ • Tenant ID: tenant-uuid-here                                  │   │
│  │ • Plan: STARTER (Rp 5M/month)                                  │   │
│  │ • Admin: budi@transportasi.co.id                                │   │
│  │ • Settings: 28 provisions                                       │   │
│  │ • Features: 10 enabled                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌───────────────────────┐  ┌───────────────────────────────────┐     │
│  │ View Tenant Portal    │  │ ← Back to Tenant List             │     │
│  └───────────────────────┘  └───────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.9. Tenant Detail Page

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back    PT Transportasi Jaya Barat              [Edit] [Suspend]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Status: ● ACTIVE         Plan: STARTER        Since: 18 Aug 26 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│  │    3     │ │    5     │ │    2     │ │    0     │                 │
│  │  Users   │ │ Devices  │ │ Vehicles │ │Incidents │                 │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                 │
│                                                                         │
│  Recent Activity                                                        │
│  ─────────────────────────────────────────────────────────────────────  │
│  • 18 Aug 10:30 — Tenant created by Super Admin                       │
│  • 18 Aug 10:30 — Admin user budi@transportasi.co.id created          │
│  • 18 Aug 10:30 — 28 settings provisioned                             │
│  • 18 Aug 10:30 — 10 features enabled                                 │
│  • 18 Aug 11:00 — First login by Budi Santoso                         │
│                                                                         │
│  Quick Actions                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│  [View Portal]  [Manage Settings]  [Manage Features]  [View Billing]  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.10. Dynamic Tenant Switcher (Updated TopHeader)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☰  VigilOS Command Center    🏢 Dishub Kota Semarang     [Switch ▼]  │
├─────────────────────────────────────────────────────────────────────────┤

Tenant dropdown:
┌─────────────────────────────────────────┐
│ 🔍 Search tenants...                    │
├─────────────────────────────────────────┤
│ ✅ Dishub Kota Semarang                 │
│    Jawa Tengah · ENTERPRISE · 5 units   │
│─────────────────────────────────────────│
│    PT Transportasi Jaya Barat           │
│    Jawa Barat · STARTER · 2 units       │
│─────────────────────────────────────────│
│    [+ Add New Tenant]                   │
└─────────────────────────────────────────┘
```

---

## 8. Data Model Changes

### 8.1. Tenant Model Enhancement

```prisma
model Tenant {
  id            String           @id @default(uuid())
  name          String
  slug          String           @unique
  status        TenantStatus     @default(PENDING)  // Changed default
  region        String?
  industry      String?          // NEW — Industry category
  contactEmail  String
  phone         String?
  address       String?
  config        Json             @default("{}")
  planTier      SubscriptionPlan @default(TRIAL)
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  deletedAt     DateTime?
  // ... relations
}
```

### 8.2. New Enum Value

```prisma
enum TenantStatus {
  PENDING     // New default for provisioning
  ACTIVE
  SUSPENDED
  CANCELLED
}
```

---

## 9. Implementation Phases

### Phase A: Backend Provisioning Engine (Week 1)

- [ ] Enhance `POST /tenants` to auto-provision settings + features
- [ ] Create `POST /tenants/provision` endpoint (full wizard backend)
- [ ] Add `PUT /tenants/:id/status` endpoint (activate/suspend/cancel)
- [ ] Add `DELETE /tenants/:id` endpoint (soft delete)
- [ ] Add `GET /tenants/:id/provision-status` endpoint
- [ ] Add `industry` field to Tenant model
- [ ] Update seed script for auto-provisioning
- [ ] Write unit tests for provisioning engine

### Phase B: Frontend Tenant Management (Week 2)

- [ ] Create Tenant Management page (list, search, filter)
- [ ] Create Tenant Detail page
- [ ] Create Provisioning Wizard (5 steps)
- [ ] Create Tenant Edit modal
- [ ] Create Tenant Status toggle (activate/suspend)
- [ ] Create Delete confirmation modal

### Phase C: Dynamic Tenant Switcher (Week 3)

- [ ] Replace hardcoded `TENANTS` in `TopHeader.jsx` with API call
- [ ] Add search functionality to tenant switcher
- [ ] Add "Add New Tenant" button in switcher (opens wizard)
- [ ] Persist selected tenant in localStorage
- [ ] Update `App.jsx` to use dynamic tenant from auth context

### Phase D: Integration & Polish (Week 4)

- [ ] Send welcome email after provisioning (optional)
- [ ] Add audit logging for all provisioning actions
- [ ] Add provisioning progress indicator (WebSocket)
- [ ] Add bulk tenant import (CSV/JSON)
- [ ] Add tenant cloning (copy settings from existing)
- [ ] Performance testing with 100+ tenants

---

## 10. Security Considerations

1. **Authorization** — Only SUPER_ADMIN can create/manage tenants
2. **Slug Validation** — Prevent injection, enforce lowercase alphanumeric
3. **Password Policy** — Enforce strong passwords for admin users
4. **Rate Limiting** — Limit tenant creation to prevent abuse
5. **Audit Trail** — Log all provisioning actions with before/after
6. **Soft Delete** — Never hard delete tenants, use `deletedAt`
7. **Data Isolation** — Ensure new tenant data is completely isolated
8. **Email Validation** — Verify email uniqueness across all tenants

---

## 11. Acceptance Criteria

### Wizard Flow
- [ ] User can complete wizard in < 3 minutes
- [ ] All 5 steps are navigable (back/forward)
- [ ] Step indicator shows current progress
- [ ] Cancel at any step returns to tenant list with confirmation
- [ ] "Save as Draft" creates tenant with PENDING status
- [ ] "Publish" creates tenant with ACTIVE status

### Data Integrity
- [ ] Slug uniqueness is validated in real-time
- [ ] Email uniqueness is checked before publish
- [ ] Password strength is validated before publish
- [ ] All 28 default settings are created on publish
- [ ] All 10 features are created with correct plan-based enablement
- [ ] Admin user is created and can login immediately

### Tenant Management
- [ ] Tenant list shows all tenants with status, plan, stats
- [ ] Search filters tenants by name, slug, region
- [ ] Status filter (All, Active, Suspended, Pending)
- [ ] Clicking tenant opens detail page
- [ ] Status transitions are enforced (PENDING→ACTIVE→SUSPENDED→CANCELLED)
- [ ] Soft delete removes tenant from list but preserves data

### Tenant Switcher
- [ ] Switcher fetches tenants from API (not hardcoded)
- [ ] Switcher shows tenant name, region, plan, device count
- [ ] Search filters tenants in dropdown
- [ ] "Add New Tenant" opens provisioning wizard
- [ ] Selected tenant persists across page refreshes

### Error Handling
- [ ] Network errors show user-friendly message
- [ ] Validation errors highlight specific fields
- [ ] Duplicate slug/email shows inline error
- [ ] Backend down shows fallback demo data
- [ ] Loading states shown during API calls

---

## 12. Open Questions

1. Should we send welcome email with credentials after provisioning?
2. Do we need tenant cloning (copy settings from existing tenant)?
3. Should the wizard support "Import from CSV" for bulk tenant creation?
4. Do we need a "Test Mode" to simulate provisioning without saving?
5. Should TENANT_ADMIN be able to request plan changes from the portal?
6. Do we need webhook notifications when tenant is provisioned?

---

**Document Version History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 18 Aug 2026 | VigilOS Team | Initial draft |
