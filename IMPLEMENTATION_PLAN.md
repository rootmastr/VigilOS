# Implementation Plan
## VigilOS V3 — Tenant Provisioning Wizard

**Versi Dokumen:** 1.0.0
**Tanggal:** 18 Agustus 2026
**Status:** Draft
**Reference:** PRDtennant.md

---

## Ringkasan Eksekutif

Dokumen ini mendefinisikan tahapan implementasi detail untuk **Tenant Provisioning Wizard** di VigilOS V3. Setiap fase dipecah menjadi task-task spesifik dengan path file, perubahan kode, dan dependency antar task.

### Current State Analysis

| Komponen | Status | Keterangan |
|----------|--------|------------|
| `seedDefaultSettings()` | ✅ Ada | `tenantSettingService.js` — belum di-wire ke POST /tenants |
| `seedFeaturesForPlan()` | ✅ Ada | `tenantFeatureService.js` — belum di-wire ke POST /tenants |
| `createTrialSubscription()` | ⚠️ Ada tapi bug | `subscriptionService.js` — field `trialEnd` & status `TRIAL` tidak ada di schema |
| POST /tenants endpoint | ⚠️ Incomplete | Hanya buat tenant + subscription basic, tidak auto-provision |
| Tenant Management UI | ❌ Tidak ada | Belum ada halaman list/create/manage tenant |
| Dynamic Tenant Switcher | ❌ Hardcoded | `TopHeader.jsx` masih hardcode 3 tenant |
| `industry` field | ❌ Tidak ada | Perlu ditambah ke Tenant model |

---

## Fase 0: Schema Fix & Infrastructure (Day 1)

### Goal: Fix existing bugs sebelum bangun fitur baru

### Task 0.1: Fix Subscription Schema Mismatch

**File:** `vigil-server/prisma/schema.prisma`

**Problem:** `createTrialSubscription()` di `subscriptionService.js` mengirim field `trialEnd` dan status `TRIAL` yang tidak ada di Prisma schema.

**Changes:**
```prisma
// Tambah field ke Subscription model
model Subscription {
  // ... existing fields ...
  trialEnd          DateTime?    // NEW — Trial expiry date
  cancelledAt       DateTime?    // NEW — Cancellation timestamp
  cancelReason      String?      // NEW — Cancellation reason
}

// Tambah enum value
enum SubscriptionStatus {
  PENDING
  TRIAL            // NEW — For trial subscriptions
  ACTIVE
  PENDING_UPGRADE  // NEW — Upgrade pending
  PENDING_DOWNGRADE // NEW — Downgrade pending
  SUSPENDED
  CANCELLED
  EXPIRED
}
```

**Validation:** Jalankan `npx prisma validate` dan `npx prisma db push`

---

### Task 0.2: Add Industry Field to Tenant

**File:** `vigil-server/prisma/schema.prisma`

**Changes:**
```prisma
model Tenant {
  // ... existing fields ...
  industry        String?    // NEW — Industry category
}
```

**Validation:** `npx prisma validate && npx prisma db push`

---

### Task 0.3: Fix Auth Register Default Tenant

**File:** `vigil-server/src/api/routes/auth.js`

**Current (line ~200):**
```js
tenantId: tenantId || 'ws-semarang-01'
```

**Change to:**
```js
tenantId: tenantId || null  // Will be set by provisioning flow
```

**Note:** Register without tenantId should fail with proper error message.

---

### Task 0.4: Run Schema Migration

```bash
cd vigil-server
npx prisma db push
npx prisma generate
npm run db:seed
```

**Checkpoint:** Semua schema valid, Prisma client tergenerate, database seeded.

---

## Fase 1: Backend — Wire Auto-Provisioning (Day 2-3)

### Goal: POST /tenants otomatis provisioning settings + features + subscription

### Task 1.1: Update POST /tenants Imports

**File:** `vigil-server/src/api/routes/tenants.js`

**Add imports:**
```js
import {
  // ... existing imports ...
  seedDefaultSettings,    // ADD
} from '../../services/tenantSettingService.js';
import {
  // ... existing imports ...
  seedFeaturesForPlan,    // ADD
} from '../../services/tenantFeatureService.js';
import {
  // ... existing imports ...
  createTrialSubscription, // ADD — ganti inline subscription creation
} from '../../services/subscriptionService.js';
```

