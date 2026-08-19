# Product Requirements Document (PRD)
## VigilOS V3 — Tenant Setting Management System

**Versi Dokumen:** 1.0.0
**Tanggal:** 18 Agustus 2026
**Status:** Draft

---

## 1. Ringkasan Eksekutif

Dokumen ini mendefinisikan sistem **Tenant Setting Management** untuk VigilOS V3. Sistem ini menyediakan interface terpusat bagi tenant admin untuk mengelola konfigurasi workspace, fitur aktif, notifikasi, branding, integrasi pihak ketiga, dan pengaturan keamanan.

### Problem Statement
- Saat ini konfigurasi tenant tersimpan di `Tenant.config` (JSONB tunggal) tanpa struktur
- `TenantSetting` dan `TenantFeature` tables sudah ada di schema tapi belum terintegrasi
- Feature flags masih hardcoded di `subscriptionService.js`
- Tidak ada UI/endpoint untuk mengelola pengaturan tenant secara dinamis

### Solution
Sistem terpadu yang mengkonsolidasikan semua pengaturan tenant ke dalam struktur terorganisir dengan kategori, validasi, dan kontrol akses per pengaturan.

---

## 2. Goals & Objectives

| Goal | Objective | Success Metric |
|------|-----------|----------------|
| **Centralized Settings** | Semua pengaturan tenant di satu tempat | 100% settings via API |
| **Dynamic Features** | Feature flags per-tenant tanpa redeploy | Runtime feature toggle |
| **Self-Service** | Tenant admin bisa ubah pengaturan sendiri | 0 support ticket untuk settings |
| **Auditability** | Setiap perubahan settings tercatat | 100% change tracking |
| **Validation** | Setiap setting valid sesuai type dan constraints | 0 invalid config errors |

---

## 3. User Roles & Permissions

| Role | Can View | Can Edit | Can Manage Features | Can Manage Integrations |
|------|----------|----------|---------------------|------------------------|
| SUPER_ADMIN | All tenants | All tenants | All tenants | All tenants |
| TENANT_ADMIN | Own tenant | Own tenant | Own tenant | Own tenant |
| TENANT_SETTING_ADMIN | Own tenant | Own tenant | No | No |
| TENANT_VIEWER | Own tenant | No | No | No |

---

## 4. Data Model

### 4.1. Tenant Setting Categories

```
┌─────────────────────────────────────────────────────────────┐
│                    TENANT SETTINGS                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │ General     │  │ Branding    │  │ Notifications       ││
│  │ Settings    │  │ Settings    │  │ Settings            ││
│  ├─────────────┤  ├─────────────┤  ├─────────────────────┤│
│  │ - timezone  │  │ - logo_url  │  │ - email_enabled     ││
│  │ - language  │  │ - theme     │  │ - sms_enabled       ││
│  │ - currency  │  │ - primary_  │  │ - push_enabled      ││
│  │ - date_     │  │   color     │  │ - webhook_enabled   ││
│  │   format    │  │ - company_  │  │ - alert_contacts    ││
│  │ - time_     │  │   name      │  │ - escalation_       ││
│  │   format    │  │             │  │   policy            ││
│  └─────────────┘  └─────────────┘  └─────────────────────┘│
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │ Security    │  │ Integrations│  │ Feature Flags       ││
│  │ Settings    │  │ Settings    │  │                     ││
│  ├─────────────┤  ├─────────────┤  ├─────────────────────┤│
│  │ - mfa_      │  │ - api_      │  │ - geofence          ││
│  │   required  │  │   endpoint  │  │ - deviation_alerts  ││
│  │ - session_  │  │ - mqtt_     │  │ - ai_reports        ││
│  │   timeout   │  │   broker    │  │ - webhooks          ││
│  │ - ip_       │  │ - storage_  │  │ - priority_support  ││
│  │   whitelist │  │   provider  │  │ - custom_reports    ││
│  │ - password_ │  │ - sms_      │  │ - api_access        ││
│  │   policy    │  │   provider  │  │                     ││
│  └─────────────┘  └─────────────┘  └─────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2. Enhanced TenantSetting Model

```prisma
model TenantSetting {
  id          String   @id @default(uuid())
  tenantId    String
  category    String   // general, branding, notifications, security, integrations
  key         String
  value       Json
  dataType    String   // string, number, boolean, json, array
  isSecret   Boolean  @default(false)  // For sensitive values like API keys
  isReadonly  Boolean  @default(false) // Protected settings
  description String?  // Help text for UI
  validation  Json?    // Validation rules { min, max, pattern, enum, required }
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, category, key])
  @@map("tenant_settings")
}
```

### 4.3. Enhanced TenantFeature Model

```prisma
model TenantFeature {
  id          String   @id @default(uuid())
  tenantId    String
  feature     String
  enabled     Boolean  @default(true)
  config      Json     @default("{}")
  limit       Json?    // Usage limits { max_value, period }
  expiresAt   DateTime? // Feature expiration
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([tenantId, feature])
  @@map("tenant_features")
}
```

### 4.4. Tenant Audit Log (Enhanced)

```prisma
model TenantAuditLog {
  id          String   @id @default(uuid())
  tenantId    String
  userId      String?
  action      String   // setting:updated, feature:toggled, etc.
  category    String?  // Setting category
  settingKey  String?  // Setting key
  oldValue    Json?
  newValue    Json?
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([tenantId, createdAt])
  @@map("tenant_audit_logs")
}
```

---

## 5. API Endpoints

### 5.1. Settings Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tenants/:id/settings` | Admin | Get all settings (grouped by category) |
| `GET` | `/tenants/:id/settings/:category` | Admin | Get settings by category |
| `GET` | `/tenants/:id/settings/:category/:key` | Admin | Get single setting |
| `PUT` | `/tenants/:id/settings/:category/:key` | Admin | Update single setting |
| `PUT` | `/tenants/:id/settings/:category` | Admin | Bulk update settings in category |
| `POST` | `/tenants/:id/settings/validate` | Admin | Validate settings before save |
| `GET` | `/tenants/:id/settings/export` | Admin | Export all settings as JSON |
| `POST` | `/tenants/:id/settings/import` | Super Admin | Import settings from JSON |
| `POST` | `/tenants/:id/settings/reset` | Super Admin | Reset category to defaults |

