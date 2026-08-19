import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, Globe, Palette, Bell, Shield, Plug, Save, RotateCcw,
  Download, Upload, ChevronDown, AlertCircle, Check, Loader2,
} from 'lucide-react';

const BACKEND_URL = '';

const CATEGORIES = [
  { key: 'general', label: 'General', icon: Globe, description: 'Timezone, language, currency, date format' },
  { key: 'branding', label: 'Branding', icon: Palette, description: 'Logo, theme, colors, company name' },
  { key: 'notifications', label: 'Notifications', icon: Bell, description: 'Email, SMS, push, webhook settings' },
  { key: 'security', label: 'Security', icon: Shield, description: 'MFA, session timeout, IP whitelist, passwords' },
  { key: 'integrations', label: 'Integrations', icon: Plug, description: 'API endpoints, MQTT, storage, maps' },
];

function SettingInput({ setting, value, onChange, disabled }) {
  const { dataType, validation, description, isReadonly } = setting;

  if (dataType === 'boolean') {
    return (
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-label">{description || setting.key}</div>
        </div>
        <button
          className={`toggle-btn ${value ? 'active' : ''}`}
          disabled={disabled || isReadonly}
          onClick={() => onChange(!value)}
        >
          <div className="toggle-thumb" />
        </button>
      </div>
    );
  }

  if (dataType === 'number') {
    return (
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-label">{description || setting.key}</div>
          {validation && (
            <div className="setting-hint">
              {validation.min !== undefined && `Min: ${validation.min}`}
              {validation.min !== undefined && validation.max !== undefined && ' | '}
              {validation.max !== undefined && `Max: ${validation.max}`}
            </div>
          )}
        </div>
        <input
          type="number"
          className="setting-input"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          disabled={disabled || isReadonly}
          min={validation?.min}
          max={validation?.max}
        />
      </div>
    );
  }

  if (dataType === 'array') {
    const displayValue = Array.isArray(value) ? value.join(', ') : '';
    return (
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-label">{description || setting.key}</div>
          <div className="setting-hint">Comma-separated values</div>
        </div>
        <input
          type="text"
          className="setting-input"
          value={displayValue}
          onChange={(e) => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          disabled={disabled || isReadonly}
          placeholder="item1, item2, ..."
        />
      </div>
    );
  }

  if (dataType === 'json') {
    return (
      <div className="setting-row setting-row-json">
        <div className="setting-info">
          <div className="setting-label">{description || setting.key}</div>
        </div>
        <textarea
          className="setting-textarea"
          value={typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '')}
          onChange={(e) => {
            try { onChange(JSON.parse(e.target.value)); }
            catch { /* ignore invalid JSON while typing */ }
          }}
          disabled={disabled || isReadonly}
          rows={4}
        />
      </div>
    );
  }

  // String type
  if (validation?.enum) {
    return (
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-label">{description || setting.key}</div>
        </div>
        <div className="setting-select-wrap">
          <select
            className="setting-select"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || isReadonly}
          >
            {validation.enum.map(opt => (
              <option key={String(opt)} value={String(opt ?? '')}>{opt || '(none)'}</option>
            ))}
          </select>
          <ChevronDown size={14} className="setting-select-icon" />
        </div>
      </div>
    );
  }

  return (
    <div className="setting-row">
      <div className="setting-info">
        <div className="setting-label">{description || setting.key}</div>
        {validation?.pattern && (
          <div className="setting-hint">Pattern: {validation.pattern}</div>
        )}
      </div>
      <input
        type={setting.isSecret ? 'password' : 'text'}
        className="setting-input"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || isReadonly}
        placeholder={setting.isSecret ? '••••••••' : ''}
      />
    </div>
  );
}

