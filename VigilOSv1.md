# VigilOS v1 - Sistem Kerja & Fitur

## Ringkasan

VigilOS adalah **Platform Operasional Fleet & Smart City** berbasis B2B SaaS untuk manajemen transportasi publik, pelacakan armada real-time, dan respons darurat. Dirancang untuk otoritas transportasi Indonesia (Trans Jakarta, Dishub Kota, dll).

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────┐
│                      VIGILOS ECOSYSTEM                  │
├──────────────┬──────────────┬──────────────┬────────────┤
│  Firmware    │   Backend    │   Frontend   │   Mobile   │
│  ESP32 GPS   │   Node.js    │   React      │   Flutter  │
│  Tracker     │   Server     │   Vite       │   App      │
└──────┬───────┴──────┬───────┴──────┬───────┴─────┬──────┘
       │              │              │             │
       ▼              ▼              ▼             ▼
   WiFi/4G        WebSocket      Leaflet.js    flutter_map
   MQTT           Redis          Socket.io     Socket.io
   HTTP POST      PostgreSQL     HTTP          HTTP
                  InfluxDB
                  Firebase FCM
```

### Technology Stack

| Komponen | Teknologi |
|----------|-----------|
| Backend | Node.js + Express.js + Socket.io |
| Database | PostgreSQL + PostGIS (relational) + InfluxDB (time-series) |
| Cache | Redis (token, presence, state, rate-limit) |
| Frontend | React 19 + Vite 8 + Leaflet.js |
| Mobile | Flutter/Dart (cross-platform) |
| Firmware | ESP32/ESP8266 + Arduino C++ |
| Maps | CARTO Dark Tiles + OpenStreetMap |
| Auth | JWT (user) + Device Token (IoT) |
| Notification | Firebase Cloud Messaging + Webhook |

---

## Sistem Kerja (Workflow)

### 1. Real-Time Fleet Tracking

```
ESP32 GPS Tracker
    │
    ├─► Telemetry Ingestion (HTTP POST /api/v1/telemetry/ingest)
    │   Header: X-Device-Token
    │   Body: lat, lng, speed, heading, passengers, engineStatus
    │
    ├─► Rate Limiting (Redis: 20 packets/menit, emergency bypass)
    │
    ├─► Speed Anomaly Detection (Stream Processing)
    │   ├─ >15% over speed limit → WARNING status
    │   └─ >35% over speed limit → CRITICAL status
    │
    ├─► Telemetry Storage (InfluxDB)
    │
    └─► WebSocket Broadcast → Command Center Dashboard
        ├─ SVG vehicle markers (color-coded)
        ├─ Geofence zone rendering
        ├─ Corridor route visualization
        └─ Vehicle drawer with live telemetry
```

### 2. Emergency Panic Button System

```
[Panik Tombol Ditekan]
    │
    ├─► Incident Record Created
    │   - vehicleId, type, severity, location, timestamp
    │
    ├─► WebSocket Broadcast (sub-second)
    │   └─ emergency_alert → Semua Command Center clients
    │
    ├─► Audio Alarm (Web Audio API)
    │   └─ Three-tone square wave sequence
    │
    ├─► Emergency Modal Overlay
    │   ├─ Flashing red header
    │   ├─ Vehicle details
    │   ├─ Action buttons:
    │   │   ├─ Call Cabin
    │   │   ├─ Dispatch Patrol
    │   │   ├─ Acknowledge
    │   │   └─ Resolve Incident
    │   └─ Timestamped audit log
    │
    ├─► FCM Push Notification
    │   └─ Dispatched to nearby patrol officers
    │
    └─► External Webhook
        └─ Municipal police / transport authority
```

### 3. Route Deviation Monitoring

```
Vehicle Movement
    │
    ├─► State 1: Normal (dalam corridor buffer)
    │   └─ Tidak ada UI interruption
    │
    ├─► State 2: Warning (mendekati buffer edge)
    │   └─ Toast notification (non-intrusive)
    │
    └─► State 3: Critical (melebihi 500m threshold)
        ├─ Modal overlay wajib
        ├─ Resolution reason (min. 10 karakter)
        ├─ Call Cabin / Push Notification
        └─ Audit trail recording
```

### 4. Device Token Authentication (IoT)

```
Device Provisioning
    │
    ├─► Token Generation
    │   - 32-char alphanumeric (vgl_live_xxxxxxxx...)
    │   - Bound to device_id + tenant
    │
    ├─► Firmware Storage
    │   - LittleFS /token.txt (primary)
    │   - EEPROM (fallback)
    │
    └─► Backend Validation Flow
        ├─ Redis Cache Check (sub-2ms)
        └─ PostgreSQL Fallback
