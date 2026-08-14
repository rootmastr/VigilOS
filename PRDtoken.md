# Product Requirements Document (PRD)
## VigilOS Enterprise Device Token & Authentication Module

---

## 1. Document Overview
* **Product Name:** VigilOS (Enterprise Fleet & Smart City Operations Platform)
* **Module:** Device Token Management & ESP8266/ESP32 Authentication
* **Document Version:** 1.0.0
* **Target Audience:** IoT Engineers, Backend Developers, Firmware Engineers, Security Auditors

---

## 2. Objective & Scope
The Device Token Authentication Module ensures secure, cryptographically isolated communication between hardware edge devices (such as ESP8266/ESP32 GPS trackers) and the VigilOS backend. This module prevents device spoofing, unauthorized data ingestion, and ensures that every telemetry packet or emergency signal can be accurately traced to an authorized enterprise tenant and vehicle.

---

## 3. Technical Specifications & Workflow

### 3.1. Provisioning & Lifecycle
* **Generation:** Super Admins or Fleet Managers generate unique, secure random tokens (32-character alphanumeric strings) via the VigilOS Enterprise Dashboard.
* **Binding:** Each token is permanently bound to a specific `device_id` and assigned to a specific multi-tenant workspace within the PostgreSQL database.
* **Revocation & Rotation:** Administrators can revoke or rotate tokens instantly via the backend dashboard if a hardware unit is compromised or replaced.

### 3.2. Edge Firmware Implementation (ESP8266/ESP32)
* **Non-Volatile Storage:** Device tokens are stored locally on the microcontroller using **LittleFS** or **EEPROM** (`/token.txt`) to persist across reboots and power cycles.
* **Authentication Header / Payload:** 
  * For HTTP REST requests, the token is transmitted via custom header: `X-Device-Token: <token_string>`.
  * For MQTT connections, the token is utilized within client authentication parameters or topic ACLs.

### 3.3. Backend Validation & Security Middleware
* **Middleware Interception:** An API Gateway middleware intercepts incoming telemetry requests to verify the presence and validity of the `X-Device-Token`.
* **Access Control:** If the token is missing or invalid, the backend immediately responds with HTTP `401 Unauthorized` or `403 Forbidden`, dropping the payload before it reaches stream processing or database storage.

---

## 4. Acceptance Criteria
* [ ] Hardware microcontrollers successfully load tokens from local storage (`LittleFS`) upon booting.
* [ ] Telemetry packets containing valid device tokens successfully pass backend verification and update the time-series database.
* [ ] Packets with missing, expired, or invalid tokens are rejected with a 401/403 status code and logged as security events.
* [ ] Administrators can successfully generate, view, and revoke device tokens from the management portal.
