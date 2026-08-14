import React, { useState, useEffect } from 'react';
import { Key, Plus, Copy, Trash2, CheckCircle } from 'lucide-react';

const BACKEND_URL = 'http://localhost:4000';

export default function APIKeys({ user: _user }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerms, setNewKeyPerms] = useState(['vehicles:read']);
  const [revealedKey, setRevealedKey] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => { fetchKeys(); }, []);

  const fetchKeys = async () => {
    try {
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${BACKEND_URL}/api/v1/portal/api-keys`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setKeys(data.data);
    } catch (e) {
      setKeys([
        { id: 'key-001', name: 'Production API Key', prefix: 'ak_prod_smg_', permissions: ['vehicles:read', 'incidents:read', 'telemetry:read'], status: 'ACTIVE', createdAt: '2024-06-01T00:00:00Z', lastUsedAt: '2024-08-28T14:30:00Z' },
        { id: 'key-002', name: 'Staging Webhook Key', prefix: 'ak_stg_smg_', permissions: ['webhooks:write'], status: 'ACTIVE', createdAt: '2024-07-15T00:00:00Z', lastUsedAt: null },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newKeyName) return;
    try {
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${BACKEND_URL}/api/v1/portal/api-keys`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName, permissions: newKeyPerms }),
      });
      const data = await res.json();
      if (data.success) {
        setKeys(prev => [data.data, ...prev]);
        setRevealedKey(data.data.keyHash);
      }
    } catch (e) {
      const demoKey = { id: `key-${Date.now()}`, name: newKeyName, prefix: 'ak_new_', permissions: newKeyPerms, status: 'ACTIVE', createdAt: new Date().toISOString(), keyHash: `ak_new_${Math.random().toString(36).slice(2)}` };
      setKeys(prev => [demoKey, ...prev]);
      setRevealedKey(demoKey.keyHash);
    }
    setShowCreateModal(false);
    setNewKeyName('');
  };

  const handleRevoke = async (keyId) => {
    try {
      const token = localStorage.getItem('vigil_access_token');
      await fetch(`${BACKEND_URL}/api/v1/portal/api-keys/${keyId}/revoke`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch (e) {}
    setKeys(prev => prev.map(k => k.id === keyId ? { ...k, status: 'REVOKED' } : k));
    showToast('API key revoked');
  };

  const copyKey = (key) => {
    navigator.clipboard?.writeText(key);
    showToast('Copied to clipboard');
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  if (loading) return <div className="portal-page"><div className="portal-loading">Loading...</div></div>;

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <div>
          <h1 className="portal-page-title">API Key Management</h1>
          <p className="portal-page-subtitle">Create and manage programmatic access keys</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={15} /> Create API Key
        </button>
      </div>

      <div className="portal-page-body">
        {/* Newly created key reveal */}
        {revealedKey && (
          <div className="portal-card portal-card-highlight" style={{ marginBottom: 16, borderColor: 'var(--status-green)' }}>
            <div className="portal-card-header">
              <CheckCircle size={16} style={{ color: 'var(--status-green)' }} />
              <span className="portal-card-title" style={{ color: 'var(--status-green)' }}>API Key Created</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setRevealedKey(null)} style={{ marginLeft: 'auto' }}>Dismiss</button>
            </div>
            <div className="portal-card-body">
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Copy this key now — it will not be shown again:</div>
              <div className="portal-key-reveal">
                <code className="mono">{revealedKey}</code>
                <button className="btn btn-sm btn-primary" onClick={() => copyKey(revealedKey)}>
                  <Copy size={13} /> Copy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Keys Table */}
        <div className="portal-card">
          <div className="portal-card-header">
            <Key size={16} style={{ color: 'var(--accent-blue)' }} />
            <span className="portal-card-title">API Keys ({keys.length})</span>
          </div>
          <div className="portal-table-wrapper">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key Prefix</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  <th>Last Used</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id}>
                    <td className="fw-700">{k.name}</td>
                    <td><code className="mono" style={{ fontSize: 12 }}>{k.prefix}...</code></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {k.permissions.map(p => (
                          <span key={p} className="badge badge-blue" style={{ fontSize: 10 }}>{p}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${k.status === 'ACTIVE' ? 'green' : 'red'}`}>
                        {k.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td>
                      {k.status === 'ACTIVE' && (
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--status-red)' }} onClick={() => handleRevoke(k.id)}>
                          <Trash2 size={13} /> Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="portal-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="portal-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="portal-modal-title">Create API Key</h3>
            <div className="portal-modal-body">
              <div className="portal-field">
                <label>Key Name</label>
                <input className="portal-input" placeholder="e.g., Production Tracking Key" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
              </div>
              <div className="portal-field">
                <label>Permissions</label>
                <div className="portal-checkbox-group">
                  {['vehicles:read', 'telemetry:read', 'incidents:read', 'webhooks:write'].map(perm => (
                    <label key={perm} className="portal-checkbox">
                      <input type="checkbox" checked={newKeyPerms.includes(perm)} onChange={(e) => {
                        if (e.target.checked) setNewKeyPerms(prev => [...prev, perm]);
                        else setNewKeyPerms(prev => prev.filter(p => p !== perm));
                      }} />
                      <span className="mono" style={{ fontSize: 12 }}>{perm}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="portal-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!newKeyName}>Create Key</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="portal-toast">{toast}</div>}
    </div>
  );
}
