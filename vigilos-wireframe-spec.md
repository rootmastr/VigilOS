# VigilOS — Wireframe & Screen Spec

Dokumen ini adalah acuan detail layar per layar untuk pengembangan VigilOS, mencakup 3 interface: **Command Center** (web), **Tenant Portal** (web B2B), dan **Mobile App** (Flutter). Setiap layar memiliki: tujuan, struktur layout, komponen kunci, state yang wajib didesain, interaksi utama, dan prioritas build (P0 = wajib untuk demo/MVP, P1 = penting untuk jual, P2 = penyempurnaan).

Urutan pengerjaan disarankan mengikuti urutan P0 di setiap interface dulu, baru P1, baru P2 — supaya versi demo-able tercapai secepat mungkin.

---

## A. COMMAND CENTER (Web — Operator/Dispatcher)

### A1. Login
**Prioritas: P0**

- **Layout**: Split screen. Kiri — form login (email, password, tombol masuk, link lupa password). Kanan (desktop only) — branding VigilOS + tagline singkat, boleh preview blur dari live map sebagai background.
- **Komponen**: Input email/password, checkbox "ingat saya", tombol submit dengan loading spinner saat proses, pesan error inline (bukan alert popup).
- **State**: default, loading (tombol disabled + spinner), error (kredensial salah — tampil di bawah field, bukan modal), locked (terlalu banyak percobaan gagal).
- **Interaksi**: Enter key submit form. Redirect ke Dashboard sesuai role setelah sukses (Operator → Live Map, Patrol Officer → mobile only jadi tidak relevan di sini).

### A2. Dashboard / Live Map (layar utama)
**Prioritas: P0 — ini adalah wajah produk**

- **Layout**: Full-bleed map sebagai kanvas utama. Header bar tipis di atas (logo, nama tenant aktif, notifikasi bell, avatar user). Sidebar kiri collapsible untuk filter & daftar kendaraan. Panel kanan muncul kontekstual (Vehicle Drawer) saat marker diklik.
- **Komponen kunci**:
  - Peta dark-theme dengan marker kendaraan berbentuk ikon arah (menunjukkan heading), warna sesuai status (hijau=normal, kuning=warning, merah=kritis, abu=offline)
  - Cluster marker otomatis saat zoom out dan kendaraan berdekatan
  - Layer toggle: geofence zone, corridor route, traffic heatmap (on/off per layer)
  - Search bar cepat (cari kendaraan by nomor/kode)
  - Counter ringkas di pojok: total aktif, total warning, total kritis
- **State**:
  - Loading awal (skeleton peta + shimmer di sidebar list, bukan spinner penuh layar)
  - Empty (belum ada kendaraan terdaftar → tampilkan CTA "Tambah kendaraan pertama")
  - Real-time update (marker bergerak smooth, bukan "loncat" — pakai interpolasi posisi)
  - Disconnected (WebSocket putus → banner kuning kecil di atas peta: "Koneksi terputus, mencoba menyambung ulang...")
- **Interaksi**: Klik marker → buka Vehicle Drawer dari kanan. Klik cluster → auto zoom-in. Drag untuk pan, scroll untuk zoom.

### A3. Vehicle Drawer (panel detail kendaraan)
**Prioritas: P0**

- **Layout**: Slide-in panel dari kanan, lebar ~360px, tidak menutupi seluruh peta (peta tetap terlihat & interaktif di baliknya).
- **Komponen**: Header (nomor kendaraan + status badge + tombol close), foto/avatar driver, grid data (kecepatan, heading, jumlah penumpang, status mesin, koordinat), mini-chart kecepatan 10 menit terakhir, tombol aksi (Hubungi kabin, Lihat riwayat rute).
- **State**: loading data driver (skeleton), data GPS stale (>30 detik tanpa update → badge "sinyal terakhir 2 menit lalu").
- **Interaksi**: Tombol "Hubungi kabin" trigger modal konfirmasi sebelum aksi (bukan langsung, untuk hindari misklik saat kondisi darurat sungguhan).

### A4. Emergency Modal
**Prioritas: P0 — fitur penentu jual**

- **Layout**: Overlay penuh layar dengan dim background, modal card di tengah, header merah berkedip pelan (bukan strobing cepat — hindari trigger epilepsi), tidak bisa ditutup dengan klik di luar modal (harus aksi eksplisit).
- **Komponen**: Info kendaraan & lokasi, peta mini lokasi kejadian, 4 tombol aksi besar (Hubungi Kabin, Kirim Patroli, Acknowledge, Resolve), log timestamp setiap aksi yang diambil di bawah tombol.
- **State**: baru masuk (semua tombol aktif, audio alarm menyala), sudah di-acknowledge (badge "ditangani oleh [nama]", alarm berhenti tapi modal tetap ada sampai resolve), resolved (modal auto-close dengan animasi fade, masuk ke incident log).
- **Interaksi**: Resolve wajib isi alasan (textarea, validasi minimal karakter). Multiple emergency bersamaan → stack modal atau list antrian di sisi kanan (jangan modal bertumpuk saling menutupi).

