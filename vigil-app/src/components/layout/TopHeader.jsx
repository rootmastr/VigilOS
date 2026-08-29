import React, { useState, useRef, useEffect } from 'react';
import { Users, Bus, Truck, Building2, Wifi, WifiOff, ChevronDown, Check, LogOut, Shield, User, Loader2 } from 'lucide-react';
import api from '../../services/api';

const FALLBACK_TENANTS = [
  { id: 'ws-semarang-01', name: 'Dishub Kota Semarang', region: 'Jawa Tengah', industry: 'Government', planTier: 'ENTERPRISE' },
];

// Roles that can access the portal
const PORTAL_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_FINANCE', 'TENANT_AUDITOR'];

export default function TopHeader({ activeUnits, operatorCount, connected, currentTenant, onTenantSwitch, sidebarCollapsed, user, onLogout, onSwitchToPortal }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [tenants, setTenants] = useState(FALLBACK_TENANTS);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [tenantSearch, setTenantSearch] = useState('');
  const dropdownRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [user]);

  const fetchTenants = async () => {
    const token = localStorage.getItem('vigil_access_token');
    if (!token || !user) return;
    setTenantsLoading(true);
    try {
      if (user?.role === 'SUPER_ADMIN') {
        const { data } = await api.get('/api/v1/tenants', { params: { take: 100 } });
        if (data.success && data.data?.length) setTenants(data.data);
      } else if (user?.tenantId) {
        const { data } = await api.get(`/api/v1/tenants/${user.tenantId}`);
        if (data.success && data.data) setTenants([data.data]);
      }
    } catch (e) {
      // Keep fallback
    } finally {
      setTenantsLoading(false);
    }
  };

  const activeTenant = tenants.find(t => t.id === currentTenant) || tenants[0];
  const TenantIcon = activeTenant?.industry === 'Logistics' ? Truck : Bus;
  const userInitials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'AD';
  const canSeePortal = PORTAL_ROLES.includes(user?.role);
  const canSwitchTenant = user?.role === 'SUPER_ADMIN';

  return (
    <header className="top-header">
      {/* Brand */}
      <div className="header-brand" style={{ width: sidebarCollapsed ? 72 : 72 }}>
        <div className="header-logo">V</div>
        <span className="header-brand-name">VigilOS</span>
      </div>

      <div className="header-divider" />

      {/* Tenant Switcher Dropdown */}
      <div className="tenant-switcher" ref={dropdownRef}>
        <button
          className="tenant-switcher-btn"
          onClick={() => canSwitchTenant && setDropdownOpen(!dropdownOpen)}
          disabled={!canSwitchTenant}
          style={!canSwitchTenant ? { cursor: 'default', opacity: 0.85 } : {}}
        >
          <TenantIcon size={14} />
          <span className="tenant-switcher-name">{activeTenant.name}</span>
          {canSwitchTenant && <ChevronDown size={14} className={`tenant-switcher-chevron${dropdownOpen ? ' open' : ''}`} />}
        </button>

        {dropdownOpen && (
          <div className="tenant-dropdown">
            <div className="tenant-dropdown-header">Switch Workspace</div>
            <input
              className="tenant-search-input"
              placeholder="Search tenants..."
              value={tenantSearch}
              onChange={e => setTenantSearch(e.target.value)}
              autoFocus
            />
            {tenantsLoading ? (
              <div style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                <Loader2 size={14} className="spin" style={{ marginBottom: 4 }} /> Loading...
              </div>
            ) : tenants
              .filter(t => !tenantSearch || t.name.toLowerCase().includes(tenantSearch.toLowerCase()) || (t.region && t.region.toLowerCase().includes(tenantSearch.toLowerCase())))
              .map(tenant => {
                const TenantItemIcon = tenant.industry === 'Logistics' ? Truck : Bus;
              return (
                <button
                  key={tenant.id}
                  className={`tenant-dropdown-item${tenant.id === currentTenant ? ' active' : ''}`}
                  onClick={() => {
                    if (onTenantSwitch) onTenantSwitch(tenant.id);
                    setDropdownOpen(false);
                  }}
                >
                  <TenantItemIcon size={14} />
                  <div className="tenant-dropdown-info">
                    <span className="tenant-dropdown-name">{tenant.name}</span>
                    <span className="tenant-dropdown-region">{tenant.region} — {tenant.industry}</span>
                  </div>
                  {tenant.id === currentTenant && <Check size={14} className="tenant-dropdown-check" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="header-divider" />

      {/* Global Status Pill */}
      <div className="header-status-badge">
        <div className="status-dot" />
        System Healthy
      </div>

      {/* WS Connection */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: connected ? 'var(--status-green)' : 'var(--status-amber)', fontFamily: 'var(--font-mono)' }}>
        {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
        {connected ? 'WS Connected' : 'Connecting...'}
      </div>

      <div className="header-stats">
        {/* Operators Online */}
        <div className="header-stat">
          <Users size={13} className="header-stat-icon" />
          <span>Operators</span>
          <span className="header-stat-value">{operatorCount}</span>
        </div>

        {/* Active Units */}
        <div className="header-stat">
          <Bus size={13} className="header-stat-icon" />
          <span>Active Units</span>
          <span className="header-stat-value">{activeUnits}</span>
        </div>

        {/* Portal Button - only for roles with portal access */}
        {onSwitchToPortal && canSeePortal && (
          <button
            className="header-portal-btn"
            onClick={onSwitchToPortal}
            title="Switch to Tenant Portal"
          >
            <Shield size={13} />
            Portal
          </button>
        )}

        {/* User Avatar + Dropdown */}
        <div className="header-user-menu" ref={userMenuRef}>
          <button
            className="header-avatar"
            title={user?.name || 'Operator: Admin'}
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            {userInitials}
          </button>

          {userMenuOpen && (
            <div className="header-user-dropdown">
              <div className="header-user-dropdown-header">
                <div className="header-user-dropdown-avatar">{userInitials}</div>
                <div>
                  <div className="header-user-dropdown-name">{user?.name || 'Admin'}</div>
                  <div className="header-user-dropdown-email">{user?.email || 'admin@vigilos.id'}</div>
                  <div className="header-user-dropdown-role">{user?.role?.replace(/_/g, ' ') || 'SUPER_ADMIN'}</div>
                </div>
              </div>
              <div className="header-user-dropdown-divider" />
              {onSwitchToPortal && canSeePortal && (
                <button className="header-user-dropdown-item" onClick={() => { setUserMenuOpen(false); onSwitchToPortal(); }}>
                  <Shield size={14} />
                  Tenant Portal
                </button>
              )}
              <button className="header-user-dropdown-item header-user-dropdown-item-danger" onClick={() => { setUserMenuOpen(false); onLogout && onLogout(); }}>
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
