import React from 'react';
import {
  LayoutDashboard,
  Map,
  AlertTriangle,
  Bus,
  FileBarChart,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard,  label: 'Dashboard' },
  { id: 'map',       icon: Map,              label: 'Live Tracking' },
  { id: 'incidents', icon: AlertTriangle,    label: 'Incidents & Alerts' },
  { id: 'fleet',     icon: Bus,              label: 'Fleet & Drivers' },
  { id: 'reports',   icon: FileBarChart,     label: 'Reports & Audit' },
  { id: 'settings',  icon: Settings,         label: 'Tenant Settings' },
];

// Roles that can access the portal
const PORTAL_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_FINANCE', 'TENANT_AUDITOR'];

export default function Sidebar({ activePage, onNavigate, collapsed, onToggleCollapse, onTestEmergency, user }) {
  const canSeePortal = PORTAL_ROLES.includes(user?.role);

  return (
    <nav className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Toggle Button */}
      <button
        className="sidebar-toggle"
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <div className="sidebar-nav-list">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            id={`nav-${id}`}
            className={`nav-item${activePage === id ? ' active' : ''}`}
            onClick={() => onNavigate(id)}
            title={label}
          >
            <Icon size={20} className="nav-item-icon" />
            {!collapsed && <span className="nav-item-label">{label}</span>}
          </button>
        ))}

        {/* Portal Access - only for roles with portal access */}
        {canSeePortal && (
          <button
            id="nav-portal"
            className={`nav-item nav-item-portal${activePage.startsWith('portal') ? ' active' : ''}`}
            onClick={() => onNavigate('portal-dashboard')}
            title="Tenant Portal"
          >
            <LayoutDashboard size={20} className="nav-item-icon" />
            {!collapsed && <span className="nav-item-label">Tenant Portal</span>}
          </button>
        )}
      </div>

      <div className="nav-spacer" />

      {/* Simulate Panic Button */}
      <button
        id="nav-emergency-test"
        className="nav-emergency-btn"
        onClick={onTestEmergency}
        title="Simulate Emergency Alert"
      >
        <AlertTriangle size={18} />
        {!collapsed && <span className="nav-item-label">PANIC</span>}
      </button>
    </nav>
  );
}
