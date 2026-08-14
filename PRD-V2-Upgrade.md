# PRD — VigilOS V2 Upgrade
## Menyesuaikan Implementasi ke Wireframe Spec

**Versi Dokumen:** 2.0.0  
**Tanggal:** 11 Agustus 2026  
**Status:** Draft — Menunggu Review  

---

## 1. Ringkasan Eksekutif

Dokumen ini adalah **Product Requirements Document (PRD)** untuk upgrade VigilOS dari V1 ke V2. Berdasarkan gap analysis antara [vigilos-wireframe-spec.md](file:///Users/sun/Documents/VigilOS/vigilos-wireframe-spec.md) dan implementasi aktual di codebase, ditemukan **sejumlah gap signifikan** yang perlu ditutup agar sistem sesuai dengan spesifikasi wireframe.

### Kondisi Saat Ini (V1)

| Komponen | Status | Detail |
|----------|--------|--------|
| Command Center — Login | ✅ Sudah ada | Split-screen, branding, form login, demo mode |
| Command Center — Live Map | ⚠️ Parsial | Map + marker ada, tapi **tanpa search bar, cluster, counter ringkas, loading skeleton** |
| Command Center — Vehicle Drawer | ⚠️ Parsial | Info dasar ada, tapi **tanpa mini-chart kecepatan, stale GPS badge, tombol aksi** |
| Command Center — Emergency Modal | ⚠️ Parsial | 4 tombol aksi ada, tapi **tanpa peta mini, resolve wajib textarea, queue system** |
| Command Center — Route Deviation | ✅ Sebagian besar sesuai | Warning toast + critical modal, resolution reason |
| Command Center — Incident Logs | ⚠️ Parsial | Tabel ada, tapi **tanpa filter, pagination, export CSV/PDF, detail timeline** |
| Command Center — Fleet Admin (Vehicles) | ✅ Sebagian besar sesuai | CRUD + form ada |
| Command Center — Fleet Admin (Drivers) | ✅ Sebagian besar sesuai | Tabel + form ada |
| Command Center — Fleet Admin (Tokens) | ✅ Sesuai | Generate, revoke, rotate, security audit log |
| Command Center — Traffic Analytics | ⚠️ Parsial | Layout dasar ada, tapi **chart data statis placeholder** |
| Tenant Portal — Dashboard | ✅ Sudah ada | KPI cards, subscription status |
| Tenant Portal — Team Management | ✅ Sudah ada | User listing, invite, role badge |
| Tenant Portal — Subscription & Billing | ✅ Sudah ada | 3 tier, invoice |
| Tenant Portal — SLA & Compliance | ✅ Sudah ada (basic) | |
| Tenant Portal — API Keys | ✅ Sudah ada | |
| Mobile — Login | ✅ Sudah ada | |
| Mobile — Role Selection | ✅ Sudah ada | |
| Mobile — Public Transit (Live Map + ETA) | ⚠️ Parsial | **Tanpa peta aktual, ETA statis hardcode** |
| Mobile — Panic Button Flow | ⚠️ Parsial | Dialog ada, tapi **tanpa konfirmasi 2 tahap, status tracking** |
| Mobile — Patrol Dashboard | ⚠️ Parsial | Duty toggle ada, tapi **tanpa push notification deep link** |
| Mobile — Dispatch & Navigation | ✅ Sudah ada | Google Maps integration |
| Mobile — Field Report Form | ⚠️ Parsial | **Tanpa dropdown jenis kejadian, upload foto, offline draft** |
| Mobile — Route Planner | ❌ Belum ada | |
| Mobile — Splash Screen | ❌ Belum ada (langsung ke Login) | |
| Backend — Semua endpoint | ✅ Sudah lengkap | Auth, fleet, telemetry, portal, WebSocket |

---

## 2. Gap Analysis Detail per Layar

### A. COMMAND CENTER (Web)

---

#### A1. Login — `LoginPage.jsx`
**Status: ✅ Sesuai — Minor Enhancement**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Split screen layout | ✅ Ada | — |
| Form: email, password | ✅ Ada | — |
| Checkbox "Ingat Saya" | ❌ Tidak ada | **TAMBAH** checkbox remember me |
| Loading spinner saat proses | ✅ Ada (text "Signing in...") | Upgrade ke **spinner visual** |
| Error inline (bukan modal) | ✅ Ada | — |
| State: Locked (terlalu banyak gagal) | ❌ Tidak ada | **TAMBAH** rate-limit UI setelah 5x gagal |
| Enter key submit | ✅ Ada (form onSubmit) | — |
| Preview blur live map di background | ❌ Tidak ada | **TAMBAH** map blur background di panel kiri |

**Prioritas: P1** — Fungsional sudah ok, enhancement untuk polish.

---

#### A2. Dashboard / Live Map — `LiveMap.jsx`
**Status: ⚠️ Gap Signifikan — P0**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Full-bleed map | ✅ Ada | — |
| Dark-theme CARTO tiles | ✅ Ada | — |
| Marker SVG color-coded | ✅ Ada (normal/warning/emergency/idle) | — |
| Marker menunjukkan heading/arah | ❌ Marker statis (circle) | **UBAH** ke directional arrow marker |
| Cluster marker saat zoom out | ❌ Tidak ada | **TAMBAH** Leaflet.markercluster |
| Layer toggle: geofence, corridor, heatmap | ⚠️ Ada geofence + corridor, **tanpa heatmap** | **TAMBAH** traffic heatmap layer |
| Search bar cepat (nomor/kode) | ❌ Tidak ada | **TAMBAH** search input di map controls |
| Counter ringkas (total aktif, warning, kritis) | ⚠️ Ada di legend, **bukan di pojok** | **PINDAH** ke overlay counter card |
| Loading skeleton + shimmer | ❌ Spinner biasa | **UBAH** ke skeleton shimmer |
| Empty state CTA | ❌ Tidak ada | **TAMBAH** "Tambah kendaraan pertama" |
| Smooth marker interpolation | ❌ Marker "loncat" | **TAMBAH** Leaflet smooth move |
| WebSocket disconnect banner | ❌ Tidak ada | **TAMBAH** banner kuning di atas peta |

**File terdampak:**
- `vigil-app/src/components/map/LiveMap.jsx` — major refactor
- `vigil-app/src/index.css` — tambah style skeleton, search, counter
- `vigil-app/package.json` — tambah dependency `leaflet.markercluster`

---

#### A3. Vehicle Drawer — `VehicleDrawer.jsx`
**Status: ⚠️ Gap Signifikan — P0**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Slide-in panel ~360px | ✅ Ada | — |
| Peta tetap interaktif | ✅ Ada | — |
| Nomor kendaraan + status badge | ✅ Ada | — |
| Foto/avatar driver | ⚠️ Inisial saja | **TAMBAH** foto placeholder atau avatar |
| Grid data telemetry | ✅ Ada (speed, heading, passengers, engine, coords) | — |
| Mini-chart kecepatan 10 menit | ❌ Tidak ada | **TAMBAH** sparkline/mini chart |
| Tombol "Hubungi Kabin" | ❌ Tidak ada | **TAMBAH** action buttons |
| Tombol "Lihat Riwayat Rute" | ❌ Tidak ada | **TAMBAH** tombol + page link |
| GPS stale badge (>30 detik) | ❌ Tidak ada | **TAMBAH** badge "sinyal terakhir X menit lalu" |
| Warning status di statusLabels | ❌ Missing dari statusLabels map | **FIX** tambah `warning` ke labels |

**File terdampak:**
- `vigil-app/src/components/map/VehicleDrawer.jsx` — major enhancement
- Perlu library chart kecil (misal `recharts` atau inline SVG sparkline)

---

#### A4. Emergency Modal — `EmergencyModal.jsx`
**Status: ⚠️ Gap — P0**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Overlay penuh + dim background | ✅ Ada | — |
| Header merah berkedip pelan | ✅ Ada (CSS animation) | — |
| Tidak bisa ditutup klik di luar | ❌ Bisa dismiss (tombol Dismiss) | **UBAH** — hapus tombol Dismiss, harus Resolve |
| Peta mini lokasi kejadian | ❌ Tidak ada | **TAMBAH** mini Leaflet map di modal |
| 4 tombol aksi besar | ✅ Ada (Call, Dispatch, Acknowledge, Resolve) | — |
| Timestamp log setiap aksi | ⚠️ Status message saja | **UBAH** ke timestamped audit log list |
| Resolve wajib isi alasan (textarea) | ❌ Resolve langsung 1-klik | **TAMBAH** textarea + validasi minimal karakter |
| Multiple emergency → queue | ❌ 1 modal saja, modal lama ditimpa | **TAMBAH** emergency queue/stack list |
| Acknowledge → alarm berhenti, modal tetap | ❌ Alarm flow tidak dikelola | **TAMBAH** alarm state management |
| Resolved → fade animation + masuk incident log | ⚠️ Ada fade via timeout, tapi tidak ada animasi | **ENHANCE** smooth fade + log push |

**File terdampak:**
- `vigil-app/src/components/alerts/EmergencyModal.jsx` — major refactor
- `vigil-app/src/App.jsx` — emergency queue state management
- `vigil-app/src/hooks/useAudioAlarm.js` — alarm control per state

---

#### A5. Route Deviation Modal — `RouteDeviationModal.jsx`
**Status: ✅ Sebagian Besar Sesuai — P1 Enhancement**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Toast warning (non-blocking) | ✅ Ada | — |
| Auto-dismiss 8 detik | ⚠️ 5 detik | **UBAH** ke 8 detik |
| Critical modal wajib | ✅ Ada | — |
| Peta rute vs posisi aktual | ❌ Tidak ada peta di modal | **TAMBAH** mini map overlay |
| Resolution reason wajib | ✅ Ada | — |

---

#### A6. Incident Logs — `IncidentLogs.jsx`
**Status: ⚠️ Gap — P1**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Tabel full-width | ✅ Ada | — |
| Filter bar (tanggal, tipe, status, tenant) | ❌ Tidak ada filter | **TAMBAH** filter bar lengkap |
| Kolom: waktu, kendaraan, tipe, severity, status, durasi respons | ⚠️ Parsial | **LENGKAPI** semua kolom |
| Pagination | ❌ Tidak ada | **TAMBAH** pagination |
| Export CSV/PDF | ❌ Tidak ada | **TAMBAH** export buttons |
| Empty state positif | ❌ Tidak ada | **TAMBAH** |
| Loading skeleton rows | ❌ Tidak ada | **TAMBAH** |
| Klik baris → detail timeline | ❌ Tidak ada | **TAMBAH** detail drawer/modal |

**File terdampak:**
- `vigil-app/src/components/pages/IncidentLogs.jsx` — major rewrite

---

#### A7. Fleet Admin — Vehicles — `FleetAdmin.jsx`
**Status: ✅ Sesuai — P0 Tercapai**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Tabel + tombol Tambah | ✅ Ada (card grid + modal) | — |
| Search & filter | ❌ Tidak ada | **TAMBAH** search di atas grid |
| Form validation inline | ⚠️ Required saja | **ENHANCE** real-time validation |
| Status toggle aktif/nonaktif | ❌ Tidak ada toggle | **TAMBAH** active/inactive toggle |

---

#### A8. Fleet Admin — Drivers
**Status: ✅ Sesuai — P1**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Tabel + form | ✅ Ada | — |
| Safety score badge warna | ✅ Ada (color bar) | — |
| Edit driver | ❌ Hanya add/delete | **TAMBAH** inline edit |

---

#### A9. Fleet Admin — Device Tokens & Security Audit
**Status: ✅ Sesuai — P0 Tercapai**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Tabel token aktif | ✅ Ada | — |
| Generate → tampil sekali + copy | ✅ Ada | — |
| Revoke/rotate per token | ✅ Ada | — |
| Token baru di-highlight | ❌ Tidak ada highlight | **TAMBAH** highlight row sementara |
| Token revoked → strikethrough | ❌ Badge saja | **TAMBAH** strikethrough styling |
| Security audit log collapsible | ⚠️ Ada, tapi selalu terbuka | **UBAH** ke collapsible section |

---

#### A10. Traffic Analytics
**Status: ⚠️ Parsial — P2**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Grid KPI card (4 kolom) | ⚠️ Ada tapi data statis | **UBAH** ke data dari backend |
| Bar chart per rute/jam | ❌ Placeholder | **TAMBAH** chart library (recharts) |
| Heatmap kepadatan (layer peta) | ❌ Tidak ada | **TAMBAH** heatmap layer |

---

### B. TENANT PORTAL (Web)

---

#### B1. Dashboard Tenant — `PortalDashboard.jsx`
**Status: ✅ Sesuai — P0 Tercapai**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Grid KPI card | ✅ Ada | — |
| Progress bar kuota device | ❌ Angka saja | **TAMBAH** progress bar visual |
| Badge subscription status | ✅ Ada | — |
| Mendekati limit → CTA upgrade kuning | ❌ Tidak ada | **TAMBAH** warning card + CTA |

---

#### B2. Team Management — `TeamManagement.jsx`
**Status: ✅ Sesuai — P1**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Tabel user + role badge | ✅ Ada | — |
| Modal invite (email + role) | ✅ Ada | — |
| Suspend/activate per baris | ✅ Ada | — |
| Konfirmasi aksi destruktif | ⚠️ Langsung suspend | **TAMBAH** modal konfirmasi |

---

#### B3. Subscription & Billing — `SubscriptionBilling.jsx`
**Status: ✅ Sesuai — P1**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Card 3 tier side-by-side | ✅ Ada | — |
| Highlight tier aktif | ✅ Ada | — |
| Invoice tabel | ✅ Ada | — |
| Invoice download PDF | ❌ Tidak ada | **TAMBAH** PDF download button |
| Modal konfirmasi upgrade/downgrade | ⚠️ Langsung | **TAMBAH** confirmation modal |

---

#### B4. SLA & Compliance — `SLACompliance.jsx`
**Status: ✅ Basic — P2**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| SLA document viewer | ⚠️ Teks statis | **TAMBAH** PDF embed atau structured view |
| Gauge uptime actual vs guaranteed | ❌ Tidak ada gauge | **TAMBAH** gauge/progress visual |

---

#### B5. API Keys — `APIKeys.jsx`
**Status: ✅ Sesuai — P2**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Tabel key + permission badge | ✅ Ada | — |
| Generate baru (tampil sekali) | ✅ Ada | — |

---

### C. MOBILE APP (Flutter)

---

#### C1. Splash & Role Selection
**Status: ⚠️ Gap — P0**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Splash screen (logo + auto-redirect) | ❌ Langsung ke LoginScreen | **TAMBAH** SplashScreen widget |
| Role selection setelah login | ✅ Ada (`role_selection_screen.dart`) | — |

**File baru:** `vigil-mobile/lib/screens/splash_screen.dart`

---

#### C2. Publik — Live Map & ETA
**Status: ⚠️ Gap Signifikan — P0**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Peta sebagai layar utama | ❌ List view saja, tanpa peta | **TAMBAH** flutter_map widget |
| Bottom sheet daftar halte + ETA | ❌ ListView biasa | **UBAH** ke DraggableScrollableSheet |
| Search rute/halte | ❌ Dropdown saja | **UBAH** ke search TextField |
| Card ETA per halte (waktu, jarak bus) | ⚠️ Ada tapi ETA hardcode "4 mins" | **HITUNG** ETA real dari GPS data |
| FAB merah panic button (selalu terlihat) | ❌ Di AppBar icon | **PINDAH** ke FloatingActionButton merah |
| Prompt permission lokasi | ❌ Tidak ada | **TAMBAH** location permission flow |
| Empty state bus belum ada | ❌ Tidak ada | **TAMBAH** friendly empty state |

**File terdampak:** `vigil-mobile/lib/screens/public/public_transit_screen.dart` — major rewrite

---

#### C3. Publik — Route Planner
**Status: ❌ Belum Ada — P1**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Form input asal-tujuan | ❌ Tidak ada | **BUAT** screen baru |
| Hasil rute sebagai list card | ❌ Tidak ada | **BUAT** |
| Estimasi waktu per opsi | ❌ Tidak ada | **BUAT** |

**File baru:** `vigil-mobile/lib/screens/public/route_planner_screen.dart`

---

#### C4. Publik — Panic Button Flow
**Status: ⚠️ Gap — P0**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Konfirmasi 2 tahap (tekan + tahan 3 detik) | ❌ 1 dialog saja | **UBAH** ke long-press + countdown |
| Layar status "Bantuan sedang menuju" | ❌ Snackbar saja | **TAMBAH** dedicated status screen |
| Nomor kontak darurat langsung telepon | ❌ Tidak ada | **TAMBAH** call action |
| State: mengirim, terkirim, gagal | ❌ Hanya success snackbar | **TAMBAH** full state management |
| Retry otomatis + fallback telepon | ❌ Tidak ada | **TAMBAH** retry logic |

**File terdampak:** `vigil-mobile/lib/screens/public/public_transit_screen.dart`  
**File baru:** `vigil-mobile/lib/screens/public/panic_status_screen.dart`

---

#### C5. Patroli — Duty Status & Dashboard
**Status: ⚠️ Parsial — P0**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Toggle besar On Duty/Off Duty | ⚠️ ChoiceChip (kecil) | **UBAH** ke large switch toggle |
| Alert card dengan severity badge | ✅ Ada | — |
| Push notification → deep link ke detail | ❌ SnackBar saja | **TAMBAH** FCM + deep link handler |

**File terdampak:** `vigil-mobile/lib/screens/officer/officer_dashboard_screen.dart`

---

#### C6. Patroli — Dispatch Detail & Navigasi
**Status: ✅ Sesuai — P0 Tercapai**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Detail insiden di atas | ✅ Ada dalam card | — |
| Tombol navigasi Google Maps | ✅ Ada (`url_launcher`) | — |
| Foto lokasi jika ada | ❌ Tidak ada | **TAMBAH** image display |

---

#### C7. Patroli — Field Report Form
**Status: ⚠️ Gap — P1**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Form terstruktur | ❌ TextField saja | **UBAH** ke structured form |
| Dropdown jenis kejadian | ❌ Tidak ada | **TAMBAH** DropdownButtonFormField |
| Upload foto opsional | ❌ Tidak ada | **TAMBAH** image_picker integration |
| Offline draft + auto-sync | ❌ Tidak ada | **TAMBAH** local storage + sync queue |

**File terdampak:** `vigil-mobile/lib/screens/officer/officer_dashboard_screen.dart`

---

#### C8. Operator & Admin Dashboard (Mobile)
**Status: ⚠️ Basic — P2**

| Wireframe Spec | V1 Status | V2 Action |
|----------------|-----------|-----------|
| Live map versi mobile ringan | ❌ Statistik saja | **TAMBAH** mini flutter_map |
| Notifikasi real-time | ❌ Tidak ada | **TAMBAH** WebSocket listener |

---

## 3. Catatan Lintas-Layar (Cross-Cutting Concerns)

### 3.1 Konsistensi Warna Status

| Status | Hex Code | V1 Frontend | V1 Mobile | V2 Action |
|--------|----------|-------------|-----------|-----------|
| Normal/Green | `#10b981` | ✅ | ✅ | — |
| Warning/Yellow | `#facc15` | ✅ | ✅ | — |
| Critical/Red | `#ef4444` | ✅ | ✅ | — |
| Offline/Grey | `#6b7280` | ⚠️ Idle=Blue | ❌ Tidak ada | **STANDARISASI** grey untuk offline di semua interface |

### 3.2 Tabel State Management
**Wireframe:** Setiap tabel butuh 3 state (loading skeleton, empty CTA, filled)

| Komponen Tabel | Loading State | Empty State | V2 Action |
|---------------|---------------|-------------|-----------|
| IncidentLogs | ❌ | ❌ | **TAMBAH** skeleton + empty CTA |
| Fleet Vehicles | ❌ | ❌ | **TAMBAH** skeleton + "Tambah kendaraan pertama" |
| Fleet Drivers | ❌ | ❌ | **TAMBAH** skeleton + CTA |
| Device Tokens | ❌ | ✅ Ada | **TAMBAH** skeleton |
| Team Management (Portal) | ❌ | ❌ | **TAMBAH** |

### 3.3 Aksi Destruktif — Modal Konfirmasi

| Aksi | V1 Status | V2 Action |
|------|-----------|-----------|
| Delete Vehicle | ❌ Langsung | **TAMBAH** modal "Yakin hapus?" |
| Delete Driver | ❌ Langsung | **TAMBAH** modal |
| Revoke Token | ✅ (inferred) | Pastikan ada |
| Suspend User | ⚠️ | **TAMBAH** modal |

### 3.4 Form Validation Inline

| Form | V1 Status | V2 Action |
|------|-----------|-----------|
| Login | ⚠️ Error setelah submit | **TAMBAH** real-time validation |
| Add Vehicle | ⚠️ Required saja | **TAMBAH** inline error messages |
| Add Driver | ⚠️ Required saja | **TAMBAH** inline error messages |
| Generate Token | ⚠️ Required saja | **TAMBAH** inline error messages |
| Resolve Emergency | ❌ Tidak ada form | **TAMBAH** textarea + min char |
| Field Report | ❌ | **TAMBAH** |

---

## 4. Perubahan Backend yang Dibutuhkan untuk V2

| Fitur | Endpoint/Modul | V2 Action |
|-------|----------------|-----------|
| Incident detail timeline | `GET /api/v1/incidents/:id/timeline` | **BUAT** endpoint baru |
| Incident filter + pagination | `GET /api/v1/incidents?page=&type=&status=&from=&to=` | **ENHANCE** query params |
| Incident export | `GET /api/v1/incidents/export?format=csv|pdf` | **BUAT** endpoint baru |
| Vehicle search | `GET /api/v1/vehicles?search=` | **ENHANCE** query params |
| Speed history (mini chart) | `GET /api/v1/telemetry/speed-history/:vehicleId` | **BUAT** endpoint baru |
| ETA calculation | `GET /api/v1/transit/eta/:stationId` | **BUAT** endpoint baru |
| Route planner | `GET /api/v1/transit/routes?from=&to=` | **BUAT** endpoint baru |
| Emergency queue | WebSocket event: `emergency_queue_update` | **ENHANCE** socket handler |
| Login rate limiting | `POST /api/v1/auth/login` → Redis counter | **TAMBAH** rate limit check |
| Offline field report sync | `POST /api/v1/incidents/:id/field-report` | **ENHANCE** idempotent |
| Invoice PDF generation | `GET /api/v1/portal/invoices/:id/pdf` | **BUAT** endpoint baru |

---

## 5. Dependency Baru yang Dibutuhkan

### Frontend (vigil-app)
| Package | Versi | Kegunaan |
|---------|-------|----------|
| `leaflet.markercluster` | ^1.5.3 | Cluster marker saat zoom out |
| `recharts` atau sparkline SVG | latest | Mini-chart kecepatan di VehicleDrawer |
| `leaflet-heat` | ^0.2.0 | Traffic heatmap layer |
| `file-saver` + `jspdf` | latest | Export CSV/PDF incident logs |

### Mobile (vigil-mobile)
| Package | Versi | Kegunaan |
|---------|-------|----------|
| `flutter_map` | sudah ada | Peta untuk public transit |
| `image_picker` | latest | Upload foto field report |
| `geolocator` | latest | Location permission + GPS |
| `sqflite` atau `hive` | latest | Offline draft storage |
| `firebase_messaging` | latest | Push notification + deep link |

---

## 6. Urutan Build V2 (Sesuai Prioritas Wireframe)

### Sprint 1 — P0 Critical (Demo-Ready) — 2-3 Minggu

1. **Live Map Enhancement** — search bar, marker cluster, directional arrows, counter, skeleton, disconnect banner
2. **Vehicle Drawer Enhancement** — mini-chart, action buttons, GPS stale badge
3. **Emergency Modal Overhaul** — peta mini, resolve textarea, queue system, alarm management
4. **Panic Button Flow (Mobile)** — 2-step confirm, status screen, retry logic
5. **Splash Screen (Mobile)** — simple logo + auto-redirect
6. **Public Transit Map (Mobile)** — flutter_map, FAB panic, real ETA

### Sprint 2 — P0 Completion + P1 Start — 2 Minggu

7. **Incident Logs Enhancement** — filter, pagination, export, detail timeline
8. **Patrol Dashboard Enhancement** — large toggle, FCM deep link
9. **Fleet Admin Polish** — search, validation, confirmation dialogs
10. **Login Enhancement** — remember me, rate limit, blur background

### Sprint 3 — P1 Features — 2 Minggu

11. **Route Planner (Mobile)** — screen baru
12. **Field Report Form (Mobile)** — structured form, photo upload, offline draft
13. **Team Management** — confirmation modals
14. **Subscription & Billing** — PDF download, upgrade confirmation
15. **Route Deviation Modal** — mini map overlay

### Sprint 4 — P2 Polish — 1-2 Minggu

16. **Traffic Analytics** — real charts, heatmap layer
17. **SLA & Compliance** — gauge visual
18. **Cross-cutting** — consistent table states, form validation, color standardization
19. **Operator Mobile Dashboard** — mini map + notifications

---

## 7. Catatan Teknis & Risiko

### Risiko Tinggi
- **Emergency Queue System**: Perubahan state management signifikan di `App.jsx`. Multiple emergencies simultaneous harus di-handle tanpa modal saling menutupi
- **Offline Field Report**: Membutuhkan local DB di Flutter + sync queue — kompleksitas tinggi
- **Real ETA Calculation**: Perlu algorithm distance/time estimation dari GPS data real-time

### Risiko Sedang
- **Marker Cluster**: Perlu testing performa dengan banyak kendaraan
- **Mini Chart di VehicleDrawer**: Perlu endpoint speed history + frontend chart render

### Risiko Rendah
- **Splash Screen**: Straightforward
- **UI Polish** (skeleton, buttons, badges): Incremental changes

---

## 8. Acceptance Criteria V2

### Command Center
- [ ] Live Map menampilkan search bar yang bisa filter kendaraan by nomor/kode
- [ ] Marker cluster otomatis saat zoom level < 12
- [ ] Marker kendaraan menunjukkan arah heading
- [ ] Counter ringkas (aktif/warning/kritis) di pojok atas peta
- [ ] Loading skeleton saat initial data fetch
- [ ] Banner kuning muncul saat WebSocket disconnect
- [ ] Vehicle Drawer menampilkan mini-chart kecepatan 10 menit terakhir
- [ ] Vehicle Drawer menampilkan badge stale GPS jika >30 detik tanpa update
- [ ] Emergency Modal tidak bisa ditutup tanpa Resolve
- [ ] Emergency Resolve wajib isi alasan (minimal 10 karakter)
- [ ] Multiple emergency membentuk queue, bukan modal bertumpuk
- [ ] Incident Logs bisa difilter, dipaginate, dan diexport CSV/PDF
- [ ] Setiap aksi delete/revoke/suspend memiliki modal konfirmasi

### Tenant Portal
- [ ] Dashboard menampilkan progress bar kuota device
- [ ] Warning card kuning saat mendekati limit kuota
- [ ] Invoice bisa didownload sebagai PDF
- [ ] Upgrade/downgrade memiliki modal konfirmasi

### Mobile App
- [ ] Splash screen tampil 1.5 detik sebelum ke login
- [ ] Public Transit menampilkan peta dengan marker bus
- [ ] ETA dihitung dari data GPS real (bukan hardcode)
- [ ] Panic button menggunakan konfirmasi 2 tahap (long press)
- [ ] Status "Bantuan sedang menuju" setelah panic berhasil terkirim
- [ ] Patrol duty toggle berukuran besar dan jelas
- [ ] Field report memiliki dropdown jenis kejadian + upload foto
- [ ] Route planner screen tersedia dengan form asal-tujuan

### Backend
- [ ] Endpoint incident timeline tersedia
- [ ] Incident list mendukung filter + pagination
- [ ] Export CSV/PDF functional
- [ ] Login rate limiting aktif setelah 5x gagal
- [ ] Speed history endpoint mengembalikan data 10 menit terakhir
