# Product Requirements Document (PRD)
## VigilOS Enterprise Backend & IoT Data Pipeline Module

---

## 1. Document Overview
* **Product Name:** VigilOS (Enterprise Fleet & Smart City Operations Platform)
* **Module:** Backend, IoT Ingestion, & Real-Time Processing
* **Document Version:** 1.0.0
* **Target Audience:** Backend Engineers, IoT Engineers, DevOps, System Architects

---

## 2. Architecture & Core Objectives
The VigilOS backend is engineered to handle high-frequency telemetry data streams from thousands of IoT-enabled public transport vehicles simultaneously. It guarantees sub-second event propagation for emergency overrides (Panic Buttons) and provides robust analytical capabilities for traffic and fleet evaluation.

---

## 3. IoT Edge & Ingestion Specifications
* **Communication Protocol:** MQTT (Message Queuing Telemetry Transport) over 4G LTE.
* **Payload Topics:**
  * Telemetry: `fleet/{device_id}/telemetry` (Default interval: 10 seconds in normal operation, dynamic adaptive rate based on speed anomalies).
  * Emergency: `fleet/{device_id}/emergency` (Instantaneous trigger).
* **Message Broker:** EMQX / Mosquitto cluster handling high concurrent connections.

---

## 4. Real-Time Processing & Anomaly Detection (Speed Evaluation)
To evaluate operational safety and flag risky driving behavior or data anomalies:
* **Speed Threshold Monitoring:** The stream processing engine continuously compares incoming vehicle speeds against predefined corridor limits or anomalous velocity spikes.
* **Dynamic Heartbeat Adjustment:** If a vehicle records speeds exceeding safe thresholds or exhibits erratic movement patterns, the backend dynamically publishes a control command to increase telemetry frequency for deeper evaluation.
* **Stream Processor:** Node.js / Apache Kafka stream consumer managing real-time data filtering, aggregation, and emergency event routing.

---

## 5. Data Persistence Strategy
* **Time-Series Database (InfluxDB):** Stores high-volume telemetry logs, historical coordinates, speeds, and timestamps for route playback and speed evaluations.
* **Relational Database (PostgreSQL + PostGIS):** Manages multi-tenant workspace data, user RBAC configurations, vehicle master registries, and audit trails.

---

## 6. API Gateway & External Integrations
* **Central API Gateway:** RESTful endpoints built with Express/NestJS for frontend dashboard communication and administrative controls.
* **External Notification Gateway:** Integrates with Firebase Cloud Messaging (FCM/APNS) for mobile push alerts to security officers.
* **Webhook & Third-Party Integration:** Secure webhooks allowing external smart city authorities (e.g., police or municipal emergency services) to consume emergency data streams.