### A5. Route Deviation Modal
**Prioritas: P1**

- **Layout**: Mirip Emergency Modal tapi non-blocking untuk state Warning (toast di pojok), baru jadi modal wajib saat State Critical (>500m dari corridor).
- **Komponen**: Peta menunjukkan rute seharusnya (garis putus-putus) vs posisi aktual (garis solid merah), field alasan resolusi wajib diisi.
- **State**: warning (toast, auto-dismiss 8 detik atau klik untuk detail), critical (modal wajib, tidak auto-dismiss).

### A6. Incident Logs
**Prioritas: P1**

- **Layout**: Tabel full-width dengan filter bar di atas (rentang tanggal, tipe insiden, status, tenant jika multi-tenant view).
- **Komponen**: Kolom: waktu, kendaraan, tipe, severity badge, status, durasi respons, aksi (lihat detail). Pagination di bawah, export button (CSV/PDF) di kanan atas.
- **State**: empty (belum ada insiden — ini state yang bagus, tampilkan pesan positif bukan generic "no data"), loading (skeleton rows).
- **Interaksi**: Klik baris → buka detail insiden read-only (timeline lengkap dari trigger sampai resolve).

### A7. Fleet Admin — tab Vehicles
**Prioritas: P0 (untuk onboarding demo)**

- **Layout**: Tabel dengan tombol "Tambah kendaraan" di kanan atas, search & filter di atas tabel.
- **Komponen**: Form tambah/edit kendaraan (kode, nama, tipe, speed limit, assign driver, assign device token), status toggle aktif/nonaktif.
- **State**: form validation inline (bukan alert setelah submit gagal).

### A8. Fleet Admin — tab Drivers
**Prioritas: P1**

- Sama pola dengan Vehicles: tabel + form tambah/edit (nama, nomor lisensi, assign ke kendaraan, safety score ditampilkan sebagai badge warna).

### A9. Fleet Admin — tab Device Tokens & Security Audit
**Prioritas: P0 (krusial untuk provisioning device)**

- **Layout**: Dua sub-section — list token aktif (tabel) dan security event log (tabel terpisah, bisa collapse).
- **Komponen**: Tombol "Generate token baru" → modal tampilkan token sekali saja dengan warning "salin sekarang, tidak akan ditampilkan lagi" + tombol copy. Tombol revoke/rotate per token dengan konfirmasi.
- **State**: token baru digenerate (highlight row dengan warna berbeda selama beberapa detik agar mudah ditemukan), token revoked (row abu-abu, strikethrough).

### A10. Traffic Analytics
**Prioritas: P2**

- **Layout**: Grid KPI card di atas (4 kolom), chart di bawah (bar chart per rute/jam), heatmap kepadatan sebagai layer opsional di peta terpisah.
- Ini bisa dikerjakan belakangan — bagus untuk kesan "data-driven" saat demo tapi tidak blocking operasional inti.

---

## B. TENANT PORTAL (Web — Admin B2B)

### B1. Dashboard Tenant
**Prioritas: P0**

- **Layout**: Grid KPI card (jumlah kendaraan, user, insiden bulan ini, device token aktif, sisa kuota subscription) + ringkasan status subscription di kartu terpisah menonjol.
- **Komponen**: Progress bar untuk kuota device (misal "45/100 device terpakai"), badge status subscription (Active/Trial/Expired).
- **State**: mendekati limit kuota → warna kartu berubah kuning dengan CTA upgrade.

### B2. Team Management
**Prioritas: P1**

- **Layout**: Tabel user dengan role badge, tombol invite di kanan atas.
- **Komponen**: Modal invite (email + pilih role dari dropdown RBAC), aksi suspend/activate per baris dengan konfirmasi.

### B3. Subscription & Billing
**Prioritas: P1 (krusial kalau mau demo model bisnis ke calon klien)**

- **Layout**: Card 3 tier (Basic/Pro/Enterprise) side-by-side dengan highlight pada tier aktif, riwayat invoice sebagai tabel di bawah.
- **Komponen**: Tombol upgrade/downgrade dengan modal konfirmasi perubahan (tampilkan selisih biaya), invoice bisa didownload PDF.

### B4. SLA & Compliance
**Prioritas: P2**

- **Layout**: Viewer dokumen SLA (embed PDF atau render terstruktur), metrik uptime aktual vs guaranteed ditampilkan sebagai gauge/progress.