---

### Task 1.2: Rewrite POST /tenants Handler

**File:** `vigil-server/src/api/routes/tenants.js`

**Current flow (incomplete):**
1. Validate input
2. Check slug uniqueness
3. Create tenant
4. Create subscription (inline, basic)
5. Create audit log

**New flow (complete):**
```js
router.post('/', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { name, slug, region, industry, contactEmail, phone, address, planTier } = req.body;

  try {
    // 1. Validate required fields
    if (!name || !slug || !contactEmail) {
      return res.status(400).json({ success: false, error: 'Name, slug, and contactEmail are required' });
    }

    // 2. Check slug uniqueness
    const existing = await db.getTenantBySlug(slug);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Tenant slug already exists' });
    }

    // 3. Create tenant
    const tenant = await db.createTenant({
      name, slug, region, industry, contactEmail, phone, address,
      planTier: planTier || 'TRIAL',
      status: 'PENDING',  // NEW — Start as PENDING until provisioning complete
    });

    // 4. Create subscription (use service, not inline)
    const plan = planTier || 'TRIAL';
    let subscription;
    if (plan === 'TRIAL') {
      subscription = await createTrialSubscription(tenant.id);
    } else {
      subscription = await db.createSubscription({
        tenantId: tenant.id,
        plan,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pricePerMonth: PLANS[plan]?.pricePerMonth || 0,
        deviceLimit: PLANS[plan]?.maxDevices || 10,
      });
    }

    // 5. Auto-provision settings (NEW)
    const settingsCount = await seedDefaultSettings(tenant.id);

    // 6. Auto-provision features (NEW)
    const featuresCount = await seedFeaturesForPlan(tenant.id, plan);

    // 7. Activate tenant if requested
    if (req.body.activate !== false) {
      await db.updateTenant(tenant.id, { status: 'ACTIVE' });
    }

    // 8. Audit log
    await db.createAuditLog({
      tenantId: tenant.id,
      userId: req.user.id,
      action: 'TENANT_CREATED',
      resource: 'tenant',
      resourceId: tenant.id,
      details: { name, slug, plan, settingsCount, featuresCount },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        tenant: { ...tenant, status: req.body.activate !== false ? 'ACTIVE' : 'PENDING' },
        subscription: subscription.data || subscription,
        provisioning: { settingsCreated: settingsCount, featuresCreated: featuresCount },
      },
    });
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
```

**Key changes:**
- Import `seedDefaultSettings`, `seedFeaturesForPlan`, `createTrialSubscription`
- Add `industry` field
- Start tenant as `PENDING`, activate after provisioning
- Use `createTrialSubscription()` for TRIAL plan
- Call `seedDefaultSettings()` and `seedFeaturesForPlan()` after tenant creation
- Return provisioning stats in response

---

### Task 1.3: Update seedDefaultSettings Return Value

**File:** `vigil-server/src/services/tenantSettingService.js`

**Current:** Returns array of created settings

**Change to:** Return count
```js
export async function seedDefaultSettings(tenantId) {
  // ... existing code ...
  return created.length;  // Return count instead of array
}
```

---

### Task 1.4: Update seedFeaturesForPlan Return Value

**File:** `vigil-server/src/services/tenantFeatureService.js`

**Current:** Returns array of created features

**Change to:** Return count
```js
export async function seedFeaturesForPlan(tenantId, plan) {
  // ... existing code ...
  return created.length;  // Return count instead of array
}
```

---

### Task 1.5: Add PLANS Import to Tenants Route

**File:** `vigil-server/src/api/routes/tenants.js`

**Add import:**
```js
import subscriptionService from '../../services/subscriptionService.js';
const { PLANS } = subscriptionService;
```

---

### Checkpoint Fase 1:
```bash
# Test tenant creation via curl
curl -X POST http://localhost:3000/api/v1/tenants \
  -H "Authorization: Bearer <super_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PT Test Tenant",
    "slug": "test-tenant",
    "region": "Jawa Barat",
    "industry": "Public Transit",
    "contactEmail": "admin@test.co.id",
    "planTier": "STARTER"
  }'

# Verify: tenant created, 28 settings, 10 features, subscription active
```

