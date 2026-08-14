import React, { useState, useEffect } from 'react';
import { Bus, Users, AlertTriangle, Shield, CreditCard, Key, AlertCircle, ArrowUpCircle } from 'lucide-react';

const BACKEND_URL = '';

export default function PortalDashboard({ user: _user }) {
  const [stats, setStats] = useState(null);
  const [recentIncidents, setRecentIncidents] = useState([]);
  const [recentAuth, setRecentAuth] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${BACKEND_URL}/api/v1/portal/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setStats(data.data.stats);
        setRecentIncidents(data.data.recentIncidents || []);
        setRecentAuth(data.data.recentAuthEvents || []);
      }
    } catch (e) {
      // Fallback demo data
      setStats({
        totalVehicles: 5, activeVehicles: 5, warningVehicles: 0, emergencyVehicles: 0,
        totalDrivers: 5, totalUsers: 8, activeUsers: 8,
        totalIncidents: 0, activeIncidents: 0, resolvedIncidents: 0,
        totalTokens: 5, activeTokens: 5,
        subscription: { planTier: 'ENTERPRISE', status: 'ACTIVE', pricePerMonth: 45000000, deviceLimit: 100 },
        deviceUsagePercent: 5,
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="portal-page"><div className="portal-loading">Loading dashboard...</div></div>;
  }

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <div>
          <h1 className="portal-page-title">Tenant Dashboard</h1>
          <p className="portal-page-subtitle">Overview of your workspace and subscription</p>
        </div>
        <div className="portal-page-header-actions">
          <span className="badge badge-green">
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            {stats?.subscription?.planTier || 'BASIC'} Plan
          </span>
        </div>
      </div>

      <div className="portal-page-body">
        {/* KPI Cards */}
        <div className="portal-kpi-grid">
          <div className="portal-kpi-card">
            <div className="portal-kpi-icon" style={{ background: 'var(--accent-blue-subtle)', color: 'var(--accent-blue)' }}>
              <Bus size={20} />
            </div>
            <div className="portal-kpi-info">
              <div className="portal-kpi-value">{stats?.totalVehicles || 0}</div>
              <div className="portal-kpi-label">Total Vehicles</div>
            </div>
            <div className="portal-kpi-sub">
              <span style={{ color: 'var(--status-green)' }}>{stats?.activeVehicles || 0} active</span>
            </div>
          </div>

          <div className="portal-kpi-card">
            <div className="portal-kpi-icon" style={{ background: 'var(--status-green-subtle)', color: 'var(--status-green)' }}>
              <Users size={20} />
            </div>
            <div className="portal-kpi-info">
              <div className="portal-kpi-value">{stats?.totalUsers || 0}</div>
              <div className="portal-kpi-label">Team Members</div>
            </div>
            <div className="portal-kpi-sub">
              <span style={{ color: 'var(--status-green)' }}>{stats?.activeUsers || 0} active</span>
            </div>
          </div>

          <div className="portal-kpi-card">
            <div className="portal-kpi-icon" style={{ background: 'var(--status-red-subtle)', color: 'var(--status-red)' }}>
              <AlertTriangle size={20} />
            </div>
            <div className="portal-kpi-info">
              <div className="portal-kpi-value">{stats?.activeIncidents || 0}</div>
              <div className="portal-kpi-label">Active Incidents</div>
            </div>
            <div className="portal-kpi-sub">
              <span style={{ color: 'var(--text-muted)' }}>{stats?.resolvedIncidents || 0} resolved</span>
            </div>
          </div>

          <div className="portal-kpi-card">
            <div className="portal-kpi-icon" style={{ background: 'var(--status-amber-subtle)', color: 'var(--status-amber)' }}>
              <Key size={20} />
            </div>
            <div className="portal-kpi-info">
              <div className="portal-kpi-value">{stats?.activeTokens || 0}<span className="portal-kpi-unit">/{stats?.subscription?.deviceLimit || 0}</span></div>
              <div className="portal-kpi-label">Device Tokens</div>
            </div>
            <div className="portal-kpi-sub">
              <div className="portal-progress-bar">
                <div className="portal-progress-fill" style={{ width: `${stats?.deviceUsagePercent || 0}%` }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{stats?.deviceUsagePercent || 0}%</span>
            </div>
          </div>
        </div>

        {/* Warning Card when approaching device limit */}
        {stats?.deviceUsagePercent >= 80 && (
          <div className="portal-warning-card" style={{
            background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.1) 0%, rgba(250, 204, 21, 0.05) 100%)',
            border: '1px solid rgba(250, 204, 21, 0.3)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <div style={{
              background: 'rgba(250, 204, 21, 0.15)',
              borderRadius: 10,
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <AlertCircle size={22} style={{ color: 'var(--status-amber)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                Approaching Device Limit
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                You're using {stats.activeTokens || 0} of {stats?.subscription?.deviceLimit || 0} device tokens ({stats.deviceUsagePercent}%).
                {stats.deviceUsagePercent >= 95
                  ? ' Critical: Consider upgrading immediately to avoid service disruption.'
                  : ' Upgrade your plan to add more devices.'}
              </div>
            </div>
            <button className="btn btn-sm" style={{
              background: 'var(--status-amber)',
              color: '#000',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              <ArrowUpCircle size={14} /> Upgrade Plan
            </button>
          </div>
        )}

        {/* Bottom Grid */}
        <div className="portal-bottom-grid">
          {/* Subscription Card */}
          <div className="portal-card">
            <div className="portal-card-header">
              <CreditCard size={16} style={{ color: 'var(--accent-blue)' }} />
              <span className="portal-card-title">Subscription</span>
            </div>
            <div className="portal-card-body">
              <div className="portal-sub-info">
                <div className="portal-sub-row">
                  <span>Plan</span>
                  <span className="mono fw-700" style={{ color: 'var(--accent-blue)' }}>{stats?.subscription?.planTier || 'BASIC'}</span>
                </div>
                <div className="portal-sub-row">
                  <span>Monthly Cost</span>
                  <span className="mono fw-700">Rp {((stats?.subscription?.pricePerMonth || 0) / 1000000).toFixed(0)}M</span>
                </div>
                <div className="portal-sub-row">
                  <span>Status</span>
                  <span className="badge badge-green">{stats?.subscription?.status || 'ACTIVE'}</span>
                </div>
                <div className="portal-sub-row">
                  <span>Device Limit</span>
                  <span className="mono">{stats?.subscription?.deviceLimit || 0} units</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Incidents */}
          <div className="portal-card">
            <div className="portal-card-header">
              <AlertTriangle size={16} style={{ color: 'var(--status-red)' }} />
              <span className="portal-card-title">Recent Incidents</span>
            </div>
            <div className="portal-card-body">
              {recentIncidents.length === 0 ? (
                <div className="portal-empty">No incidents recorded</div>
              ) : (
                <div className="portal-list">
                  {recentIncidents.map(inc => (
                    <div key={inc.id} className="portal-list-item">
                      <div>
                        <div className="portal-list-item-title">{inc.id}</div>
                        <div className="portal-list-item-sub">{inc.type} — {inc.vehicleId}</div>
                      </div>
                      <span className={`badge badge-${inc.status === 'RESOLVED' ? 'green' : inc.status === 'ACTIVE' ? 'red' : 'amber'}`}>
                        {inc.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Auth Audit Log */}
          <div className="portal-card">
            <div className="portal-card-header">
              <Shield size={16} style={{ color: 'var(--status-green)' }} />
              <span className="portal-card-title">Login Activity</span>
            </div>
            <div className="portal-card-body">
              {recentAuth.length === 0 ? (
                <div className="portal-empty">No auth events yet</div>
              ) : (
                <div className="portal-list">
                  {recentAuth.slice(0, 5).map(ev => (
                    <div key={ev.id} className="portal-list-item">
                      <div>
                        <div className="portal-list-item-title">{ev.eventType?.replace(/_/g, ' ')}</div>
                        <div className="portal-list-item-sub">{ev.email || ev.userId || 'System'} — {new Date(ev.timestamp).toLocaleTimeString()}</div>
                      </div>
                      <div className={`portal-auth-dot ${ev.success ? 'success' : 'fail'}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