```

---

## Fitur Utama

### A. Command Center (Frontend)

| Fitur | Deskripsi |
|-------|-----------|
| Live Map | Peta dark-theme (Leaflet.js) dengan marker kendaraan SVG, status warna |
| Vehicle Drawer | Info sliding card: kecepatan, heading, penumpang, status mesin, koordinat, driver |
| Emergency Modal | Overlay darurat dengan action buttons dan audit log |
| Route Deviation | Modal khusus dengan resolution reason wajib |
| Incident Logs | Tabel filter/search insiden dengan status badge |
| Fleet Admin | Tab Vehicles, Drivers, Device Tokens + Security Audit Log |
| Traffic Analytics | KPI cards, bar charts, congestion heatmap |
| Public Transit | ETA cards per halte, route planner, panic button penumpang |
| Patrol Officer | Profile, duty toggle, dispatch alerts, field report form |

### B. Tenant Portal (B2B SaaS)

| Fitur | Deskripsi |
|-------|-----------|
| Dashboard | KPI grid: vehicles, users, incidents, device tokens, subscription usage |
| Team Management | User listing, invite, role assignment, suspend/activate |
| Subscription & Billing | 3 tier (Basic/Pro/Enterprise), invoice management, upgrade/downgrade |
| SLA & Compliance | SLA document viewer, uptime guarantee, AI report placeholder |
| API Keys | Create, list, revoke API keys dengan granular permissions |

### C. Mobile App (Flutter)

| Role | Fitur |
|------|-------|
| Public Transit | Real-time bus tracking, ETA per stasiun, route planner, panic button |
| Patrol Officer | Duty status, emergency dispatch alerts, navigation (Google Maps), field report |
| Operator | Dashboard monitoring armada |
| Admin | Admin dashboard |

### D. Firmware (ESP32)

| Fitur | Deskripsi |
|-------|-----------|
| GPS Tracking | NEO-6M / u-blox, serial communication |
| Telemetry | Speed, heading, passengers, engine status, GPS coordinates |
| WiFi/4G | Konfigurasi via config.h |
| MQTT | Optional, untuk komunikasi dua arah |
| Token Auth | LittleFS storage, serial provisioning |
| Heartbeat | Dynamic interval: normal=10s, anomaly=1s |

---

## Sistem Autentikasi & Autorisasi

### User Authentication
- **JWT** access token (15 menit) + refresh token (7 hari, HTTP-only cookie)
- **bcrypt** password hashing (10 rounds)
- **Auth audit log**: Setiap login attempt, success, failure, refresh, logout

### Device Token Authentication
- Token 32 karakter (prefix `vgl_live_`)
- Transmitted via `X-Device-Token` header
- Redis cache validation → PostgreSQL fallback
- Security events: MISSING, INVALID, REVOKED, EXPIRED, BINDING_MISMATCH

### Role-Based Access Control (RBAC)

| Role | Akses |
|------|-------|
| SUPER_ADMIN | Global access (VigilOS internal) |
| TENANT_ADMIN | Full tenant access (billing, team, API) |
| TENANT_FINANCE | Billing & invoices only |
| TENANT_DISPATCHER | Command Center only (no portal) |
| TENANT_AUDITOR | Read-only SLA & audit logs |
| COMMAND_CENTER_OPERATOR | Real-time fleet monitoring |
| PATROL_OFFICER | Field patrol & emergency response |

---

## API Endpoints

### Base URL: `http://localhost:4000/api/v1`

#### Authentication (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | User login |
| POST | `/auth/register` | Register user |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Invalidate refresh token |
| GET | `/auth/me` | Get current user (protected) |
| PUT | `/auth/profile` | Update profile (protected) |

#### Fleet & Operations (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vehicles` | List all vehicles |
| POST | `/vehicles` | Create vehicle |
| PUT | `/vehicles/:id` | Update vehicle |
| DELETE | `/vehicles/:id` | Delete vehicle |
| GET | `/drivers` | List drivers |
| POST | `/drivers` | Create driver |
| GET | `/incidents` | List incidents |
| POST | `/incidents/:id/acknowledge` | Acknowledge incident |
| POST | `/incidents/:id/resolve` | Resolve incident |

#### IoT & Telemetry (Device Token Auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/emergency/trigger` | Trigger emergency (FCM dispatch) |
| POST | `/telemetry/ingest` | Telemetry ingestion |
| GET | `/telemetry/history` | Query history |

#### Device Token Management (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tokens` | List device tokens |
| POST | `/tokens/generate` | Generate new token |
| POST | `/tokens/:id/revoke` | Revoke token |
| POST | `/tokens/:id/rotate` | Rotate token |

