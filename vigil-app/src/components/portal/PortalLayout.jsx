import React from 'react';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  FileText,
  Key,
  Shield,
  LogOut,
  ChevronLeft,
  Building2,
} from 'lucide-react';

// Role-based portal page access
const ROLE_PORTAL_ACCESS = {
  SUPER_ADMIN:       ['portal-dashboard', 'portal-team', 'portal-billing', 'portal-sla', 'portal-apikeys'],
  TENANT_ADMIN:      ['portal-dashboard', 'portal-team', 'portal-billing', 'portal-sla', 'portal-apikeys'],
  TENANT_FINANCE:    ['portal-billing'],
  TENANT_DISPATCHER: [],  // No portal access
  TENANT_AUDITOR:    ['portal-sla'],
  COMMAND_CENTER_OPERATOR: [],
  PATROL_OFFICER:    [],
  PUBLIC_USER:       [],
};

const PORTAL_NAV = [
  { id: 'portal-dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['SUPER_ADMIN', 'TENANT_ADMIN'] },
  { id: 'portal-team', icon: Users, label: 'Team & Users', roles: ['SUPER_ADMIN', 'TENANT_ADMIN'] },
  { id: 'portal-billing', icon: CreditCard, label: 'Billing & Plans', roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_FINANCE'] },
  { id: 'portal-sla', icon: FileText, label: 'SLA & Compliance', roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_AUDITOR'] },
  { id: 'portal-apikeys', icon: Key, label: 'API Keys', roles: ['SUPER_ADMIN', 'TENANT_ADMIN'] },
];

export function canAccessPortal(role) {
  const allowed = ROLE_PORTAL_ACCESS[role];
  return allowed && allowed.length > 0;
}

export function canAccessPage(role, pageId) {
  const allowed = ROLE_PORTAL_ACCESS[role];
  return allowed && allowed.includes(pageId);
}

export function getDefaultPortalPage(role) {
  const allowed = ROLE_PORTAL_ACCESS[role];
  if (!allowed || allowed.length === 0) return null;
  return allowed[0];
}

export default function PortalLayout({ activePage, onNavigate, user, onLogout, onSwitchToCommand, children }) {
  const role = user?.role || 'PUBLIC_USER';
  const accessiblePages = PORTAL_NAV.filter(item => item.roles.includes(role));

  return (
    <div className="portal-layout">
      {/* Portal Sidebar */}
      <nav className="portal-sidebar">
        <div className="portal-sidebar-brand">
          <Shield size={22} style={{ color: 'var(--accent-blue)' }} />
          <span className="portal-sidebar-brand-text">VigilOS</span>
          <span className="portal-sidebar-badge">PORTAL</span>
        </div>

        <div className="portal-sidebar-tenant">
          <Building2 size={14} />
          <span className="portal-sidebar-tenant-name">{user?.tenantId || 'N/A'}</span>
        </div>

        {/* Role Badge */}
        <div className="portal-sidebar-role">
          <span className={`portal-role-badge portal-role-badge-${role.toLowerCase().replace(/_/g, '-')}`}>
            {role.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="portal-sidebar-nav">
          {accessiblePages.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={`portal-nav-item${activePage === id ? ' active' : ''}`}
              onClick={() => onNavigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}

          {accessiblePages.length === 0 && (
            <div className="portal-nav-empty">
              No portal pages available for your role
            </div>
          )}
        </div>

        <div className="portal-sidebar-footer">
          <button className="portal-nav-item" onClick={onSwitchToCommand}>
            <ChevronLeft size={18} />
            <span>Command Center</span>
          </button>

          <div className="portal-sidebar-user">
            <div className="portal-user-avatar">
              {user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'U'}
            </div>
            <div className="portal-user-info">
              <span className="portal-user-name">{user?.name || 'User'}</span>
              <span className="portal-user-role">{role.replace(/_/g, ' ')}</span>
            </div>
            <button className="portal-logout-btn" onClick={onLogout} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* Portal Content */}
      <main className="portal-content">
        {children}
      </main>
    </div>
  );
}