### 5.2. Feature Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tenants/:id/features` | Admin | Get all features with status |
| `GET` | `/tenants/:id/features/:feature` | Admin | Get single feature |
| `PUT` | `/tenants/:id/features/:feature` | Super Admin | Toggle feature on/off |
| `PUT` | `/tenants/:id/features/:feature/config` | Super Admin | Update feature config |
| `POST` | `/tenants/:id/features/check` | System | Check if feature is enabled |
| `GET` | `/tenants/:id/features/available` | Admin | List available features by plan |

### 5.3. Audit Trail

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tenants/:id/settings/audit` | Admin | Get settings change history |
| `GET` | `/tenants/:id/settings/audit/:settingId` | Admin | Get specific setting history |

---

## 6. Setting Categories & Defaults

### 6.1. General Settings

```json
{
  "timezone": {
    "value": "Asia/Jakarta",
    "type": "string",
    "description": "Timezone for date/time display",
    "validation": { "enum": ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] }
  },
  "language": {
    "value": "id",
    "type": "string",
    "description": "Interface language",
    "validation": { "enum": ["id", "en"] }
  },
  "currency": {
    "value": "IDR",
    "type": "string",
    "description": "Currency for billing display"
  },
  "date_format": {
    "value": "DD/MM/YYYY",
    "type": "string",
    "validation": { "enum": ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] }
  },
  "time_format": {
    "value": "24h",
    "type": "string",
    "validation": { "enum": ["12h", "24h"] }
  }
}
```

### 6.2. Branding Settings

```json
{
  "logo_url": {
    "value": null,
    "type": "string",
    "description": "Company logo URL"
  },
  "theme": {
    "value": "light",
    "type": "string",
    "validation": { "enum": ["light", "dark", "auto"] }
  },
  "primary_color": {
    "value": "#1E40AF",
    "type": "string",
    "validation": { "pattern": "^#[0-9A-Fa-f]{6}$" }
  },
  "company_name": {
    "value": "",
    "type": "string",
    "description": "Company name for reports"
  },
  "footer_text": {
    "value": "",
    "type": "string",
    "description": "Custom footer text"
  }
}
```

### 6.3. Notification Settings

```json
{
  "email_enabled": {
    "value": true,
    "type": "boolean",
    "description": "Enable email notifications"
  },
  "sms_enabled": {
    "value": false,
    "type": "boolean",
    "description": "Enable SMS notifications"
  },
  "push_enabled": {
    "value": true,
    "type": "boolean",
    "description": "Enable push notifications"
  },
  "webhook_enabled": {
    "value": false,
    "type": "boolean",
    "description": "Enable webhook notifications"
  },
  "webhook_url": {
    "value": null,
    "type": "string",
    "description": "Webhook endpoint URL",
    "validation": { "pattern": "^https?://.*" }
  },
  "alert_contacts": {
    "value": [],
    "type": "array",
    "description": "Email contacts for alerts"
  },
  "escalation_policy": {
    "value": {
      "enabled": false,
      "levels": []
    },
    "type": "json",
    "description": "Escalation policy for incidents"
  }
}
```

### 6.4. Security Settings

```json
{
  "mfa_required": {
    "value": false,
    "type": "boolean",
    "description": "Require MFA for all users"
  },
  "session_timeout": {
    "value": 30,
    "type": "number",
    "description": "Session timeout in minutes",
    "validation": { "min": 5, "max": 480 }
  },
  "ip_whitelist": {
    "value": [],
    "type": "array",
    "description": "IP whitelist for API access"
  },
  "password_policy": {
    "value": {
      "min_length": 8,
      "require_uppercase": true,
      "require_lowercase": true,
      "require_numbers": true,
      "require_symbols": false,
      "max_age_days": 90
    },
    "type": "json"
  },
  "api_rate_limit": {
    "value": 1000,
    "type": "number",
    "description": "API rate limit per minute",
    "validation": { "min": 100, "max": 100000 }
  }
}
```

### 6.5. Integration Settings

```json
{
  "api_endpoint": {
    "value": null,
    "type": "string",
    "description": "External API endpoint",
    "isReadonly": true
  },
  "mqtt_broker": {
    "value": "mqtt://localhost:1883",
    "type": "string",
    "description": "MQTT broker URL"
  },
  "storage_provider": {
    "value": "local",
    "type": "string",
    "validation": { "enum": ["local", "s3", "gcs", "azure"] }
  },
  "storage_bucket": {
    "value": null,
    "type": "string",
    "description": "Storage bucket name"
  },
  "sms_provider": {
    "value": null,
    "type": "string",
    "validation": { "enum": [null, "twilio", "nexmo", "本地"] }
  },
  "maps_provider": {
    "value": "openstreetmap",
    "type": "string",
    "validation": { "enum": ["openstreetmap", "google", "mapbox"] }
  }
}
```

---

## 7. Feature Flags

### 7.1. Available Features by Plan

| Feature | TRIAL | STARTER | PROFESSIONAL | ENTERPRISE |
|---------|-------|---------|--------------|------------|
| `vehicles:read` | ✅ | ✅ | ✅ | ✅ |
| `vehicles:write` | ❌ | ✅ | ✅ | ✅ |
| `geofence` | ❌ | ✅ | ✅ | ✅ |
| `deviation_alerts` | ❌ | ✅ | ✅ | ✅ |
| `ai_reports` | ❌ | ❌ | ✅ | ✅ |
| `api_access` | ❌ | ❌ | ✅ | ✅ |
| `webhooks` | ❌ | ❌ | ❌ | ✅ |
| `priority_support` | ❌ | ❌ | ❌ | ✅ |
| `custom_branding` | ❌ | ❌ | ❌ | ✅ |
| `advanced_analytics` | ❌ | ❌ | ❌ | ✅ |

### 7.2. Feature Config Schema

```json
{
  "geofence": {
    "max_geofences": {
      "TRIAL": 0,
      "STARTER": 5,
      "PROFESSIONAL": 20,
      "ENTERPRISE": 100
    },
    "allow_import": {
      "TRIAL": false,
      "STARTER": false,
      "PROFESSIONAL": true,
      "ENTERPRISE": true
    }
  },
  "api_access": {
    "rate_limit": {
      "TRIAL": 0,
      "STARTER": 0,
      "PROFESSIONAL": 1000,
      "ENTERPRISE": 10000
    },
    "endpoints": {
      "TRIAL": [],
      "STARTER": [],
      "PROFESSIONAL": ["vehicles", "incidents", "telemetry"],
      "ENTERPRISE": ["*"]
    }
  }
}
```

---

## 8. UI/UX Requirements

### 8.1. Settings Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Tenant Settings                                    [Save]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌─────────────────────────────────────────┐ │
│  │ General  │  │                                         │ │
│  │ Branding │  │  General Settings                       │ │
│  │ Notif.   │  │  ─────────────────────────────────────  │ │
│  │ Security │  │                                         │ │
│  │ Integr.  │  │  Timezone    [Asia/Jakarta        ▼]    │ │
│  │ Features │  │  Language    [Indonesian          ▼]    │ │
│  │          │  │  Currency    [IDR                 ▼]    │ │
│  │          │  │  Date Format [DD/MM/YYYY          ▼]    │ │
│  │          │  │  Time Format [24h                  ▼]    │ │
│  │          │  │                                         │ │
│  │          │  │  [Reset to Defaults]                    │ │
│  └──────────┘  └─────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2. Feature Flags Page

```
┌─────────────────────────────────────────────────────────────┐
│  Feature Management                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Feature          │ Status  │ Config     │ Action    │   │
│  ├──────────────────┼─────────┼────────────┼───────────┤   │
│  │ Geofence         │ ON  ◉   │ [Edit]     │ [Disable] │   │
│  │ Deviation Alerts │ ON  ◉   │ [Edit]     │ [Disable] │   │
│  │ AI Reports       │ OFF ○   │ [Edit]     │ [Enable]  │   │
│  │ API Access       │ OFF ○   │ [Edit]     │ [Enable]  │   │
│  │ Webhooks         │ OFF ○   │ [Edit]     │ [Enable]  │   │
│  │ Priority Support │ OFF ○   │ [Edit]     │ [Enable]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ℹ️ Some features require plan upgrade                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Implementation Phases

