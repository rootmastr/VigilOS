import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Building2, Users, Bus, AlertTriangle, Settings, Puzzle,
  Play, Pause, Trash2, Loader2, Check, ExternalLink, Shield,
} from 'lucide-react';
import api from '../../services/api';

const STATUS_STYLES = {
  ACTIVE: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', label: 'ACTIVE' },
  PENDING: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', label: 'PENDING' },
  SUSPENDED: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'SUSPENDED' },
  CANCELLED: { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280', label: 'CANCELLED' },
};

export default function TenantDetail({ tenantId, onBack, onManageSettings, onManageFeatures, showToast }) {
  const [tenant, setTenant] = useState(null);
  const [provisionStatus, setProvisionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (tenantId) {
      fetchTenant();
      fetchProvisionStatus();
    }
  }, [tenantId]);

  const fetchTenant = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/v1/tenants/${tenantId}`);
      if (data.success) setTenant(data.data);
    } catch (e) {
      console.error('Failed to fetch tenant:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProvisionStatus = async () => {
    try {
      const { data } = await api.get(`/api/v1/tenants/${tenantId}/provision-status`);
      if (data.success) setProvisionStatus(data.data);
    } catch (e) {
      console.error('Failed to fetch provision status:', e);
    }
  };

  const handleStatusChange = async (newStatus, reason) => {
    setActionLoading(true);
    try {
      const { data } = await api.put(`/api/v1/tenants/${tenantId}/status`, { status: newStatus, reason });
      if (data.success) {
        showToast?.(`Tenant ${newStatus.toLowerCase()}`);
        fetchTenant();
      } else {
        showToast?.(data.error || 'Failed to update status', 'warning');
      }
    } catch (e) {
      showToast?.('Failed to update status', 'warning');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this tenant? This action cannot be undone.')) return;
    setActionLoading(true);
    try {
      const { data } = await api.delete(`/api/v1/tenants/${tenantId}`);
      if (data.success) {
        showToast?.('Tenant deleted');
        onBack?.();
      }
    } catch (e) {
      showToast?.('Failed to delete tenant', 'warning');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        <Loader2 size={24} className="spin" style={{ marginBottom: 8 }} />
        Loading tenant...
      </div>
    );
  }

  if (!tenant) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        Tenant not found
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[tenant.status] || STATUS_STYLES.ACTIVE;
  const stats = tenant.stats || {};
  const sub = tenant.subscription;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={onBack} style={{ padding: 6 }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Building2 size={22} style={{ color: 'var(--accent-blue)' }} />
              {tenant.name}
              <span style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: statusStyle.bg, color: statusStyle.color,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusStyle.color }} />
                {statusStyle.label}
              </span>
            </div>
            <div className="page-subtitle">{tenant.slug} · {tenant.region || 'No region'} · {tenant.planTier}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tenant.status === 'ACTIVE' && (
            <button className="btn btn-ghost" onClick={() => handleStatusChange('SUSPENDED', 'Suspended by admin')} disabled={actionLoading}>
              <Pause size={14} /> Suspend
            </button>
          )}
          {tenant.status === 'SUSPENDED' && (
            <button className="btn btn-primary" onClick={() => handleStatusChange('ACTIVE', 'Reactivated')} disabled={actionLoading}>
              <Play size={14} /> Reactivate
            </button>
          )}
          <button className="btn btn-ghost" style={{ color: 'var(--status-red)' }} onClick={handleDelete} disabled={actionLoading}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { icon: Users, label: 'Users', value: stats.userCount ?? '—', color: 'var(--accent-blue)' },
          { icon: Bus, label: 'Vehicles', value: stats.vehicleCount ?? '—', color: 'var(--accent-green)' },
          { icon: AlertTriangle, label: 'Incidents', value: stats.incidentCount ?? '—', color: 'var(--status-red)' },
          { icon: Shield, label: 'Plan', value: tenant.planTier, color: 'var(--accent-purple)' },
        ].map((item, i) => (
          <div key={i} className="setting-group" style={{ textAlign: 'center', padding: 16 }}>
            <item.icon size={20} style={{ color: item.color, marginBottom: 6 }} />
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{item.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Tenant Info + Provision Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Info */}
        <div className="setting-group">
          <div className="setting-group-title">Tenant Information</div>
          {[
            ['Contact Email', tenant.contactEmail],
            ['Phone', tenant.phone || '—'],
            ['Address', tenant.address || '—'],
            ['Industry', tenant.industry || '—'],
            ['Created', new Date(tenant.createdAt).toLocaleDateString()],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Provision Status */}
        <div className="setting-group">
          <div className="setting-group-title">Provisioning Status</div>
          {provisionStatus ? (
            <div>
              <div style={{ marginBottom: 12, fontSize: 13, color: provisionStatus.complete ? '#22c55e' : '#fbbf24', fontWeight: 600 }}>
                {provisionStatus.complete ? '✓ Fully Provisioned' : '⏳ Incomplete'}
              </div>
              {Object.entries(provisionStatus.checks).map(([key, check]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 500 }}>{check.count ?? (check.exists ? 'Yes' : 'No')}{check.required ? ` / ${check.required}` : ''}</span>
                    {check.ok ? (
                      <Check size={14} style={{ color: '#22c55e' }} />
                    ) : (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>Loading...</div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="setting-group">
        <div className="setting-group-title">Quick Actions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={onManageSettings}>
            <Settings size={14} /> Manage Settings
          </button>
          <button className="btn btn-ghost" onClick={onManageFeatures}>
            <Puzzle size={14} /> Manage Features
          </button>
        </div>
      </div>
    </div>
  );
}