#### Tenant Portal (Protected, RBAC)
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/portal/dashboard` | All authenticated |
| GET | `/portal/users` | All authenticated |
| POST | `/portal/users/invite` | SUPER_ADMIN, TENANT_ADMIN |
| GET | `/portal/subscriptions` | All authenticated |
| GET | `/portal/invoices` | All authenticated |
| POST | `/portal/api-keys` | SUPER_ADMIN, TENANT_ADMIN |
| GET | `/portal/sla` | All authenticated |
| GET | `/portal/auth-audit` | SUPER_ADMIN, TENANT_ADMIN, TENANT_AUDITOR |

### WebSocket Events

| Event (Server → Client) | Deskripsi |
|--------------------------|-----------|
| `initial_state` | State snapshot saat connect |
| `telemetry_update` | Update posisi/kecepatan real-time |
| `emergency_alert` | Panic button triggered |
| `incident_acknowledged` | Insiden di-acknowledge |
| `incident_resolved` | Insiden diselesaikan |
| `route_deviation_event` | Route deviation terdeteksi |
| `control_signal` | MQTT control command |

| Event (Client → Server) | Deskripsi |
|--------------------------|-----------|
| `trigger_panic_button` | Simulasi darurat |
| `acknowledge_incident` | Acknowledge insiden |
| `resolve_incident` | Resolve insiden |
| `update_officer_status` | Ubah status duty |
| `resolve_route_deviation` | Resolve deviation dengan alasan |

---

## Redis Caching Modules

| Module | Key Pattern | TTL | Fungsi |
|--------|-------------|-----|--------|
| Device Token | `device:token:{token}` | - | Validasi token sub-millisecond |
| Device Presence | `device:presence:{id}` | 30 detik | Deteksi offline otomatis |
| Latest Telemetry | `device:state:{id}` | 5 menit | Dashboard load instan |
| Rate Limiting | `ratelimit:{id}` | 60 detik window | Max 20 paket/menit |

---

## Multi-Tenancy

| Tenant | Plan | Device Limit |
|--------|------|--------------|
| DKI Jakarta Transport Authority | Enterprise | 100 |
| Trans Surabaya Operations | Pro | 30 |
| Truck Expedisi Paket | Pro | 20 |

Setiap tenant terisolasi: vehicles, drivers, users, device tokens, incidents, subscriptions, invoices, API keys, SLA documents.

---

## Database Schema (In-Memory Simulation)

### Core Entities

| Entity | Key Fields |
|--------|------------|
| tenants | id, name, status, region, planTier, createdAt |
| users | id, name, email, password (bcrypt), role, tenantId, status |
| vehicles | id, code, name, type, tenantId, driver, speedLimit, lat, lng, speed, status |
| drivers | id, name, vehicleId, licenseNo, safetyScore, status |
| officers | id, name, badgeNo, dutyStatus, unitId, tenantId |
| deviceTokens | id, token, deviceId, tenantId, status, createdAt, expiresAt |
| incidents | id, vehicleId, type, severity, location, status, timestamp, fieldReport |
| securityEvents | id, eventType, deviceId, tenantId, details, timestamp |

### RBAC & Portal

| Entity | Key Fields |
|--------|------------|
| roles | id, name, description |
| subscriptions | id, tenantId, planTier, status, deviceLimit, features[] |
| invoices | id, tenantId, amount, status, lineItems[] |
| apiKeys | id, tenantId, name, keyHash, permissions[] |
| slaDocuments | id, tenantId, title, uptimeGuarantee |
| refreshTokens | id, token, userId, expiresAt |

---

## Deployment & Configuration

| Komponen | Port | Konfigurasi |
|----------|------|-------------|
| Backend | 4000 | `PORT`, `REDIS_URL`, `JWT_SECRET` |
| Frontend | Vite dev | Connect ke `http://localhost:4000` |
| Mobile | - | Configurable server URL |
| Firmware | - | `config.h` (WiFi, server, GPS pins, MQTT) |

### Graceful Shutdown
- SIGTERM/SIGINT handling: MQTT broker stop → Redis quit → HTTP server close

### Redis Degraded Mode
- Server tetap berjalan tanpa Redis
- Semua cache operations fallback ke PostgreSQL

---

## Integrasi Eksternal

| Service | Fungsi |
|---------|--------|
| Firebase Cloud Messaging (FCM) | Push notifications ke patrol mobile apps |
| Municipal Emergency Webhooks | Forward data darurat ke polisi/otoritas transport |
| MQTT Broker (EMQX/Mosquitto) | Komunikasi IoT device dua arah |
| PostgreSQL + PostGIS | Data relasional + geospatial queries |
| InfluxDB | Time-series telemetry storage |
| Redis | Token caching, presence, state, rate limiting |
| Google Maps Navigation | Turn-by-turn untuk patrol officers |
| OpenStreetMap / CARTO | Dark-themed map tiles |

---

## Entry Points

| Component | Path | Command |
|-----------|------|---------|
| Backend | `/vigil-server/src/server.js` | `npm start` |
| Frontend | `/vigil-app/src/main.jsx` | `npm run dev` |
| Mobile | `/vigil-mobile/lib/main.dart` | `flutter run` |
| Firmware | `/firmware/vigilos-esp-gps-tracker/vigilos_esp_gps_tracker.ino` | Arduino IDE upload |