### Phase 1: Database & Service Layer (Week 1)
- [ ] Enhance Prisma schema for TenantSetting and TenantFeature
- [ ] Create TenantSettingService with CRUD operations
- [ ] Create TenantFeatureService with toggle and config management
- [ ] Add validation logic for setting values
- [ ] Create default settings seeder

### Phase 2: API Layer (Week 2)
- [ ] Create settings routes (`/tenants/:id/settings/*`)
- [ ] Create feature management routes (`/tenants/:id/features/*`)
- [ ] Add audit logging for all setting changes
- [ ] Add setting import/export endpoints
- [ ] Add validation endpoint

### Phase 3: Integration (Week 3)
- [ ] Integrate with existing tenant routes
- [ ] Update tenant isolation middleware
- [ ] Connect feature flags to subscription service
- [ ] Add feature check middleware for protected endpoints

### Phase 4: UI/UX (Week 4)
- [ ] Create settings page with category tabs
- [ ] Create feature management page
- [ ] Add setting validation UI
- [ ] Add audit log viewer
- [ ] Add import/export UI

---

## 10. Migration Strategy

### 10.1. Data Migration

```sql
-- Migrate existing Tenant.config to TenantSetting table
INSERT INTO tenant_settings (id, "tenantId", category, key, value, "dataType", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  t.id,
  'general',
  'timezone',
  COALESCE(t.config->>'timezone', 'Asia/Jakarta'),
  'string',
  NOW(),
  NOW()
FROM tenants t
WHERE t.config->>'timezone' IS NOT NULL;

-- Similar for other settings...
```

