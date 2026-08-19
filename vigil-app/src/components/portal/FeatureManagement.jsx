import React, { useState, useEffect, useCallback } from 'react';
import {
  Puzzle, ToggleLeft, ToggleRight, Settings, Info, Loader2, AlertCircle, Check,
  Lock, Unlock,
} from 'lucide-react';

const BACKEND_URL = '';

const FEATURE_LABELS = {
  'vehicles:read': { label: 'Vehicle Read', desc: 'View vehicle data and status' },
  'vehicles:write': { label: 'Vehicle Write', desc: 'Create, update, delete vehicles' },
  'geofence': { label: 'Geofencing', desc: 'Create and manage geofence zones' },
  'deviation_alerts': { label: 'Deviation Alerts', desc: 'Route deviation detection and alerts' },
  'ai_reports': { label: 'AI Reports', desc: 'AI-powered analytics and reports' },
  'api_access': { label: 'API Access', desc: 'External API integration' },
  'webhooks': { label: 'Webhooks', desc: 'Webhook notifications for events' },
  'priority_support': { label: 'Priority Support', desc: 'Dedicated support channel' },
  'custom_branding': { label: 'Custom Branding', desc: 'White-label UI customization' },
  'advanced_analytics': { label: 'Advanced Analytics', desc: 'Advanced dashboard and analytics' },
};

export default function FeatureManagement({ user }) {
  const [featuresData, setFeaturesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);
  const [message, setMessage] = useState(null);
  const [editingFeature, setEditingFeature] = useState(null);

  const tenantId = user?.tenantId;
  const token = localStorage.getItem('vigil_access_token');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const fetchFeatures = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/tenants/${tenantId}/features`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setFeaturesData(data.data);
      }
    } catch (e) {
      // Fallback demo data
      setFeaturesData({
        plan: 'ENTERPRISE',
        features: [
          { feature: 'vehicles:read', enabled: true, availableByPlan: true },
          { feature: 'vehicles:write', enabled: true, availableByPlan: true },
          { feature: 'geofence', enabled: true, availableByPlan: true, config: { max_geofences: 100 } },
          { feature: 'deviation_alerts', enabled: true, availableByPlan: true },
          { feature: 'ai_reports', enabled: true, availableByPlan: true, config: { max_reports_per_day: 100 } },
          { feature: 'api_access', enabled: true, availableByPlan: true, config: { rate_limit: 10000 } },
          { feature: 'webhooks', enabled: false, availableByPlan: true },
          { feature: 'priority_support', enabled: false, availableByPlan: true },
          { feature: 'custom_branding', enabled: false, availableByPlan: true },
          { feature: 'advanced_analytics', enabled: false, availableByPlan: true },
        ],
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, token]);

  useEffect(() => { fetchFeatures(); }, [fetchFeatures]);

  const handleToggle = async (feature, enabled) => {
    if (!isSuperAdmin || !tenantId) return;
    setToggling(feature);
    setMessage(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/tenants/${tenantId}/features/${feature}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.success) {
        setFeaturesData(prev => ({
          ...prev,
          features: prev.features.map(f =>
            f.feature === feature ? { ...f, enabled } : f
          ),
        }));
        setMessage({ type: 'success', text: `${FEATURE_LABELS[feature]?.label || feature} ${enabled ? 'enabled' : 'disabled'}` });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to toggle feature' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setToggling(null);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) {
    return <div className="portal-page"><div className="portal-loading">Loading features...</div></div>;
  }

  const features = featuresData?.features || [];
  const plan = featuresData?.plan || 'TRIAL';

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <div>
          <h1 className="portal-page-title">Feature Management</h1>
          <p className="portal-page-subtitle">Toggle features and configure limits for your tenant</p>
        </div>
        <div className="portal-page-header-actions">
          <span className="badge badge-blue">
            <Puzzle size={13} /> {plan} Plan
          </span>
        </div>
      </div>

      {message && (
        <div className={`portal-message portal-message-${message.type}`}>
          {message.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
          {message.text}
        </div>
      )}

      <div className="portal-page-body">
        {!isSuperAdmin && (
          <div className="portal-info-banner">
            <Info size={16} />
            <span>Only Super Admin can toggle features. Contact your administrator to make changes.</span>
          </div>
        )}

        <div className="feature-table-wrap">
          <table className="feature-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Status</th>
                <th>Plan Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {features.map(({ feature, enabled, availableByPlan, config }) => {
                const meta = FEATURE_LABELS[feature] || { label: feature, desc: '' };
                const isToggling = toggling === feature;

                return (
                  <tr key={feature} className={!availableByPlan ? 'feature-row-unavailable' : ''}>
                    <td>
                      <div className="feature-name-cell">
                        <div className="feature-name">{meta.label}</div>
                        <div className="feature-desc">{meta.desc}</div>
                      </div>
                    </td>
                    <td>
                      <span className={`feature-status ${enabled ? 'on' : 'off'}`}>
                        {enabled ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td>
                      {availableByPlan ? (
                        <span className="badge badge-green"><Unlock size={11} /> Included</span>
                      ) : (
                        <span className="badge badge-amber"><Lock size={11} /> Upgrade Required</span>
                      )}
                    </td>
                    <td>
                      <div className="feature-actions">
                        {isSuperAdmin && availableByPlan && (
                          <button
                            className={`btn btn-sm ${enabled ? 'btn-danger-outline' : 'btn-success'}`}
                            onClick={() => handleToggle(feature, !enabled)}
                            disabled={isToggling}
                          >
                            {isToggling ? (
                              <Loader2 size={13} className="spin" />
                            ) : enabled ? (
                              <><ToggleLeft size={13} /> Disable</>
                            ) : (
                              <><ToggleRight size={13} /> Enable</>
                            )}
                          </button>
                        )}

                        {config && Object.keys(config).length > 0 && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditingFeature(editingFeature === feature ? null : feature)}
                          >
                            <Settings size={13} /> Config
                          </button>
                        )}
                      </div>

                      {/* Inline config display */}
                      {editingFeature === feature && config && (
                        <div className="feature-config-panel">
                          {Object.entries(config).map(([key, val]) => (
                            <div key={key} className="feature-config-row">
                              <span className="feature-config-key">{key}</span>
                              <span className="feature-config-value">
                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="portal-info-footer">
          <Info size={14} />
          <span>Some features require a plan upgrade. Contact sales to unlock premium features.</span>
        </div>
      </div>
    </div>
  );
}
