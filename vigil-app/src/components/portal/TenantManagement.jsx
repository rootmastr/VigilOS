import React, { useState, useEffect } from 'react';
import {
  Building2, Plus, Search, Filter, ChevronRight, Users, Bus,
  AlertCircle, Check, Clock, Ban, Loader2, Trash2, Eye,
} from 'lucide-react';

const BACKEND_URL = '';

const STATUS_STYLES = {
  ACTIVE: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', label: 'ACTIVE' },
  PENDING: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', label: 'PENDING' },
  SUSPENDED: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'SUSPENDED' },
  CANCELLED: { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280', label: 'CANCELLED' },
};

const PLAN_BADGES = {
  TRIAL: { bg: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' },
  STARTER: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' },
  PROFESSIONAL: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981' },
  ENTERPRISE: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
};

export default function TenantManagement({ user, onSelectTenant, onAddNew, showToast }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [stats, setStats] = useState(null);

  useEffect(() => { fetchTenants(); fetchStats(); }, []);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${BACKEND_URL}/api/v1/tenants?take=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setTenants(data.data);
    } catch (e) {
      console.error('Failed to fetch tenants:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${BACKEND_URL}/api/v1/tenants/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  };

  const handleDelete = async (tenantId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this tenant?')) return;
    try {
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${BACKEND_URL}/api/v1/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('Tenant deleted');
        fetchTenants();
        fetchStats();
      }
    } catch (e) {
      showToast?.('Failed to delete tenant', 'warning');
    }
  };

  const filtered = tenants.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'ALL' || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={22} style={{ color: 'var(--accent-blue)' }} />
            Tenant Management
          </div>
          <div className="page-subtitle">Manage all tenants on the platform</div>
        </div>
        <button className="btn btn-primary" onClick={onAddNew}>
          <Plus size={16} /> Add New Tenant
        </button>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="tenant-stats-bar">
          <div className="tenant-stat">
            <div className="tenant-stat-value">{stats.total}</div>
            <div className="tenant-stat-label">Total</div>
          </div>
          <div className="tenant-stat">
            <div className="tenant-stat-value" style={{ color: '#22c55e' }}>{stats.active}</div>
            <div className="tenant-stat-label">Active</div>
          </div>
          <div className="tenant-stat">
            <div className="tenant-stat-value" style={{ color: '#fbbf24' }}>{stats.pending}</div>
            <div className="tenant-stat-label">Pending</div>
          </div>
          <div className="tenant-stat">
            <div className="tenant-stat-value" style={{ color: '#ef4444' }}>{stats.suspended}</div>
            <div className="tenant-stat-label">Suspended</div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="setting-input"
            placeholder="Search tenants by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        <select
          className="setting-input"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING">Pending</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Tenant Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <Loader2 size={24} className="spin" style={{ marginBottom: 8 }} />
          <div>Loading tenants...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <Building2 size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>No tenants found</div>
        </div>
      ) : (
        <div className="setting-group" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Plan</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Region</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tenant => {
                const statusStyle = STATUS_STYLES[tenant.status] || STATUS_STYLES.ACTIVE;
                const planStyle = PLAN_BADGES[tenant.planTier] || PLAN_BADGES.TRIAL;
                return (
                  <tr
                    key={tenant.id}
                    onClick={() => onSelectTenant?.(tenant.id)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', transition: 'background 150ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 8,
                          background: 'var(--accent-blue-subtle)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Building2 size={16} style={{ color: 'var(--accent-blue)' }} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{tenant.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tenant.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: planStyle.bg, color: planStyle.color,
                      }}>
                        {tenant.planTier}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: statusStyle.bg, color: statusStyle.color,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusStyle.color }} />
                        {statusStyle.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{tenant.region || '—'}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={(e) => { e.stopPropagation(); onSelectTenant?.(tenant.id); }}
                        >
                          <Eye size={13} /> View
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: 11, color: 'var(--status-red)' }}
                          onClick={(e) => handleDelete(tenant.id, e)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--text-muted)' }}>
        Showing {filtered.length} of {tenants.length} tenants
      </div>
    </div>
  );
}

const thStyle = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle = {
  padding: '12px 16px',
  fontSize: 13,
};