### 10.2. Backward Compatibility

- Existing `/tenants/:id/settings` endpoints will continue to work
- New endpoints will be added alongside existing ones
- `Tenant.config` will be deprecated but not removed in v1

---

## 11. Security Considerations

1. **Secret Settings** — API keys, passwords stored encrypted
2. **Readonly Settings** — System settings cannot be modified by tenant
3. **Audit Trail** — All changes logged with before/after values
4. **Validation** — Server-side validation for all setting values
5. **Rate Limiting** — Setting updates rate-limited per tenant
6. **Permission Check** — Role-based access per setting category

---

## 12. Performance Considerations

1. **Caching** — Settings cached in Redis with 5-minute TTL
2. **Bulk Operations** — Support bulk setting updates
3. **Lazy Loading** — Settings loaded on-demand, not all at once
4. **Indexing** — Composite index on `(tenantId, category, key)`

---

## 13. Monitoring & Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `settings.update.count` | Number of setting updates | N/A |
| `settings.update.latency` | Update latency | > 100ms |
| `settings.validation.failures` | Validation failures | > 10/min |
| `features.toggle.count` | Feature toggle events | N/A |
| `features.check.count` | Feature check requests | N/A |

---

## 14. Open Questions

1. Should we support setting inheritance from parent tenant?
2. Do we need setting versioning for rollback?
3. Should integrations settings support OAuth flow?
4. Do we need setting templates for quick tenant setup?

---

## 15. Appendices

### A. Setting Value Types

| Type | Example | Validation |
|------|---------|------------|
| `string` | `"Asia/Jakarta"` | Pattern, enum, length |
| `number` | `30` | Min, max |
| `boolean` | `true` | None |
| `json` | `{...}` | Schema |
| `array` | `[...]` | Min length, item type |

### B. Error Codes

| Code | Description |
|------|-------------|
| `SETTING_NOT_FOUND` | Setting does not exist |
| `SETTING_READONLY` | Setting is read-only |
| `SETTING_INVALID` | Value validation failed |
| `FEATURE_NOT_AVAILABLE` | Feature not available in current plan |
| `FEATURE_LIMIT_EXCEEDED` | Feature usage limit exceeded |

---

**Document Version History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 18 Aug 2026 | VigilOS Team | Initial draft |
