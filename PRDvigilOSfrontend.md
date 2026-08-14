# Product Requirements Document (PRD)
## VigilOS Enterprise Command Center - Frontend UI/UX Module

---

## 1. Document Overview
* **Product Name:** VigilOS (Enterprise Fleet & Smart City Operations Platform)
* **Module:** Command Center Frontend (UI/UX)
* **Document Version:** 1.0.0
* **Target Audience:** Frontend Engineers, UI/UX Designers, Product Managers, QA Engineers

---

## 2. Product Vision & Objective
VigilOS Frontend is a mission-critical, real-time monitoring dashboard designed for Smart City operations and public transport safety. The primary objective of the frontend is to provide 24/7 situational awareness to command center operators, enabling sub-second response times to emergency alerts (Panic Buttons) and comprehensive tracking of public transport fleets and traffic anomalies.

---

## 3. Design Philosophy & Aesthetic Guidelines
* **Theme:** Dark Mode by Default ("Midnight Commander" palette) to minimize operator eye strain during 24/7 shifts.
* **Color System:**
  * **Backgrounds:** Slate / Deep Navy (`#090d16`, `#0f172a`, `#1e293b`)
  * **Primary Brand / Tech Accent:** Electric Blue (`#3b82f6` / `#2563eb`)
  * **Status Normal / Active:** Emerald Green (`#10b981`)
  * **Critical / Emergency Alert:** Danger Red (`#ef4444` / `#991b1b`)
* **Typography & Hierarchy:** Clean sans-serif font family optimized for dense data tables, rapid scanning, and clear visual separation between operational data and critical alerts.

---

## 4. User Personas
1. **Command Center Operator:** Monitors live fleet maps 24/7, responds immediately to incoming emergency pop-ups, and coordinates dispatch units.
2. **Fleet Supervisor / Fleet Manager:** Analyzes historical traffic heatmaps, driver safety scores, and overall corridor efficiency.
3. **System Administrator:** Configures multi-tenant workspace settings, RBAC permissions, and system integration parameters.

---

## 5. Functional Requirements & Core Features

### 5.1. Global Layout & Navigation
* **Sidebar Navigation:** Fixed left-hand navigation panel containing quick links:
  * `Live Map` (Main Command View)
  * `Traffic Analytics` (Heatmaps & Bottlenecks)
  * `Incident Logs` (Audit Trail & Emergency Archives)
  * `Fleet Admin` (Device & Driver Management)
* **Top Header Bar:** Displays system security status (`SYSTEM SECURE`), active operator count, total active units counter, multi-tenant workspace badge, and user profile drawer.

### 5.2. Interactive Live Map Module
* **Map Engine:** Leaflet.js / Mapbox GL JS integrated with custom dark-mode vector tile layers.
* **Marker Clustering:** Automatic grouping of dense vehicle markers when zooming out to maintain 60 FPS rendering performance.
* **Vehicle Status Indicators:** Color-coded icons (Green for normal operation, Blue for idle/transit, Red for emergency override).
* **Sliding Drawer / Info Card:** Clicking any vehicle marker opens a side drawer displaying real-time telemetry (speed, heading, passenger count, engine status, driver info).

### 5.3. Emergency Alert & Panic Button Handler (Critical Module)
* **Real-time Trigger:** Listens to WebSocket events (`emergency_alert`).
* **Visual & Audio Alarm:** Upon receiving an alert, triggers an automated high-priority web audio chime and forces a prominent, glowing Red **Emergency Alert Modal** to appear over the map view.
* **Actionable Interactivity (One-Click Triggers):**
  * `Call Cabin`: Establishes direct audio link or intercom with the vehicle.
  * `Dispatch Patrol Unit`: Sends immediate coordinates to the nearest security officer mobile app.
  * `Acknowledge Incident`: Marks the alert as acknowledged by the current operator, logging timestamp and operator ID.
  * `Resolve Incident`: Closes the emergency ticket once verified safe.

---

## 6. Non-Functional Requirements
* **Performance:** Sub-second UI state updates upon receiving WebSocket packets; map rendering must maintain smooth panning and zooming under 300+ concurrent active units.
* **Responsiveness:** Optimized for multi-monitor widescreen command center setups (minimum resolution supported: 1920x1080).
* **Reliability:** Automatic WebSocket reconnection logic with exponential backoff and connection status indicator.

---

## 7. Acceptance Criteria
* [ ] Layout successfully renders in 24/7 dark mode with designated color contrast ratios meeting accessibility guidelines.
* [ ] Incoming WebSocket telemetry updates vehicle positions on the map without full-page reloads.
* [ ] Panic button simulation successfully triggers the audio alarm and modal overlay within < 200ms.
* [ ] Action buttons inside the emergency modal successfully dispatch API requests and update incident state.