export default function TenantSettings({ user }) {
  const [activeCategory, setActiveCategory] = useState('general');
  const [settings, setSettings] = useState({});
  const [editedSettings, setEditedSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [resetting, setResetting] = useState(false);

  const tenantId = user?.tenantId;
  const token = localStorage.getItem('vigil_access_token');

  const fetchSettings = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/tenants/${tenantId}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        setEditedSettings({});
      }
    } catch (e) {
      // Fallback: use defaults
      setSettings({
        general: {
          timezone: { value: 'Asia/Jakarta', dataType: 'string', description: 'Timezone for date/time display', validation: { enum: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] } },
          language: { value: 'id', dataType: 'string', description: 'Interface language', validation: { enum: ['id', 'en'] } },
          currency: { value: 'IDR', dataType: 'string', description: 'Currency for billing display' },
          date_format: { value: 'DD/MM/YYYY', dataType: 'string', description: 'Date display format', validation: { enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] } },
          time_format: { value: '24h', dataType: 'string', description: 'Time display format', validation: { enum: ['12h', '24h'] } },
        },
        branding: {
          logo_url: { value: null, dataType: 'string', description: 'Company logo URL' },
          theme: { value: 'light', dataType: 'string', description: 'UI theme', validation: { enum: ['light', 'dark', 'auto'] } },
          primary_color: { value: '#1E40AF', dataType: 'string', description: 'Primary brand color', validation: { pattern: '^#[0-9A-Fa-f]{6}$' } },
          company_name: { value: '', dataType: 'string', description: 'Company name for reports' },
          footer_text: { value: '', dataType: 'string', description: 'Custom footer text' },
        },
        notifications: {
          email_enabled: { value: true, dataType: 'boolean', description: 'Enable email notifications' },
          sms_enabled: { value: false, dataType: 'boolean', description: 'Enable SMS notifications' },
          push_enabled: { value: true, dataType: 'boolean', description: 'Enable push notifications' },
          webhook_enabled: { value: false, dataType: 'boolean', description: 'Enable webhook notifications' },
          webhook_url: { value: null, dataType: 'string', description: 'Webhook endpoint URL' },
          alert_contacts: { value: [], dataType: 'array', description: 'Email contacts for alerts' },
          escalation_policy: { value: { enabled: false, levels: [] }, dataType: 'json', description: 'Escalation policy for incidents' },
        },
        security: {
          mfa_required: { value: false, dataType: 'boolean', description: 'Require MFA for all users' },
          session_timeout: { value: 30, dataType: 'number', description: 'Session timeout in minutes', validation: { min: 5, max: 480 } },
          ip_whitelist: { value: [], dataType: 'array', description: 'IP whitelist for API access' },
          password_policy: { value: { min_length: 8, require_uppercase: true, require_lowercase: true, require_numbers: true, require_symbols: false, max_age_days: 90 }, dataType: 'json', description: 'Password complexity policy' },
          api_rate_limit: { value: 1000, dataType: 'number', description: 'API rate limit per minute', validation: { min: 100, max: 100000 } },
        },
        integrations: {
          api_endpoint: { value: null, dataType: 'string', description: 'External API endpoint', isReadonly: true },
          mqtt_broker: { value: 'mqtt://localhost:1883', dataType: 'string', description: 'MQTT broker URL' },
          storage_provider: { value: 'local', dataType: 'string', description: 'Storage provider', validation: { enum: ['local', 's3', 'gcs', 'azure'] } },
          storage_bucket: { value: null, dataType: 'string', description: 'Storage bucket name' },
          sms_provider: { value: null, dataType: 'string', description: 'SMS provider', validation: { enum: [null, 'twilio', 'nexmo'] } },
          maps_provider: { value: 'openstreetmap', dataType: 'string', description: 'Maps provider', validation: { enum: ['openstreetmap', 'google', 'mapbox'] } },
        },
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, token]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleValueChange = (category, key, value) => {
    setEditedSettings(prev => ({
      ...prev,
      [category]: { ...prev[category], [key]: value },
    }));
  };

  const handleSave = async () => {
    if (!tenantId || Object.keys(editedSettings).length === 0) return;
    setSaving(true);
    setMessage(null);

    try {
      for (const [category, updates] of Object.entries(editedSettings)) {
        const res = await fetch(`${BACKEND_URL}/api/v1/tenants/${tenantId}/settings/${category}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: updates }),
        });
        const data = await res.json();
        if (!data.success) {
          setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
          setSaving(false);
          return;
        }
      }

      setMessage({ type: 'success', text: 'Settings saved successfully' });
      setEditedSettings({});
      await fetchSettings();
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error saving settings' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleResetCategory = async () => {
    if (!tenantId) return;
    setResetting(true);
    try {
      await fetch(`${BACKEND_URL}/api/v1/tenants/${tenantId}/settings/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: activeCategory }),
      });
      setMessage({ type: 'success', text: `${activeCategory} settings reset to defaults` });
      setEditedSettings(prev => { const n = { ...prev }; delete n[activeCategory]; return n; });
      await fetchSettings();
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to reset settings' });
    } finally {
      setResetting(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleExport = async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/tenants/${tenantId}/settings/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `vigilos-settings-${tenantId}.json`; a.click();
        URL.revokeObjectURL(url);
        setMessage({ type: 'success', text: 'Settings exported' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Export failed' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const hasChanges = Object.keys(editedSettings).length > 0;
  const currentCategorySettings = settings[activeCategory] || {};

  if (loading) {
    return <div className="portal-page"><div className="portal-loading">Loading settings...</div></div>;
  }

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <div>
          <h1 className="portal-page-title">Tenant Settings</h1>
          <p className="portal-page-subtitle">Manage workspace configuration and preferences</p>
        </div>
        <div className="portal-page-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={handleExport} title="Export settings">
            <Download size={15} /> Export
          </button>
          {hasChanges && (
            <button className="btn btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div className={`portal-message portal-message-${message.type}`}>
          {message.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
          {message.text}
        </div>
      )}

      <div className="portal-page-body">
        <div className="settings-layout">
          {/* Category tabs */}
          <div className="settings-sidebar">
            {CATEGORIES.map(({ key, label, icon: Icon, description }) => (
              <button
                key={key}
                className={`settings-tab ${activeCategory === key ? 'active' : ''}`}
                onClick={() => setActiveCategory(key)}
              >
                <Icon size={18} />
                <div className="settings-tab-text">
                  <span className="settings-tab-label">{label}</span>
                  <span className="settings-tab-desc">{description}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Settings panel */}
          <div className="settings-panel">
            <div className="settings-panel-header">
              <h2 className="settings-panel-title">
                {CATEGORIES.find(c => c.key === activeCategory)?.label} Settings
              </h2>
              <div className="settings-panel-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleResetCategory}
                  disabled={resetting}
                  title="Reset to defaults"
                >
                  <RotateCcw size={14} /> {resetting ? 'Resetting...' : 'Reset to Defaults'}
                </button>
              </div>
            </div>

            <div className="settings-list">
              {Object.entries(currentCategorySettings).map(([key, setting]) => (
                <SettingInput
                  key={key}
                  setting={{ ...setting, key }}
                  value={editedSettings[activeCategory]?.[key] ?? setting.value}
                  onChange={(val) => handleValueChange(activeCategory, key, val)}
                />
              ))}

              {Object.keys(currentCategorySettings).length === 0 && (
                <div className="portal-empty">No settings in this category</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
