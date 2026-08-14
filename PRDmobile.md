# Product Requirements Document (PRD)
## VigilOS Enterprise Mobile App (Flutter - Public User & Security Officer)

---

## 1. Document Overview
* **Product Name:** VigilOS (Enterprise Fleet & Smart City Operations Platform)
* **Module:** Cross-Platform Mobile Application (Flutter - Android & iOS)
* **Document Version:** 1.0.0
* **Target Audience:** Mobile Engineers, Flutter Developers, UI/UX Designers, Product Managers

---

## 2. Objective & Scope
The VigilOS Mobile App extends the enterprise command center into a portable, responsive ecosystem. It serves two distinct user roles:
1. **Public Users:** Citizens who track public transport live [cite: 1], check ETAs [cite: 1], plan routes [cite: 1], and trigger personal safety alerts [cite: 1].
2. **Security & Patrol Officers:** Field personnel who receive high-priority emergency notifications, navigate rapidly to incident scenes, manage duty status [cite: 1], and file field reports [cite: 1].

---

## 3. Key Features & Functional Requirements

### 3.1. Public User Module
* **Live Transit Map & ETA:** Interactive map displaying real-time public transport positions and accurate Estimated Time of Arrival (ETA) at selected stations [cite: 1].
* **Route Planner:** Point-to-point journey planner recommending public transport corridors and schedules [cite: 1].
* **In-App Panic Button:** Emergency button allowing passengers inside vehicles to report harassment, robberies, or accidents by identifying the active bus (via QR scan or Bluetooth/NFC detection) [cite: 1].

### 3.2. Security & Patrol Officer Module
* **High-Priority Push Notifications (FCM):** Instantaneous alerts utilizing Firebase Cloud Messaging (FCM) that trigger custom audio alarms and heavy device haptics when an emergency is reported [cite: 1].
* **Turn-by-Turn Navigation:** One-tap action on emergency prompts to launch native turn-by-turn routing towards the incident coordinates [cite: 1].
* **Duty Status Management:** Toggle options (`Available`, `On Duty`, `Busy`, `Off Duty`) to synchronize field availability with the Command Center [cite: 1].
* **Mobile Incident Reporting:** Quick form interface allowing officers to capture photographic evidence, add notes, and resolve emergency tickets [cite: 1].

---

## 4. UI/UX & Design Guidelines (Flutter Framework)
* **Framework:** Flutter (Cross-platform compatibility for Android and iOS).
* **Color System:** Dark mode optimized for field officers (Deep Navy `#0f172a`, Electric Blue `#3b82f6` [cite: 1], Danger Red `#ef4444` for emergencies [cite: 1], and Emerald Green `#10b981` for normal status [cite: 1]).
* **Ergonomics:** Large touch targets (minimum 48x48 dp) for effortless operation in high-stress field conditions.

---

## 5. Acceptance Criteria
* [ ] App successfully compiles and runs on both Android and iOS devices using Flutter.
* [ ] Push notifications trigger high-priority alerts with audio and haptic feedback within < 1 second of an incident.
* [ ] Officers can update duty status and have it reflected instantly in the Command Center backend.
* [ ] Public users can view live vehicle positions and calculate route ETAs smoothly without frame drops.
