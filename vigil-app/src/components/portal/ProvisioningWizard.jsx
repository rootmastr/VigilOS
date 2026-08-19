import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Building2, CreditCard, UserPlus, Settings, Rocket, ArrowLeft,
  ArrowRight, X, Loader2, Check, AlertCircle,
} from 'lucide-react';

const BACKEND_URL = '';

const STEPS = [
  { id: 'basic', label: 'Basic Info', icon: Building2 },
  { id: 'plan', label: 'Plan & Billing', icon: CreditCard },
  { id: 'admin', label: 'Admin User', icon: UserPlus },
  { id: 'config', label: 'Settings', icon: Settings },
  { id: 'review', label: 'Review & Launch', icon: Rocket },
];

const REGIONS = [
  'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Jambi', 'Sumatera Selatan',
  'Bengkulu', 'Lampung', 'Kep. Bangka Belitung', 'Kep. Riau', 'DKI Jakarta',
  'Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur', 'Banten',
  'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Kalimantan Barat',
  'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara',
  'Sulawesi Utara', 'Sulawesi Tengah', 'Sulawesi Selatan', 'Sulawesi Tenggara',
  'Gorontalo', 'Sulawesi Barat', 'Maluku', 'Maluku Utara', 'Papua Barat', 'Papua',
];

const INDUSTRIES = ['Public Transit', 'Logistics', 'Government', 'Mining', 'Other'];

const PLANS = [
  { id: 'TRIAL', name: 'Trial', price: 'Gratis', devices: 5, users: 3, apiCalls: '10K', features: ['Basic tracking'], paid: false },
  { id: 'STARTER', name: 'Starter', price: 'Rp 5M/bln', devices: 10, users: 5, apiCalls: '100K', features: ['Geofence', 'Deviation alerts'], paid: true },
  { id: 'PROFESSIONAL', name: 'Professional', price: 'Rp 18M/bln', devices: 30, users: 20, apiCalls: '1M', features: ['AI Reports', 'API Access'], paid: true },
  { id: 'ENTERPRISE', name: 'Enterprise', price: 'Rp 45M/bln', devices: 100, users: 50, apiCalls: '10M', features: ['Webhooks', 'Priority Support'], paid: true },
];

const DEFAULT_SETTINGS = {
  general: { timezone: 'Asia/Jakarta', language: 'id', currency: 'IDR', date_format: 'DD/MM/YYYY', time_format: '24h' },
  branding: { theme: 'light', primary_color: '#1E40AF' },
  notifications: { email_enabled: true, push_enabled: true, sms_enabled: false },
  security: { mfa_required: false, session_timeout: 30, api_rate_limit: 1000 },
};

