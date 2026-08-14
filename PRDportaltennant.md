# Product Requirements Document (PRD)
## VigilOS Client Portal & Tenant Management (PRDportaltennant)

---

## 1. Document Overview
* **Product Name:** VigilOS Enterprise Fleet Management SaaS
* **Module:** Client Portal (Phase 3) - Tenant, Billing, & Identity Management
* **Document Version:** 1.0.0
* **Target Audience:** Backend/Frontend Engineers, Database Administrators, Product Managers

---

## 2. Objective
To build a dedicated, isolated B2B Client Portal (`portal.vigilos.io`) that handles commercial operations, tenant onboarding, subscription billing, and strict Role-Based Access Control (RBAC). This ensures operational telemetry traffic (Phase 2) remains unencumbered by administrative tasks, while providing enterprise clients with a self-service management gateway.

---

## 3. Authentication & Security (Login System)
* **JWT & Session Management:** Utilizes short-lived Access Tokens (15 min) and HTTP-Only Refresh Tokens (7 days).
* **Enterprise SSO:** Supports SAML 2.0 and OAuth2 (Google Workspace, Microsoft Entra ID) for corporate identity integration.
* **MFA (Multi-Factor Authentication):** Mandatory TOTP or Email OTP for all accounts holding administrative or financial privileges.
* **Audit Logging:** Every login attempt, password reset, and session invalidation is logged with IP, User-Agent, and timestamp.

---

## 4. Role-Based Access Control (RBAC) Architecture
Strict separation of duties enforced at the middleware layer.
* **Super Admin:** Internal VigilOS staff. Global access across all tenants.
* **Tenant Admin:** Client owner. Full access to billing, team management, and API settings.
* **Tenant Finance:** Read/write access restricted to invoices, billing methods, and usage quotas.
* **Tenant Dispatcher:** No portal access; automatic redirect to the Command Center (Phase 2).
* **Tenant Auditor:** Read-only access to SLA documents, audit logs, and auto-generated compliance reports.

---

## 5. Core Portal Modules

### 5.1. Tenant Onboarding & Team Management
* **Self-Service Signup:** Automated provisioning of isolated PostgreSQL workspaces and Tenant IDs.
* **Invite System:** Tenant Admins can dispatch secure, time-limited invite links to corporate emails.
* **Instant Revocation:** One-click account suspension that instantly invalidates active JWT sessions.

### 5.2. Billing & Subscriptions
* **Tiered Plans:** Logic for Basic (No Geofence), Pro (Geofence + Deviation Alerts), and Enterprise (API + Webhooks).
* **Payment Gateway:** Integration for recurring billing via Credit Card or Virtual Account.
* **Automated Invoicing:** System calculates active device tokens and generates monthly invoices.

### 5.3. Legal, Compliance & Local AI Automation
* **SLA Dashboard:** Interface to review and accept Service Level Agreements.
* **AI Document Automation:** Utilizes local AI to generate, edit, and format monthly HTML compliance and fleet performance reports automatically based on telemetry logs.

---

## 6. Database Schema (PostgreSQL)

### 6.1. Identity & RBAC Tables
* `tenants` (id, name, status, created_at)
* `users` (id, tenant_id, email, password_hash, is_mfa_enabled)
* `roles` (id, tenant_id, name)
* `permissions` (id, description)
* `role_permissions` (role_id, permission_id)
* `user_roles` (user_id, role_id, tenant_id)

### 6.2. Billing & API Tables
* `subscriptions` (id, tenant_id, plan_tier, status, current_period_end)
* `invoices` (id, tenant_id, amount, payment_status, invoice_pdf_url)
* `api_keys` (id, tenant_id, key_hash, permissions)

---

## 7. UI/UX Guidelines
* **Aesthetic:** Clean, data-dense enterprise SaaS look. Retains subtle pixel-themed UI accents for consistency with the Command Center, but optimized for tables, forms, and charts rather than maps.
* **Components:** Use robust data-table libraries (e.g., Shadcn UI or Tremor.so) for rendering complex billing and user management views.
