# Product Requirements Document (PRD)
## VigilOS Enterprise B2B SaaS - Frontend UI/UX Module (PRDfrontend2)

---

## 1. Document Overview
* **Product Name:** VigilOS Enterprise Fleet Management SaaS
* **Module:** Web Command Center Dashboard (Frontend)
* **Document Version:** 2.0.0 (Sidebar & Route Deviation Update)
* **Target Audience:** Frontend Developers (React/Vite), UI/UX Designers, Product Managers

---

## 2. Architecture & Tech Stack
* **Framework:** React.js powered by Vite for rapid HMR and optimized builds.
* **Styling:** TailwindCSS with a custom configuration.
* **Map Engine:** Leaflet.js or React-Leaflet integrating **OpenStreetMap** tile layers.
* **State Management:** Zustand or Redux Toolkit for handling real-time WebSocket payloads and tenant states.

---

## 3. UI/UX Design System & Layout
* **Global Layout:** The layout transitions to a **Left Sidebar Navigation** model to maximize vertical screen real estate for the map canvas and accommodate future scalable modules.
* **Aesthetics:** The system employs an Enterprise Dark Mode ("Midnight Commander") palette. To maintain a sharp, industrial, and highly professional look, the UI incorporates subtle **pixel-themed** design elements (e.g., sharp borders, crisp non-anti-aliased icon edges, and terminal-like monospaced fonts for critical data logs).
* **Color Palette:**
  * Backgrounds: Deep Slate (`#0f172a`), Surface (`#1e293b`).
  * Accents: Brand Blue (`#3b82f6`), Emerald Safe (`#10b981`), Warning Yellow (`#facc15`), Critical Red (`#ef4444`).

---

## 4. Core Components & Features

### 4.1. Collapsible Left Sidebar (Navigation)
* **Behavior:** Fixed to the left, collapsible to icon-only mode to expand the map view.
* **Menu Structure:**
  * `Dashboard` (High-level metrics)
  * `Live Tracking` (Active Map View)
  * `Incidents & Alerts` (Panic Buttons, Deviations)
  * `Fleet & Driver Management`
  * `Reports & Audit (AI Generated)`
  * `Tenant Settings`

### 4.2. Top Navigation Bar (Context & Global Actions)
* **Tenant Switcher:** A dropdown allowing Super Admins to seamlessly switch between isolated B2B client workspaces (e.g., "PT Logistik A" to "Dishub Kota B").
* **Global Status:** A pill indicator showing overall system health and connection status.

### 4.3. Interactive OpenStreetMap Canvas
* **Full-Height Display:** Occupies the remaining viewport space right of the sidebar.
* **Geofence Rendering:** Renders operational zones as semi-transparent blue polygons.
* **Corridor Buffers:** Visualizes assigned routes with a designated tolerance radius (e.g., 500m buffer zone).
* **Dynamic Markers:** Vehicle icons that change color and state based on real-time Redis/WebSocket updates (Green = Normal, Yellow = Warning, Red Pulsating = Critical).

### 4.4. Route Deviation & Alert UI Workflow
* **State 1 - Normal:** Vehicle moves within the route buffer. No UI interruption.
* **State 2 - Warning:** Vehicle nears the buffer edge. A non-intrusive toast notification appears in the bottom right corner.
* **State 3 - Critical (Out-of-Zone):**
  * **Trigger:** Vehicle exceeds the 500m deviation threshold.
  * **Action:** A high-priority Modal Overlay appears dead center with a dark backdrop, dimming the rest of the application.
  * **Mandatory Input:** The operator is presented with action buttons (`Call Cabin`, `Push Notification`). The `Resolve Incident` button remains disabled until the operator inputs a resolution reason in the required text area, ensuring strict audit compliance.

---

## 5. Acceptance Criteria
* [ ] The left sidebar smoothly collapses and expands without triggering map rendering lag.
* [ ] OpenStreetMap tiles load correctly with custom dark-themed styling.
* [ ] Route deviation events instantly trigger the Critical Modal overlay via WebSocket.
* [ ] Operators cannot close a Route Deviation alert without submitting a text-based audit log.