export default function ProvisioningWizard({ onClose, onComplete, showToast }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    tenant: { name: '', slug: '', region: '', industry: '', contactEmail: '', phone: '', address: '' },
    subscription: { plan: 'TRIAL', startDate: new Date().toISOString().split('T')[0], billingContact: '', billingEmail: '', paymentMethod: 'virtual_account', poNumber: '' },
    admin: { name: '', email: '', password: '', confirmPassword: '', role: 'TENANT_ADMIN' },
    settings: { ...DEFAULT_SETTINGS },
    activate: true,
  });
  const [validation, setValidation] = useState({ slug: null, email: null, adminEmail: null });
  const [validating, setValidating] = useState({ slug: false, email: false, adminEmail: false });
  const debounceRef = useRef({});

  const checkUniqueness = useCallback(async (type, value) => {
    if (!value || value.length < 3) {
      setValidation(prev => ({ ...prev, [type]: null }));
      return;
    }
    setValidating(prev => ({ ...prev, [type]: true }));
    try {
      const token = localStorage.getItem('vigil_access_token');
      const params = new URLSearchParams();
      if (type === 'slug' || type === 'email') params.set(type, value);
      if (type === 'adminEmail') params.set('email', value);
      const res = await fetch(`${BACKEND_URL}/api/v1/tenants/check?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const key = type === 'adminEmail' ? 'email' : type;
        setValidation(prev => ({ ...prev, [type]: data.data[key]?.available ?? null }));
      }
    } catch (e) {
      // Silently fail — will be caught on submit
    } finally {
      setValidating(prev => ({ ...prev, [type]: false }));
    }
  }, []);

  const debouncedCheck = useCallback((type, value, delay = 400) => {
    clearTimeout(debounceRef.current[type]);
    debounceRef.current[type] = setTimeout(() => checkUniqueness(type, value), delay);
  }, [checkUniqueness]);

  const updateTenant = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, tenant: { ...prev.tenant, [field]: value } };
      if (field === 'name' && !prev.tenant.slugEdited) {
        next.tenant.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        debouncedCheck('slug', next.tenant.slug);
      }
      if (field === 'slug') debouncedCheck('slug', value);
      if (field === 'contactEmail') debouncedCheck('email', value);
      return next;
    });
  };

  const updateSub = (field, value) => {
    setFormData(prev => ({ ...prev, subscription: { ...prev.subscription, [field]: value } }));
  };

  const updateAdmin = (field, value) => {
    setFormData(prev => ({ ...prev, admin: { ...prev.admin, [field]: value } }));
    if (field === 'email') debouncedCheck('adminEmail', value);
  };

  const canProceed = useMemo(() => {
    switch (step) {
      case 0:
        return formData.tenant.name.length >= 3 && formData.tenant.slug && formData.tenant.region && formData.tenant.industry && formData.tenant.contactEmail.includes('@') && validation.slug !== false && validation.email !== false;
      case 1:
        return formData.subscription.plan;
      case 2:
        return formData.admin.name.split(' ').length >= 2 && formData.admin.email.includes('@') && formData.admin.password.length >= 8 && formData.admin.password === formData.admin.confirmPassword && validation.adminEmail !== false;
      case 3:
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, formData, validation]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('vigil_access_token');
      const payload = {
        tenant: {
          name: formData.tenant.name,
          slug: formData.tenant.slug,
          region: formData.tenant.region,
          industry: formData.tenant.industry,
          contactEmail: formData.tenant.contactEmail,
          phone: formData.tenant.phone || undefined,
          address: formData.tenant.address || undefined,
        },
        subscription: {
          plan: formData.subscription.plan,
          startDate: formData.subscription.startDate,
        },
        admin: {
          name: formData.admin.name,
          email: formData.admin.email,
          password: formData.admin.password,
          role: formData.admin.role,
        },
        settings: formData.settings,
        activate: formData.activate,
      };

      const res = await fetch(`${BACKEND_URL}/api/v1/tenants/provision`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        onComplete?.(data.data);
      } else {
        setError(data.error || 'Provisioning failed');
      }
    } catch (e) {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  const stepLabels = ['Basic Info', 'Plan & Billing', 'Admin User', 'Settings', 'Review'];

  return (
    <div className="provisioning-wizard">
      <div className="provisioning-wizard-content">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Tenant Setup</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Step {step + 1} of 5 — {stepLabels[step]}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="wizard-step-indicator">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}>
              <div className="wizard-step-circle">
                {i < step ? <Check size={14} /> : <s.icon size={14} />}
              </div>
              <div className="wizard-step-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Step Content */}
        <div className="wizard-step-content">
          {step === 0 && <StepBasicInfo data={formData.tenant} onChange={updateTenant} validation={validation} validating={validating} />}
          {step === 1 && <StepPlanBilling data={formData.subscription} onChange={updateSub} />}
          {step === 2 && <StepAdminUser data={formData.admin} onChange={updateAdmin} validation={validation} validating={validating} />}
          {step === 3 && <StepConfig data={formData.settings} tenantName={formData.tenant.name} />}
          {step === 4 && <StepReview formData={formData} />}
        </div>

        {/* Navigation */}
        <div className="wizard-nav">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {step < 4 ? (
              <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canProceed}>
                Next <ArrowRight size={14} />
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                {loading ? <Loader2 size={14} className="spin" /> : <Rocket size={14} />}
                {loading ? 'Publishing...' : 'Publish Tenant'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepBasicInfo({ data, onChange, validation, validating }) {
  return (
    <div>
      <div className="wizard-section-title">Company Information</div>
      <div className="wizard-form-group">
        <label className="wizard-form-label">Company Name *</label>
        <input className="wizard-form-input" value={data.name} onChange={e => onChange('name', e.target.value)} placeholder="PT Transportasi Jaya Barat" />
      </div>
      <div className="wizard-form-group">
        <label className="wizard-form-label">Slug * <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(auto-generated, editable)</span></label>
        <div style={{ position: 'relative' }}>
          <input className="wizard-form-input" value={data.slug} onChange={e => { onChange('slug', e.target.value); onChange('slugEdited', true); }} placeholder="transportasi-jaya-barat" style={{ paddingRight: 36 }} />
          <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
            {validating?.slug && <Loader2 size={14} className="spin" style={{ color: 'var(--text-muted)' }} />}
            {!validating?.slug && validation?.slug === true && <Check size={14} style={{ color: '#22c55e' }} />}
            {!validating?.slug && validation?.slug === false && <span style={{ color: '#ef4444', fontSize: 14 }}>&#10005;</span>}
          </div>
        </div>
        {validation?.slug === false && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>Slug already taken</div>}
        {validation?.slug === true && <div style={{ color: '#22c55e', fontSize: 11, marginTop: 2 }}>Slug available</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="wizard-form-group">
          <label className="wizard-form-label">Region *</label>
          <select className="wizard-form-input" value={data.region} onChange={e => onChange('region', e.target.value)}>
            <option value="">Select region...</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="wizard-form-group">
          <label className="wizard-form-label">Industry *</label>
          <select className="wizard-form-input" value={data.industry} onChange={e => onChange('industry', e.target.value)}>
            <option value="">Select industry...</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
      </div>
      <div className="wizard-section-title" style={{ marginTop: 16 }}>Contact Details</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="wizard-form-group">
          <label className="wizard-form-label">Contact Email *</label>
          <div style={{ position: 'relative' }}>
            <input className="wizard-form-input" type="email" value={data.contactEmail} onChange={e => onChange('contactEmail', e.target.value)} placeholder="admin@company.co.id" style={{ paddingRight: 36 }} />
            <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
              {validating?.email && <Loader2 size={14} className="spin" style={{ color: 'var(--text-muted)' }} />}
              {!validating?.email && validation?.email === true && <Check size={14} style={{ color: '#22c55e' }} />}
              {!validating?.email && validation?.email === false && <span style={{ color: '#ef4444', fontSize: 14 }}>&#10005;</span>}
            </div>
          </div>
          {validation?.email === false && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>Email already registered</div>}
        </div>
        <div className="wizard-form-group">
          <label className="wizard-form-label">Phone</label>
          <input className="wizard-form-input" value={data.phone} onChange={e => onChange('phone', e.target.value)} placeholder="+62 22-5555-0100" />
        </div>
      </div>
      <div className="wizard-form-group">
        <label className="wizard-form-label">Address</label>
        <textarea className="wizard-form-input" rows={2} value={data.address} onChange={e => onChange('address', e.target.value)} placeholder="Jl. Asia Afrika 123, Bandung" style={{ resize: 'vertical' }} />
      </div>
    </div>
  );
}

function StepPlanBilling({ data, onChange }) {
  return (
    <div>
      <div className="wizard-section-title">Select Subscription Plan</div>
      <div className="plan-cards-grid">
        {PLANS.map(plan => (
          <div key={plan.id} className={`plan-card ${data.plan === plan.id ? 'selected' : ''}`} onClick={() => onChange('plan', plan.id)}>
            <div className="plan-card-name">{plan.name}</div>
            <div className="plan-card-price">{plan.price}</div>
            <div className="plan-card-meta">{plan.devices} devices · {plan.users} users</div>
            <div className="plan-card-meta">{plan.apiCalls} API calls/mo</div>
            <div className="plan-card-features">
              {plan.features.map(f => <div key={f}>✓ {f}</div>)}
            </div>
          </div>
        ))}
      </div>

      {PLANS.find(p => p.id === data.plan)?.paid && (
        <>
          <div className="wizard-section-title" style={{ marginTop: 20 }}>Billing Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="wizard-form-group">
              <label className="wizard-form-label">Start Date *</label>
              <input className="wizard-form-input" type="date" value={data.startDate} onChange={e => onChange('startDate', e.target.value)} />
            </div>
            <div className="wizard-form-group">
              <label className="wizard-form-label">Payment Method</label>
              <select className="wizard-form-input" value={data.paymentMethod} onChange={e => onChange('paymentMethod', e.target.value)}>
                <option value="virtual_account">Virtual Account</option>
                <option value="credit_card">Credit Card</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="wizard-form-group">
              <label className="wizard-form-label">Billing Contact</label>
              <input className="wizard-form-input" value={data.billingContact} onChange={e => onChange('billingContact', e.target.value)} placeholder="Finance Dept" />
            </div>
            <div className="wizard-form-group">
              <label className="wizard-form-label">Billing Email</label>
              <input className="wizard-form-input" type="email" value={data.billingEmail} onChange={e => onChange('billingEmail', e.target.value)} placeholder="finance@company.co.id" />
            </div>
          </div>
          <div className="wizard-form-group">
            <label className="wizard-form-label">PO Number (optional)</label>
            <input className="wizard-form-input" value={data.poNumber} onChange={e => onChange('poNumber', e.target.value)} placeholder="PO-2026-08-001" />
          </div>
        </>
      )}
    </div>
  );
}

function StepAdminUser({ data, onChange, validation, validating }) {
  const [showPassword, setShowPassword] = useState(false);
  const passwordValid = {
    length: data.password.length >= 8,
    uppercase: /[A-Z]/.test(data.password),
    number: /[0-9]/.test(data.password),
    special: /[!@#$%^&*]/.test(data.password),
  };

  return (
    <div>
      <div className="wizard-section-title">Create Admin User</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        This user will have full access to the tenant portal.
      </div>
      <div className="wizard-form-group">
        <label className="wizard-form-label">Full Name *</label>
        <input className="wizard-form-input" value={data.name} onChange={e => onChange('name', e.target.value)} placeholder="Budi Santoso" />
      </div>
      <div className="wizard-form-group">
        <label className="wizard-form-label">Email *</label>
        <div style={{ position: 'relative' }}>
          <input className="wizard-form-input" type="email" value={data.email} onChange={e => onChange('email', e.target.value)} placeholder="budi@company.co.id" style={{ paddingRight: 36 }} />
          <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
            {validating?.adminEmail && <Loader2 size={14} className="spin" style={{ color: 'var(--text-muted)' }} />}
            {!validating?.adminEmail && validation?.adminEmail === true && <Check size={14} style={{ color: '#22c55e' }} />}
            {!validating?.adminEmail && validation?.adminEmail === false && <span style={{ color: '#ef4444', fontSize: 14 }}>&#10005;</span>}
          </div>
        </div>
        {validation?.adminEmail === false && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>Email already registered</div>}
      </div>
      <div className="wizard-form-group">
        <label className="wizard-form-label">Password *</label>
        <div style={{ position: 'relative' }}>
          <input
            className="wizard-form-input"
            type={showPassword ? 'text' : 'password'}
            value={data.password}
            onChange={e => onChange('password', e.target.value)}
            placeholder="Min 8 characters"
            style={{ paddingRight: 60 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11 }}>
          {[
            ['length', '8+ chars'],
            ['uppercase', '1 uppercase'],
            ['number', '1 number'],
            ['special', '1 special'],
          ].map(([key, label]) => (
            <span key={key} style={{ color: passwordValid[key] ? '#22c55e' : 'var(--text-muted)' }}>
              {passwordValid[key] ? '✓' : '○'} {label}
            </span>
          ))}
        </div>
      </div>
      <div className="wizard-form-group">
        <label className="wizard-form-label">Confirm Password *</label>
        <input className="wizard-form-input" type="password" value={data.confirmPassword} onChange={e => onChange('confirmPassword', e.target.value)} placeholder="Re-enter password" />
        {data.confirmPassword && data.password !== data.confirmPassword && (
          <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>Passwords do not match</div>
        )}
      </div>
      <div className="wizard-form-group">
        <label className="wizard-form-label">Role *</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['TENANT_ADMIN', 'Full access to tenant portal'],
            ['TENANT_FINANCE', 'Billing and payment access only'],
          ].map(([role, desc]) => (
            <label key={role} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${data.role === role ? 'var(--accent-blue)' : 'var(--border-subtle)'}`, cursor: 'pointer', background: data.role === role ? 'var(--accent-blue-subtle)' : 'transparent' }}>
              <input type="radio" name="role" value={role} checked={data.role === role} onChange={() => onChange('role', role)} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{role.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepConfig({ data, tenantName }) {
  return (
    <div>
      <div className="wizard-section-title">Default Configuration</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        These are the default settings that will be provisioned. You can customize them later.
      </div>

      {Object.entries(data).map(([category, settings]) => (
        <div key={category} className="setting-group" style={{ marginBottom: 12 }}>
          <div className="setting-group-title" style={{ textTransform: 'capitalize' }}>{category}</div>
          {typeof settings === 'object' && Object.entries(settings).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{key.replace(/_/g, ' ')}</span>
              <span style={{ fontWeight: 500 }}>{String(value)}</span>
            </div>
          ))}
        </div>
      ))}

      <div className="setting-group" style={{ marginTop: 12 }}>
        <div className="setting-group-title">Features (per plan)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: 13 }}>
          {['vehicles:read', 'vehicles:write', 'geofence', 'deviation_alerts', 'ai_reports', 'api_access', 'webhooks', 'priority_support'].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
              <Check size={12} style={{ color: '#22c55e' }} />
              <span>{f.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepReview({ formData }) {
  const plan = PLANS.find(p => p.id === formData.subscription.plan);
  return (
    <div>
      <div className="wizard-section-title">Review All Details</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Tenant Info */}
        <div className="setting-group">
          <div className="setting-group-title">Tenant Information</div>
          <ReviewRow label="Company" value={formData.tenant.name} />
          <ReviewRow label="Slug" value={formData.tenant.slug} />
          <ReviewRow label="Region" value={formData.tenant.region} />
          <ReviewRow label="Industry" value={formData.tenant.industry} />
          <ReviewRow label="Email" value={formData.tenant.contactEmail} />
          {formData.tenant.phone && <ReviewRow label="Phone" value={formData.tenant.phone} />}
        </div>

        {/* Subscription */}
        <div className="setting-group">
          <div className="setting-group-title">Subscription</div>
          <ReviewRow label="Plan" value={formData.subscription.plan} />
          <ReviewRow label="Price" value={plan?.price || '—'} />
          <ReviewRow label="Devices" value={`${plan?.devices || 0} units`} />
          <ReviewRow label="Users" value={`${plan?.users || 0}`} />
          <ReviewRow label="Start Date" value={formData.subscription.startDate} />
        </div>

        {/* Admin User */}
        <div className="setting-group">
          <div className="setting-group-title">Admin User</div>
          <ReviewRow label="Name" value={formData.admin.name} />
          <ReviewRow label="Email" value={formData.admin.email} />
          <ReviewRow label="Role" value={formData.admin.role.replace(/_/g, ' ')} />
        </div>

        {/* Configuration */}
        <div className="setting-group">
          <div className="setting-group-title">Configuration</div>
          <ReviewRow label="Settings" value="28 default settings" />
          <ReviewRow label="Features" value="10 feature flags" />
          <ReviewRow label="Status" value={formData.activate ? 'Will be ACTIVE' : 'Will be PENDING'} />
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
