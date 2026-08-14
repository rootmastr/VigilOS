# Product Requirements Document (PRD)
## VigilOS Mobile Fleet & Smart City Operations Platform (PRDmobile2)

---

## 1. Document Overview
* **Product Name:** VigilOS Mobile Operations Platform
* **Document Version:** 1.0.0
* **Target Audience:** UI/UX Designers, Frontend/Mobile Developers, QA Engineers, Product Managers

---

## 2. Introduction
VigilOS Mobile is a portable extension of the enterprise command center, providing real-time situational awareness and emergency response capabilities. It offers two distinct user personas through separate applications: the Public User App and the Security Officer App. This document outlines the requirements and user interface details for both, specifically during an active emergency (Panic Button event) as shown in the visual reference.

---

## 3. User Personas

### 3.1. Public User
* **Goal:** Monitor public transport status, corridors, and receive real-time updates on active public safety emergencies.
* **Key Tasks:** View bus locations, track corridors, plan routes, check ETAs, and receive/act upon active panic alerts.

### 3.2. Security Officer / Command Center Operator
* **Goal:** Actively monitor fleet security status, acknowledge incoming incidents, dispatch units, and manage critical communications.
* **Key Tasks:** View complete fleet map, detect flashing emergency units, acknowledge panic events, call vehicle cabins, and dispatch patrol units.

---

## 4. Design Guidelines (General UI/UX)
* **Theme:** Optimized Dark Mode ("Midnight Commander") by default for 24/7 ergonomics, minimizing operator eye strain.
* **Palette:** Base: Slate/Deep Navy (`#090d16`, `#0f172a`, `#1e293b`). Accents: Electric Blue (`#3b82f6`) for actions, Emerald Green (`#10b981`) for normal status, Danger Red (`#ef4444`, pulsating) for emergencies, Warning Yellow (`#facc15`) for pending.
* **Typography:** Clean sans-serif optimized for dense data and clear separation of normal vs. critical alerts.
* **Multi-Tenancy:** Each app displays the assigned tenant (e.g., Dishub Kota Enterprise).

---

## 5. UI/UX Details & Feature Requirements

### 5.1. Public User App (Left Display)

#### 5.1.1. UI/UX Specifications
* **Color Scheme:** Optimized Dark Mode.
* **Header Bar (1):**
  * VigilOS Logo and "FLEET" identifier.
  * Flashing red "Panic Button Active" header over current corridor info.
  * Corridor: "Koridor 1 - Trans Jakarta" with route icon.
  * Status: "ETA: 3 Mins to Simpang X" with emerald pulse.
  * Notification Bell Icon, Profile Avatar Icon.
* **Interactive Map Module (2):**
  * Library: Leaflet.js / Mapbox GL JS custom dark tile layers.
  * Markers:
    * Bus normal: Small bus icon labeled `(Bus-01)` 🟢.
    * Bus panic: Large pulsating red shield shieldLabeled `🚨 [PANIC] (Bus-042)` with flashing halo.
  * Route: Blue route polyline with bus route icons. Labeled "Koridor 1".
  * Intersection: "Simpang X" labeled pin marker.
* **Emergency Override Modal (3):**
  * Appears automatically on emergency event trigger.
  * Visual: Flashing danger red header.
  * Header: "DARURAT TERDETEKSI!" with ShieldAlert icon.
  * Subtitle: "Panic Button diaktifkan oleh unit".
  * Incident Details: ID Kendaraan: BUS-042 (Flashing), Koordinat, Waktu Trigger.
  * Action Buttons (One-Click):
    * `Call Cabin`: Yellow button, establishes direct audio intercom.
    * `Dispatch Patrol Unit`: Blue button, sends coordinates to mobile patrol app.
    * `Close / Selesaikan`: Slate button, acknowledges/closes incident.
* **Bottom Navigation Bar (4):**
  * Fixed: Home (Active), Route, Incident Logs.
  * Tenant Info: "Tenant: Dishub Kota Enterprise".

#### 5.1.2. Feature Requirements
*   [ ] **Real-time Map Update:** Listens to WebSocket/MQTT `fleet_update` and `emergency_alert` events to refresh marker positions and status.
*   [ ] **Multi-Monitor Display support:** Designed to scale across multiple widescreens or tablet interfaces.
*   [ ] **In-App Emergency Override:** Forces the critical modal alert to the forefront upon `emergency_alert` detection, accompanying with visual flashing and an operational chime/alarm.
*   [ ] **Action Trigger Logs:** Every action in the emergency modal (Call, Dispatch, Close) is timestamped and logged.

---

### 5.2. Security Officer App (Right Display)

#### 5.2.1. UI/UX Specifications
* **Color Scheme:** Midnight Dark Mode, high contrast for night use.
* **Header Bar (1):**
  * VigilOS Logo and "FLEET" identifier.
  * Search Icon, Notification Badge/Settings Gear Icons.
* **Main Fleet Map Module (2):**
  * Comprehensive fleet view.
  * Library: Leaflet.js / Mapbox GL JS custom dark tile layers.
  * Markers:
    * Bus normal: Small bus icon.
    * Bus panic: Large pulsating red shield shieldLabeled `🚨 [PANIC] (Bus-042)` with flashing halo.
    * Route indicator (bus chain icon).
    * Station marker: Custom labeled "Google Maps Style" pin marker.
  * Routes: Blue route polyline with route icons. Labeled "Koridor 1" and "Koridor 2".
* **Incident Summary Modal (3):**
  * Automatic priority overlay.
  * Visual: Bold danger red header.
  * Header: "Panic Button Active" with ShieldAlert icon.
  * Vehicle ID: BUS-042 (Pulsating Red).
  * Details: Koridor 1 (Trans Jakarta), ETA: 3 Mins to Simpang X.
  * Pulsating/Active Acknowledge indicator (Red bell icon). Note: While the image has an 'Acknowledge' pulsating alert, it primarily shows Call Cabin and Dispatch. The PRD includes 'Acknowledge' functionality prior to specific actions.
  * Action Buttons (One-Click):
    * `Call Cabin`: Yellow button, direct audio link.
    * `Dispatch Patrol Unit`: Blue button, triggers patrol unit dispatch workflow.
* **Bottom Navigation Bar (4):**
  * Fixed: Home (Active), Incidents, Profile.
  * Status: 🟢 "System Status: SECURE".
  * Tenant Info: "Tenant: Dishub Kota Enterprise".

#### 5.2.2. Feature Requirements
*   [ ] **Acknowledge Workflow:** Operator *must* actively acknowledge a panic event via the incident summary modal to stop the visual/audio alarm.
*   [ ] **Command Center Audio integration:** Web audio chiming/operational chime/alarm triggers upon emergency.
*   [ ] **Flashing Detection:** The `emergency_alert` marker is rendered with a pulsating CSS halo to ensure immediate operator visibility.
*   [ ] **Operational Logging:** Mandatory log of acknowledgement times and action dispatches.

---

## 6. Technical Specifications (Summary)
*   **Protocol:** MQTT / WebSocket (Socket.io) for event propagation.
*   **Database:** Time-Series (InfluxDB) for history, Relational (PostgreSQL) for master/tenant data.
*   **Mobile SDK:** Flutter / React Native (optimized for multiple widescreens / dark mode).
*   **Authentication:** Multi-tenant SSO / RBAC.
*   **Performance:** Sub-second latencies for emergency propagation and state rendering.
