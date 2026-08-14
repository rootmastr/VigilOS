# Product Requirements Document (PRD)
## VigilOS Enterprise Redis Caching & State Management Module

---

## 1. Document Overview
* **Product Name:** VigilOS (Enterprise Fleet & Smart City Operations Platform)
* **Module:** Redis In-Memory Caching, Token Verification, & Real-Time State Management
* **Document Version:** 1.0.0
* **Target Audience:** Backend Engineers, System Architects, DevOps Engineers, Performance Optimization Leads

---

## 2. Objective & Scope
The Redis Caching Module integrates an in-memory data store into the VigilOS backend architecture to optimize performance, eliminate database bottlenecks, and manage high-frequency IoT telemetry streams. This module handles device token validation caching, online/offline presence tracking (*heartbeats*), latest state caching, and API rate-limiting for thousands of concurrent ESP8266/ESP32 hardware units.

---

## 3. Technical Requirements & Core Features

### 3.1. High-Performance Device Token Caching
* **Problem Addressed:** Eliminates heavy PostgreSQL queries on every telemetry packet or emergency signal sent by hardware devices.
* **Mechanism:** Upon device provisioning or system boot, active device tokens are cached in Redis (`device:token:{token_string} -> device_id`). 
* **Validation Flow:** The backend API middleware validates incoming `X-Device-Token` against Redis in-memory lookup, reducing validation latency to sub-milliseconds. Fallback to PostgreSQL occurs only on cache miss.

### 3.2. Real-Time Device Presence & Heartbeat Tracking
* **Problem Addressed:** Detecting whether a public transport vehicle is actively connected or offline in the Command Center map view.
* **Mechanism:** Every time an ESP8266 transmits telemetry, Redis updates a TTL (Time-To-Live) key (`device:presence:{device_id}`) set to 30 seconds.
* **Expiration Handling:** If a vehicle enters a tunnel or loses connectivity and stops transmitting, the Redis key automatically expires, triggering an event to update the frontend map marker status to *Offline*.

### 3.3. Latest Telemetry State Caching
* **Problem Addressed:** Preventing heavy read loads on the Time-Series Database (InfluxDB) when rendering initial vehicle coordinates on dashboard load.
* **Mechanism:** The latest coordinate, speed, and status payload of each vehicle is stored in a Redis Hash (`device:state:{device_id}`).
* **Usage:** When an operator opens the Command Center dashboard, the frontend fetches the initial state of all units directly from Redis for instant rendering.

### 3.4. API Rate Limiting & Abuse Protection
* **Problem Addressed:** Protecting backend services from DDoS, looping firmware bugs, or data spamming from compromised hardware.
* **Mechanism:** Redis-backed sliding window rate limiter restricts each `device_id` to a maximum allowed packet frequency (e.g., max 20 requests per minute during normal operations, excluding emergency overrides).

---

## 4. Acceptance Criteria
* [ ] Device token validation requests are served from Redis cache with response times under 2 milliseconds.
* [ ] Vehicle presence status automatically switches to *Offline* in the dashboard when telemetry stops for longer than the configured TTL threshold.
* [ ] Initial dashboard load fetches active vehicle positions from Redis state cache without querying InfluxDB.
* [ ] Malfunctioning hardware exceeding the maximum rate limit is temporarily throttled, and events are logged to the audit trail.