---

## Fase 2: Backend — New Endpoints (Day 4-5)

### Goal: Tambah endpoint untuk status management, delete, dan provisioning check

### Task 2.1: Add PUT /tenants/:id/status Endpoint

**File:** `vigil-server/src/api/routes/tenants.js`

**Add after PUT /tenants/:id:**
```js
/**
 * PUT /tenants/:id/status — Activate/Suspend/Cancel tenant
 */
router.put('/:id/status', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const { status, reason } = req.body;
    const allowedTransitions = {
      PENDING: ['ACTIVE'],
      ACTIVE: ['SUSPENDED', 'CANCELLED'],
      SUSPENDED: ['ACTIVE', 'CANCELLED'],
    };

    if (!allowedTransitions[tenant.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot transition from ${tenant.status} to ${status}`,
      });
    }

    const updated = await db.updateTenant(req.params.id, { status });

    // If suspending/cancelling, update subscription
    if (status === 'SUSPENDED' || status === 'CANCELLED') {
      await db.prisma.subscription.updateMany({
        where: { tenantId: req.params.id, status: { in: ['ACTIVE', 'TRIAL'] } },
        data: { status: status === 'SUSPENDED' ? 'SUSPENDED' : 'CANCELLED' },
      });
    }

    // Audit log
    await db.createAuditLog({
      tenantId: req.params.id,
      userId: req.user.id,
      action: `TENANT_${status}`,
      resource: 'tenant',
      resourceId: req.params.id,
      details: { from: tenant.status, to: status, reason },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update tenant status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
```

---

### Task 2.2: Add DELETE /tenants/:id Endpoint

**File:** `vigil-server/src/api/routes/tenants.js`

**Add after status endpoint:**
```js
/**
 * DELETE /tenants/:id — Soft delete tenant
 */
router.delete('/:id', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    // Soft delete
    await db.prisma.tenant.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });

    // Cancel subscription
    await db.prisma.subscription.updateMany({
      where: { tenantId: req.params.id, status: { in: ['ACTIVE', 'TRIAL'] } },
      data: { status: 'CANCELLED' },
    });

    // Audit log
    await db.createAuditLog({
      tenantId: req.params.id,
      userId: req.user.id,
      action: 'TENANT_DELETED',
      resource: 'tenant',
      resourceId: req.params.id,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Tenant deleted' });
  } catch (error) {
    console.error('Delete tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
```

---

### Task 2.3: Add GET /tenants/:id/provision-status Endpoint

**File:** `vigil-server/src/api/routes/tenants.js`

```js
/**
 * GET /tenants/:id/provision-status — Check provisioning completeness
 */
router.get('/:id/provision-status', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const [settingsCount, featuresCount, usersCount, subscription] = await Promise.all([
      db.prisma.tenantSetting.count({ where: { tenantId: req.params.id } }),
      db.prisma.tenantFeature.count({ where: { tenantId: req.params.id } }),
      db.prisma.user.count({ where: { tenantId: req.params.id } }),
      db.prisma.subscription.findFirst({ where: { tenantId: req.params.id } }),
    ]);

    const complete = settingsCount >= 28 && featuresCount >= 10 && usersCount >= 1 && subscription;

    res.json({
      success: true,
      data: {
        tenantId: req.params.id,
        complete,
        checks: {
          settings: { count: settingsCount, required: 28, ok: settingsCount >= 28 },
          features: { count: featuresCount, required: 10, ok: featuresCount >= 10 },
          adminUser: { count: usersCount, required: 1, ok: usersCount >= 1 },
          subscription: { exists: !!subscription, ok: !!subscription },
        },
      },
    });
  } catch (error) {
    console.error('Get provision status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
```

---

### Task 2.4: Add POST /tenants/provision Endpoint (Full Wizard)

**File:** `vigil-server/src/api/routes/tenants.js`

```js
/**
 * POST /tenants/provision — Full provisioning wizard (all-in-one)
 */
router.post('/provision', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { tenant: tenantData, subscription: subData, admin: adminData, settings: settingsOverrides, activate } = req.body;

  try {
    // Validate required fields
    if (!tenantData?.name || !tenantData?.slug || !tenantData?.contactEmail) {
      return res.status(400).json({ success: false, error: 'Tenant name, slug, and contactEmail are required' });
    }
    if (!adminData?.name || !adminData?.email || !adminData?.password) {
      return res.status(400).json({ success: false, error: 'Admin name, email, and password are required' });
    }

    // Check slug uniqueness
    const existing = await db.getTenantBySlug(tenantData.slug);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Tenant slug already exists' });
    }

    // Check admin email uniqueness
    const existingUser = await db.getUserByEmail(adminData.email);
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Admin email already exists' });
    }

    // 1. Create tenant
    const tenant = await db.createTenant({
      name: tenantData.name,
      slug: tenantData.slug,
      region: tenantData.region,
      industry: tenantData.industry,
      contactEmail: tenantData.contactEmail,
      phone: tenantData.phone,
      address: tenantData.address,
      planTier: subData?.plan || 'TRIAL',
      status: 'PENDING',
    });

    // 2. Create subscription
    const plan = subData?.plan || 'TRIAL';
    let subscription;
    if (plan === 'TRIAL') {
      subscription = await createTrialSubscription(tenant.id);
    } else {
      const planConfig = PLANS[plan];
      subscription = await db.createSubscription({
        tenantId: tenant.id,
        plan,
        status: 'ACTIVE',
        currentPeriodStart: new Date(subData?.startDate || Date.now()),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pricePerMonth: planConfig?.pricePerMonth || 0,
        deviceLimit: planConfig?.maxDevices || 10,
      });
    }

    // 3. Create admin user
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(adminData.password, 10);
    const adminUser = await db.createUser({
      tenantId: tenant.id,
      name: adminData.name,
      email: adminData.email,
      passwordHash,
      role: adminData.role || 'TENANT_ADMIN',
      status: 'ACTIVE',
    });

    // 4. Seed default settings
    const settingsCount = await seedDefaultSettings(tenant.id);

    // 5. Apply settings overrides
    if (settingsOverrides && typeof settingsOverrides === 'object') {
      for (const [category, updates] of Object.entries(settingsOverrides)) {
        if (typeof updates === 'object') {
          await bulkUpdateSettings(tenant.id, category, updates, adminUser.id, {
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          });
        }
      }
    }

    // 6. Seed features for plan
    const featuresCount = await seedFeaturesForPlan(tenant.id, plan);

    // 7. Activate tenant
    if (activate !== false) {
      await db.updateTenant(tenant.id, { status: 'ACTIVE' });
    }

    // 8. Audit log
    await db.createAuditLog({
      tenantId: tenant.id,
      userId: req.user.id,
      action: 'TENANT_PROVISIONED',
      resource: 'tenant',
      resourceId: tenant.id,
      details: {
        name: tenantData.name,
        slug: tenantData.slug,
        plan,
        settingsCount,
        featuresCount,
        adminEmail: adminData.email,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        tenant: { ...tenant, status: activate !== false ? 'ACTIVE' : 'PENDING' },
        subscription: subscription.data || subscription,
        admin: { id: adminUser.id, email: adminUser.email, role: adminUser.role },
        provisioning: {
          settingsCreated: settingsCount,
          featuresCreated: featuresCount,
        },
      },
    });
  } catch (error) {
    console.error('Provision tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
```

---

### Checkpoint Fase 2:
```bash
# Test full provisioning
curl -X POST http://localhost:3000/api/v1/tenants/provision \
  -H "Authorization: Bearer <super_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": {
      "name": "PT Transportasi Jaya",
      "slug": "transportasi-jaya",
      "region": "Jawa Barat",
      "industry": "Public Transit",
      "contactEmail": "admin@tj.co.id"
    },
    "subscription": { "plan": "STARTER" },
    "admin": {
      "name": "Budi Santoso",
      "email": "budi@tj.co.id",
      "password": "SecurePass123!"
    },
    "activate": true
  }'

# Test status transition
curl -X PUT http://localhost:3000/api/v1/tenants/<id>/status \
  -H "Authorization: Bearer <super_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "SUSPENDED", "reason": "Test" }'

# Test provision status check
curl http://localhost:3000/api/v1/tenants/<id>/provision-status \
  -H "Authorization: Bearer <super_admin_token>"
```

---

## Fase 3: Frontend — Tenant Management Page (Day 6-8)

### Goal: Halaman list, detail, dan manage tenant untuk Super Admin

### Task 3.1: Create TenantManagement Component

**File:** `vigil-app/src/components/portal/TenantManagement.jsx` (NEW)

**Features:**
- Tenant list table (name, plan, status, users, devices, actions)
- Search by name/slug
- Filter by status (All, Active, Suspended, Pending)
- Click row → navigate to tenant detail
- "Add New Tenant" button → opens provisioning wizard
- Status badge (green=active, amber=pending, red=suspended)
- Device usage progress bar

**API calls:**
```js
GET /api/v1/tenants?skip=0&take=50&status=ACTIVE
```

**Component structure:**
```jsx
export default function TenantManagement({ user, onSelectTenant }) {
  // State: tenants[], loading, search, filter, selectedTenant
  // Fetch: GET /tenants on mount
  // Render: table with search/filter/actions
}
```

---

### Task 3.2: Create TenantDetail Component

**File:** `vigil-app/src/components/portal/TenantDetail.jsx` (NEW)

**Features:**
- Back button → return to tenant list
- Tenant info card (name, slug, region, industry, status, plan)
- KPI cards (users, vehicles, incidents, devices)
- Recent activity timeline
- Quick action buttons (View Portal, Manage Settings, Manage Features)
- Status toggle (Activate/Suspend)
- Delete button with confirmation

**API calls:**
```js
GET /api/v1/tenants/:id
GET /api/v1/tenants/:id/provision-status
PUT /api/v1/tenants/:id/status
DELETE /api/v1/tenants/:id
```

---

### Task 3.3: Create ProvisioningWizard Component

**File:** `vigil-app/src/components/portal/ProvisioningWizard.jsx` (NEW)

**5-step wizard with state management:**

```jsx
const STEPS = [
  { id: 'basic', label: 'Basic Info', icon: Building2 },
  { id: 'plan', label: 'Plan & Billing', icon: CreditCard },
  { id: 'admin', label: 'Admin User', icon: UserPlus },
  { id: 'config', label: 'Settings', icon: Settings },
  { id: 'review', label: 'Review & Launch', icon: Rocket },
];

export default function ProvisioningWizard({ onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    tenant: { name: '', slug: '', region: '', industry: '', contactEmail: '', phone: '', address: '' },
    subscription: { plan: 'TRIAL', startDate: new Date().toISOString().split('T')[0] },
    admin: { name: '', email: '', password: '', role: 'TENANT_ADMIN' },
    settings: {},
    activate: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step validation
  const canProceed = () => { /* validate current step */ };

  // Submit to POST /tenants/provision
  const handleSubmit = async () => {
    setLoading(true);
    const res = await fetch('/api/v1/tenants/provision', { ... });
    setLoading(false);
    if (res.success) onComplete(res.data);
  };

  return (
    <div className="provisioning-wizard">
      {/* Step indicator */}
      {/* Step content */}
      {/* Navigation buttons */}
    </div>
  );
}
```

**Sub-components per step:**
1. `StepBasicInfo.jsx` — Form fields for tenant info
2. `StepPlanBilling.jsx` — Plan selection cards + billing form
3. `StepAdminUser.jsx` — Admin user creation form
4. `StepConfig.jsx` — Settings review (read-only with edit links)
5. `StepReview.jsx` — Final review checklist

---

### Task 3.4: Register Pages in App.jsx

**File:** `vigil-app/src/App.jsx`

**Add imports:**
```js
import TenantManagement from './components/portal/TenantManagement';
import TenantDetail from './components/portal/TenantDetail';
import ProvisioningWizard from './components/portal/ProvisioningWizard';
```

**Add to PORTAL_PAGES:**
```js
const PORTAL_PAGES = [
  'portal-dashboard', 'portal-team', 'portal-billing', 'portal-sla',
  'portal-apikeys', 'portal-settings', 'portal-features',
  'portal-tenants',        // NEW
  'portal-tenant-detail',  // NEW
];
```

**Add render logic:**
```jsx
{activePage === 'portal-tenants' && canAccessPage(userRole, 'portal-tenants') && (
  <TenantManagement user={authUser} onSelectTenant={(id) => {
    setSelectedTenantId(id);
    setActivePage('portal-tenant-detail');
  }} />
)}
{activePage === 'portal-tenant-detail' && canAccessPage(userRole, 'portal-tenants') && (
  <TenantDetail user={authUser} tenantId={selectedTenantId} onBack={() => setActivePage('portal-tenants')} />
)}
```

---

### Task 3.5: Update PortalLayout Navigation

**File:** `vigil-app/src/components/portal/PortalLayout.jsx`

**Add to ROLE_PORTAL_ACCESS:**
```js
SUPER_ADMIN: [...existing, 'portal-tenants'],
```

**Add to PORTAL_NAV:**
```js
{ id: 'portal-tenants', icon: Building2, label: 'Tenants', roles: ['SUPER_ADMIN'] },
```

**Import Building2 from lucide-react.**

---

### Task 3.6: Add CSS for Wizard & Tenant Pages

**File:** `vigil-app/src/index.css`

**Add styles:**
```css
/* Provisioning Wizard */
.provisioning-wizard { /* full screen modal overlay */ }
.provisioning-wizard-content { /* centered 640px panel */ }
.wizard-step-indicator { /* horizontal step bar */ }
.wizard-step { /* individual step circle + label */ }
.wizard-step.active { /* highlighted step */ }
.wizard-step.completed { /* green checkmark */ }
.wizard-form-group { /* form field group */ }
.wizard-form-label { /* field label */ }
.wizard-form-input { /* input field */ }
.wizard-form-error { /* validation error */ }
.wizard-nav { /* bottom navigation bar */ }
.wizard-nav-btn { /* back/next buttons */ }
.wizard-nav-btn-primary { /* next/submit primary button */ }

/* Plan Selection Cards */
.plan-cards-grid { /* 4-column grid */ }
.plan-card { /* individual plan card */ }
.plan-card.selected { /* selected plan highlight */ }
.plan-card-popular { /* popular plan badge */ }

/* Tenant Management */
.tenant-stats-bar { /* stats summary bar */ }
.tenant-status-badge { /* status pill badge */ }
.tenant-device-bar { /* device usage progress bar */ }
```

---

### Checkpoint Fase 3:
- [ ] Tenant list page shows all tenants with search/filter
- [ ] Clicking tenant opens detail page
- [ ] "Add New Tenant" opens provisioning wizard
- [ ] Wizard navigates through 5 steps
- [ ] Wizard submits to POST /tenants/provision
- [ ] Success state shows after provisioning
- [ ] Status transitions work (activate/suspend)
- [ ] Soft delete works with confirmation

---

## Fase 4: Dynamic Tenant Switcher (Day 9-10)

### Goal: Replace hardcoded tenant list dengan database-driven switcher

### Task 4.1: Update TopHeader to Fetch Tenants

**File:** `vigil-app/src/components/layout/TopHeader.jsx`

**Remove hardcoded TENANTS array.**

**Add state and fetch:**
```jsx
const [tenants, setTenants] = useState([]);
const [tenantsLoading, setTenantsLoading] = useState(false);

useEffect(() => {
  if (user?.role === 'SUPER_ADMIN') {
    fetchTenants();
  }
}, [user]);

const fetchTenants = async () => {
  setTenantsLoading(true);
  try {
    const token = localStorage.getItem('vigil_access_token');
    const res = await fetch('/api/v1/tenants?take=100', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setTenants(data.data);
  } catch (e) {
    // Fallback to demo data
    setTenants([
      { id: 'ws-semarang-01', name: 'Dishub Kota Semarang', region: 'Jawa Tengah', planTier: 'ENTERPRISE' },
    ]);
  } finally {
    setTenantsLoading(false);
  }
};
```

---

### Task 4.2: Update Tenant Switcher Dropdown

**File:** `vigil-app/src/components/layout/TopHeader.jsx`

**Replace hardcoded dropdown with dynamic:**
```jsx
{/* Tenant Switcher Dropdown */}
<div className="tenant-switcher-dropdown">
  <input placeholder="Search tenants..." className="tenant-search" />
  {tenants.map(t => (
    <div key={t.id} className={`tenant-option ${currentTenant === t.id ? 'active' : ''}`}
         onClick={() => onTenantSwitch(t.id)}>
      <div className="tenant-option-name">{t.name}</div>
      <div className="tenant-option-meta">{t.region} · {t.planTier}</div>
    </div>
  ))}
  {user?.role === 'SUPER_ADMIN' && (
    <div className="tenant-option tenant-add-new" onClick={onAddNewTenant}>
      + Add New Tenant
    </div>
  )}
</div>
```

---

### Task 4.3: Persist Selected Tenant

**File:** `vigil-app/src/App.jsx`

**Update initial state:**
```jsx
const [currentTenant, setCurrentTenant] = useState(() => {
  return localStorage.getItem('vigil_current_tenant') || 'ws-semarang-01';
});

const handleTenantSwitch = useCallback((tenantId) => {
  setCurrentTenant(tenantId);
  localStorage.setItem('vigil_current_tenant', tenantId);
}, []);
```

---

### Task 4.4: Add Tenant Switcher CSS

**File:** `vigil-app/src/index.css`

```css
.tenant-switcher-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  width: 320px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: 10px;
  box-shadow: var(--shadow-elevated);
  z-index: 100;
}

.tenant-search {
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
}

.tenant-option {
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
}

.tenant-option:hover { background: var(--bg-card-hover); }
.tenant-option.active { background: var(--accent-blue-subtle); }

.tenant-option-name { font-weight: 600; font-size: 13px; }
.tenant-option-meta { font-size: 11px; color: var(--text-muted); }

.tenant-add-new {
  color: var(--accent-blue);
  font-weight: 600;
  text-align: center;
}
```

---

### Checkpoint Fase 4:
- [ ] Tenant switcher fetches from API (not hardcoded)
- [ ] Search filters tenants in dropdown
- [ ] "Add New Tenant" opens wizard (or navigates to tenants page)
- [ ] Selected tenant persists in localStorage
- [ ] Switching tenant updates command center data
- [ ] Fallback to demo data when backend is down

---

## Fase 5: Integration & Polish (Day 11-12)

### Goal: Final integration, error handling, dan edge cases

### Task 5.1: Add Welcome Email Hook (Optional)

**File:** `vigil-server/src/services/emailService.js` (NEW)

```js
export async function sendProvisioningWelcomeEmail(tenant, admin, plan) {
  // Send email with:
  // - Tenant name
  // - Login URL
  // - Admin email
  // - Plan details
  // - Getting started guide
}
```

**Wire into POST /tenants/provision after success.**

---

### Task 5.2: Add Loading States

**File:** All new components

Ensure every API call has:
- Loading spinner during fetch
- Empty state when no data
- Error state with retry button

---

### Task 5.3: Add Inline Validation

**File:** All wizard step components

- Slug: real-time uniqueness check via debounced API call
- Email: format validation + uniqueness check
- Password: strength indicator
- Required fields: highlight on blur

---

### Task 5.4: Add Audit Log Viewer

**File:** `vigil-app/src/components/portal/AuditLogViewer.jsx` (NEW)

- Show tenant audit logs
- Filter by action type
- Show before/after values for settings changes

---

### Task 5.5: Add Bulk Tenant Import

**File:** `vigil-app/src/components/portal/TenantImport.jsx` (NEW)

- CSV upload
- Preview table
- Validate all rows
- Import with progress bar

---

### Task 5.6: Add Tenant Stats API

**File:** `vigil-server/src/api/routes/tenants.js`

```js
/**
 * GET /tenants/stats — Platform-wide tenant statistics (Super Admin)
 */
router.get('/stats', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
  const [total, active, suspended, pending] = await Promise.all([
    db.prisma.tenant.count({ where: { deletedAt: null } }),
    db.prisma.tenant.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    db.prisma.tenant.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
    db.prisma.tenant.count({ where: { deletedAt: null, status: 'PENDING' } }),
  ]);

  res.json({
    success: true,
    data: { total, active, suspended, pending },
  });
});
```

---

## File Manifest

### New Files (Backend)
| File | Description |
|------|-------------|
| `vigil-server/src/services/emailService.js` | Welcome email service (optional) |

### New Files (Frontend)
| File | Description |
|------|-------------|
| `vigil-app/src/components/portal/TenantManagement.jsx` | Tenant list page |
| `vigil-app/src/components/portal/TenantDetail.jsx` | Tenant detail page |
| `vigil-app/src/components/portal/ProvisioningWizard.jsx` | 5-step wizard |
| `vigil-app/src/components/portal/StepBasicInfo.jsx` | Wizard step 1 |
| `vigil-app/src/components/portal/StepPlanBilling.jsx` | Wizard step 2 |
| `vigil-app/src/components/portal/StepAdminUser.jsx` | Wizard step 3 |
| `vigil-app/src/components/portal/StepConfig.jsx` | Wizard step 4 |
| `vigil-app/src/components/portal/StepReview.jsx` | Wizard step 5 |
| `vigil-app/src/components/portal/AuditLogViewer.jsx` | Audit log viewer |
| `vigil-app/src/components/portal/TenantImport.jsx` | Bulk import |

### Modified Files (Backend)
| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `industry`, `trialEnd`, `cancelledAt`, `cancelReason` fields; add `TRIAL`, `PENDING_UPGRADE`, `PENDING_DOWNGRADE` to SubscriptionStatus |
| `src/api/routes/tenants.js` | Add imports, rewrite POST /tenants, add PUT /status, DELETE, GET /provision-status, POST /provision, GET /stats |
| `src/services/tenantSettingService.js` | Update `seedDefaultSettings` return type to count |
| `src/services/tenantFeatureService.js` | Update `seedFeaturesForPlan` return type to count |

### Modified Files (Frontend)
| File | Changes |
|------|---------|
| `src/App.jsx` | Add imports, PORTAL_PAGES, render logic for new pages |
| `src/components/portal/PortalLayout.jsx` | Add portal-tenants to nav and role access |
| `src/components/layout/TopHeader.jsx` | Replace hardcoded TENANTS with API fetch, add search |
| `src/index.css` | Add wizard, plan card, tenant management styles |

---

## Dependency Graph

```
Fase 0 (Schema Fix)
    ↓
Fase 1 (Wire Auto-Provisioning)
    ↓
Fase 2 (New Endpoints)
    ↓
Fase 3 (Frontend Tenant Management)
    ↓
Fase 4 (Dynamic Tenant Switcher)
    ↓
Fase 5 (Integration & Polish)
```

**Critical Path:** Fase 0 → Fase 1 → Fase 2 → Fase 3 → Fase 4

**Parallel Work:** Fase 5 dapat dimulai setelah Fase 3 selesai (tidak dependency ke Fase 4)

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema migration breaks existing data | High | Backup database sebelum migration, test di dev |
| Auto-provisioning timeout untuk plan besar | Medium | Use async job queue jika > 50 settings |
| Wizard state loss saat navigasi | Medium | Persist wizard state di localStorage |
| Email service not configured | Low | Skip email jika tidak dikonfigurasi |
| Performance dengan 100+ tenants | Low | Add pagination, lazy loading |

---

## Testing Checklist

### Backend
- [ ] POST /tenants creates tenant + 28 settings + 10 features
- [ ] POST /provision creates everything in one call
- [ ] Status transitions are enforced
- [ ] Soft delete preserves data
- [ ] Slug uniqueness validated
- [ ] Email uniqueness validated
- [ ] Audit logs created for all actions

### Frontend
- [ ] Tenant list loads from API
- [ ] Search and filter work
- [ ] Wizard navigates through all steps
- [ ] Form validation shows errors
- [ ] Submit creates tenant successfully
- [ ] Success state displays correctly
- [ ] Tenant switcher fetches dynamically
- [ ] Selected tenant persists

### Integration
- [ ] Full flow: login → create tenant → switch tenant → view portal
- [ ] Error states handled gracefully
- [ ] Loading states shown
- [ ] Fallback data works when backend down

---

**Document Version History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 18 Aug 2026 | VigilOS Team | Initial implementation plan |
