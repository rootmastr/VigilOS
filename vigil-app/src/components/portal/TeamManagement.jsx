import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, Mail, CheckCircle, XCircle } from 'lucide-react';

const BACKEND_URL = 'http://localhost:4000';

export default function TeamManagement({ user }) {
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmUser, setConfirmUser] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('TENANT_DISPATCHER');
  const [toast, setToast] = useState('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const token = localStorage.getItem('vigil_access_token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const [usersRes, invRes, rolesRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/v1/portal/users`, { headers }),
        fetch(`${BACKEND_URL}/api/v1/portal/invitations`, { headers }),
        fetch(`${BACKEND_URL}/api/v1/portal/roles`, { headers }),
      ]);
      const [usersData, invData, rolesData] = await Promise.all([
        usersRes.json(), invRes.json(), rolesRes.json(),
      ]);
      if (usersData.success) setUsers(usersData.data);
      if (invData.success) setInvitations(invData.data);
      if (rolesData.success) setRoles(rolesData.data);
    } catch (e) {
      // Demo fallback
      setUsers([
        { id: 'usr-01', name: 'Cmdr. Rahmat', email: 'admin@vigilos.id', role: 'SUPER_ADMIN', status: 'ACTIVE' },
        { id: 'usr-02', name: 'Operator 04', email: 'operator@vigilos.id', role: 'COMMAND_CENTER_OPERATOR', status: 'ACTIVE' },
        { id: 'usr-05', name: 'Rina Wulandari', email: 'rina@semarang.go.id', role: 'TENANT_FINANCE', status: 'ACTIVE', isMfaEnabled: true },
      ]);
      setRoles([
        { id: 'role-super-admin', name: 'SUPER_ADMIN', description: 'Global access' },
        { id: 'role-tenant-admin', name: 'TENANT_ADMIN', description: 'Full tenant access' },
        { id: 'role-tenant-finance', name: 'TENANT_FINANCE', description: 'Billing access' },
        { id: 'role-tenant-dispatcher', name: 'TENANT_DISPATCHER', description: 'Command Center only' },
        { id: 'role-tenant-auditor', name: 'TENANT_AUDITOR', description: 'Read-only audit' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;
    try {
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${BACKEND_URL}/api/v1/portal/users/invite`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (data.success) {
        setInvitations(prev => [data.data, ...prev]);
        setShowInviteModal(false);
        setInviteEmail('');
        showToast('Invitation sent successfully');
      }
    } catch (e) {
      showToast('Invitation sent (demo mode)');
      setShowInviteModal(false);
    }
  };

  const handleSuspend = async (userId) => {
    setConfirmUser(users.find(u => u.id === userId));
    setConfirmAction('suspend');
    setShowConfirmModal(true);
  };

  const handleActivate = async (userId) => {
    setConfirmUser(users.find(u => u.id === userId));
    setConfirmAction('activate');
    setShowConfirmModal(true);
  };

  const executeConfirmAction = async () => {
    if (!confirmUser) return;
    const userId = confirmUser.id;

    if (confirmAction === 'suspend') {
      try {
        const token = localStorage.getItem('vigil_access_token');
        await fetch(`${BACKEND_URL}/api/v1/portal/users/${userId}/suspend`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch (e) {}
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'SUSPENDED' } : u));
      showToast('User suspended');
    } else {
      try {
        const token = localStorage.getItem('vigil_access_token');
        await fetch(`${BACKEND_URL}/api/v1/portal/users/${userId}/activate`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch (e) {}
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'ACTIVE' } : u));
      showToast('User activated');
    }

    setShowConfirmModal(false);
    setConfirmUser(null);
    setConfirmAction(null);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const roleColor = (role) => {
    const map = { SUPER_ADMIN: 'red', TENANT_ADMIN: 'blue', TENANT_FINANCE: 'amber', TENANT_DISPATCHER: 'green', TENANT_AUDITOR: 'blue', COMMAND_CENTER_OPERATOR: 'green', PATROL_OFFICER: 'green', PUBLIC_USER: 'blue' };
    return map[role] || 'blue';
  };

  if (loading) return <div className="portal-page"><div className="portal-loading">Loading...</div></div>;

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <div>
          <h1 className="portal-page-title">Team & User Management</h1>
          <p className="portal-page-subtitle">Manage team members, roles, and invitations</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowInviteModal(true)}>
          <UserPlus size={15} /> Invite User
        </button>
      </div>

      <div className="portal-page-body">
        {/* Users Table */}
        <div className="portal-card" style={{ marginBottom: 16 }}>
          <div className="portal-card-header">
            <Users size={16} style={{ color: 'var(--accent-blue)' }} />
            <span className="portal-card-title">Team Members ({users.length})</span>
          </div>
          <div className="portal-table-wrapper">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>MFA</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="portal-table-user">
                        <div className="portal-table-avatar">{u.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                        <div>
                          <div className="portal-table-user-name">{u.name}</div>
                          <div className="portal-table-user-email">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge badge-${roleColor(u.role)}`}>{u.role?.replace(/_/g, ' ')}</span></td>
                    <td>
                      <span className={`badge badge-${u.status === 'ACTIVE' ? 'green' : 'red'}`}>
                        {u.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td>{u.isMfaEnabled ? <CheckCircle size={14} style={{ color: 'var(--status-green)' }} /> : <XCircle size={14} style={{ color: 'var(--text-faint)' }} />}</td>
                    <td>
                      {u.status === 'SUSPENDED' ? (
                        <button className="btn btn-sm btn-primary" onClick={() => handleActivate(u.id)}>Activate</button>
                      ) : u.id !== user?.id ? (
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--status-red)' }} onClick={() => handleSuspend(u.id)}>Suspend</button>
                      ) : (
                        <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>Current user</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div className="portal-card">
            <div className="portal-card-header">
              <Mail size={16} style={{ color: 'var(--status-amber)' }} />
              <span className="portal-card-title">Pending Invitations ({invitations.filter(i => i.status === 'PENDING').length})</span>
            </div>
            <div className="portal-card-body">
              {invitations.filter(i => i.status === 'PENDING').map(inv => (
                <div key={inv.id} className="portal-list-item">
                  <div>
                    <div className="portal-list-item-title">{inv.email}</div>
                    <div className="portal-list-item-sub">{inv.role?.replace(/_/g, ' ')} — expires {new Date(inv.expiresAt).toLocaleDateString()}</div>
                  </div>
                  <span className="badge badge-amber">Pending</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Roles Reference */}
        <div className="portal-card" style={{ marginTop: 16 }}>
          <div className="portal-card-header">
            <Shield size={16} style={{ color: 'var(--accent-blue)' }} />
            <span className="portal-card-title">Available Roles</span>
          </div>
          <div className="portal-card-body">
            <div className="portal-roles-grid">
              {roles.map(r => (
                <div key={r.id} className="portal-role-card">
                  <div className="portal-role-name">{r.name?.replace(/_/g, ' ')}</div>
                  <div className="portal-role-desc">{r.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="portal-modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="portal-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="portal-modal-title">Invite Team Member</h3>
            <div className="portal-modal-body">
              <div className="portal-field">
                <label>Email Address</label>
                <input type="email" className="portal-input" placeholder="colleague@organization.gov.id" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </div>
              <div className="portal-field">
                <label>Role</label>
                <select className="portal-select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="TENANT_DISPATCHER">Dispatcher (Command Center access)</option>
                  <option value="TENANT_FINANCE">Finance (Billing access)</option>
                  <option value="TENANT_AUDITOR">Auditor (Read-only audit)</option>
                  <option value="TENANT_ADMIN">Admin (Full tenant access)</option>
                </select>
              </div>
            </div>
            <div className="portal-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowInviteModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleInvite}>Send Invitation</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="portal-modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="portal-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="portal-modal-title">
              {confirmAction === 'suspend' ? 'Suspend User' : 'Activate User'}
            </h3>
            <div className="portal-modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                {confirmAction === 'suspend'
                  ? `Are you sure you want to suspend ${confirmUser?.name}? They will lose access to the platform until reactivated.`
                  : `Are you sure you want to activate ${confirmUser?.name}? They will regain full access to the platform.`}
              </p>
            </div>
            <div className="portal-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button
                className={`btn ${confirmAction === 'suspend' ? 'btn-danger' : 'btn-success'}`}
                onClick={executeConfirmAction}
              >
                {confirmAction === 'suspend' ? 'Suspend User' : 'Activate User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="portal-toast">{toast}</div>}
    </div>
  );
}