### B5. API Keys
**Prioritas: P2**

- **Layout**: Tabel key dengan permission badge, tombol generate baru (sama pola dengan Device Token — tampil sekali saja).

---

## C. MOBILE APP (Flutter)

### C1. Splash & Role Selection
**Prioritas: P0**

- **Layout**: Logo center, auto-redirect ke login setelah 1-2 detik. Jika app dipakai multi-role dalam satu build, tampilkan pilihan role setelah login berhasil (server yang tentukan role sebenarnya, UI hanya menyesuaikan tampilan).

### C2. Publik — Live Map & ETA
**Prioritas: P0**

- **Layout**: Peta sebagai layar utama (mirip Command Center tapi disederhanakan), bottom sheet berisi daftar halte terdekat dengan ETA.
- **Komponen**: Search rute/halte, card ETA per halte (waktu estimasi, jarak bus terdekat), floating action button merah untuk tombol panik (selalu terlihat, tidak tersembunyi di menu).
- **State**: lokasi user belum diizinkan (prompt permission dengan penjelasan kenapa dibutuhkan), bus belum ada di rute (empty state ramah, bukan generic error).

### C3. Publik — Route Planner
**Prioritas: P1**

- **Layout**: Form input asal-tujuan di atas, hasil rute sebagai list card di bawah (opsi rute + estimasi waktu).

### C4. Publik — Panic Button Flow
**Prioritas: P0 — sama pentingnya dengan Emergency Modal di Command Center**

- **Layout**: Konfirmasi 2 tahap (tekan lalu tahan 3 detik, atau tekan + konfirmasi) untuk hindari misklik, lalu layar status "Bantuan sedang menuju lokasi Anda" dengan nomor kontak darurat yang bisa langsung ditelepon.
- **State**: mengirim (loading), terkirim (konfirmasi visual jelas — ini momen kepercayaan pengguna, harus terasa meyakinkan bukan ambigu), gagal kirim (retry otomatis + fallback nomor telepon manual).

### C5. Patroli — Duty Status & Dashboard
**Prioritas: P0**

- **Layout**: Toggle besar di atas (On Duty/Off Duty), daftar alert masuk di bawah sebagai card dengan severity badge.
- **Komponen**: Push notification masuk harus buka langsung ke detail alert (deep link), bukan cuma banner.

### C6. Patroli — Dispatch Detail & Navigasi
**Prioritas: P0**

- **Layout**: Detail insiden di atas (foto lokasi jika ada, info kendaraan), tombol "Mulai Navigasi" yang membuka Google Maps langsung dengan koordinat terisi otomatis.

### C7. Patroli — Field Report Form
**Prioritas: P1**

- **Layout**: Form terstruktur (bukan textarea bebas semua) — dropdown jenis kejadian, field catatan, upload foto opsional, tombol submit.
- **State**: submit saat offline → simpan draft lokal, auto-sync saat online kembali (penting karena patroli sering di area sinyal lemah).

### C8. Operator & Admin Dashboard (ringkas)
**Prioritas: P2**

- Versi mobile ringan dari Command Center untuk monitoring cepat saat tidak di depan komputer — cukup live map + notifikasi, tidak perlu semua fitur desktop.

---

## Catatan lintas-layar (berlaku untuk semua interface)

- **Konsistensi warna status** wajib: hijau/kuning/merah/abu harus sama persis nilainya (hex code) di ketiga interface.
- **Setiap tabel** butuh 3 state minimal: loading (skeleton), empty (dengan CTA relevan), dan filled.
- **Setiap aksi destruktif** (revoke, delete, suspend) wajib modal konfirmasi — tidak ada aksi permanen 1-klik.
- **Setiap form** validasi inline real-time, bukan baru muncul error setelah submit.
- **Setiap layar yang bisa diakses saat demo ke klien** (Login, Live Map, Emergency Modal, Fleet Admin, Dashboard Tenant, Subscription) masuk P0 — ini prioritas mutlak sebelum fitur lain.

## Urutan build yang disarankan

1. Login (semua interface) → Live Map → Vehicle Drawer → Fleet Admin (Vehicles + Device Tokens)
2. Emergency Modal (Command Center) + Panic Button Flow (Mobile) — pasangan ini harus selesai bersamaan karena saling terhubung
3. Dispatch ke Patrol Officer (mobile) — melengkapi loop emergency end-to-end
4. Dashboard Tenant + Subscription & Billing (Tenant Portal) — supaya sisi B2B bisa didemo
5. Incident Logs, Route Deviation, Team Management — pelengkap operasional
6. Traffic Analytics, SLA & Compliance, API Keys — penyempurnaan (P2)
