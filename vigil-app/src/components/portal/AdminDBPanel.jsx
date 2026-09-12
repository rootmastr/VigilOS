import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

const cardStyle = {
  background: '#1a1f2e',
  border: '1px solid #2a3042',
  borderRadius: 12,
  padding: 24,
  marginBottom: 16,
};

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: '#0f1219',
  border: '1px solid #2a3042',
  borderRadius: 8,
  color: '#e5e7eb',
  fontSize: 14,
  outline: 'none',
};

const btnPrimary = {
  padding: '8px 18px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
};

const btnDanger = {
  padding: '6px 14px',
  background: '#dc2626',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

const btnSmall = {
  padding: '4px 10px',
  background: '#374151',
  color: '#e5e7eb',
  border: '1px solid #4b5563',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '2px solid #2a3042',
  color: '#9ca3af',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};

const tdStyle = {
  padding: '10px 12px',
  borderBottom: '1px solid #1f2937',
  color: '#e5e7eb',
  fontSize: 13,
  maxWidth: 200,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle = {
  background: '#1a1f2e',
  border: '1px solid #2a3042',
  borderRadius: 16,
  padding: 32,
  width: '90%',
  maxWidth: 600,
  maxHeight: '80vh',
  overflow: 'auto',
  color: '#e5e7eb',
};

const statusBadge = (val) => {
  const colors = {
    ACTIVE: '#10b981',
    REVOKED: '#ef4444',
    EXPIRED: '#f59e0b',
    SUSPENDED: '#f97316',
    ONLINE: '#10b981',
    OFFLINE: '#6b7280',
    RESOLVED: '#10b981',
    OPEN: '#3b82f6',
    PENDING: '#f59e0b',
  };
  const bg = colors[val] || '#6b7280';
  return (
    <span style={{ background: bg + '22', color: bg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
      {val}
    </span>
  );
};

export default function AdminDBPanel() {
  const [tables, setTables] = useState([]);
  const [activeTable, setActiveTable] = useState('users');
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [editData, setEditData] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({});
  const [tableConfig, setTableConfig] = useState(null);
  const [error, setError] = useState('');

  const fetchTables = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/admin/db/tables');
      if (data.success) setTables(data.data);
    } catch (err) {
      console.error('Failed to load tables:', err);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        pageSize: pagination.pageSize,
        sort,
        order: sortOrder,
      });
      if (search) params.set('search', search);

      const { data } = await api.get(`/api/v1/admin/db/${activeTable}?${params}`);
      if (data.success) {
        setRecords(data.data);
        setPagination(data.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [activeTable, pagination.page, pagination.pageSize, search, sort, sortOrder]);

  useEffect(() => { fetchTables(); }, [fetchTables]);
  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  useEffect(() => {
    const tbl = tables.find((t) => t.id === activeTable);
    setTableConfig(tbl || null);
  }, [activeTable, tables]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (col) => {
    if (sort === col) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(col);
      setSortOrder('asc');
    }
  };

  const handleEdit = (record) => {
    setEditRecord(record);
    const data = {};
    Object.keys(record).forEach((k) => {
      if (k === 'tokenHash' || k === 'keyHash') return;
      const val = record[k];
      data[k] = val === null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
    });
    setEditData(data);
  };

  const handleSaveEdit = async () => {
    try {
      const payload = {};
      Object.entries(editData).forEach(([k, v]) => {
        if (k === 'id' || k === 'createdAt') return;
        if (v === '' || v === undefined) {
          payload[k] = null;
        } else if (!isNaN(v) && v !== '') {
          payload[k] = Number(v);
        } else if (v === 'true') {
          payload[k] = true;
        } else if (v === 'false') {
          payload[k] = false;
        } else {
          try { payload[k] = JSON.parse(v); } catch { payload[k] = v; }
        }
      });
      await api.put(`/api/v1/admin/db/${activeTable}/${editRecord.id}`, payload);
      setEditRecord(null);
      fetchRecords();
      fetchTables();
    } catch (err) {
      alert('Update failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/admin/db/${activeTable}/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchRecords();
      fetchTables();
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCreate = async () => {
    try {
      const payload = {};
      Object.entries(createData).forEach(([k, v]) => {
        if (v === '' || v === undefined) return;
        if (!isNaN(v)) {
          payload[k] = Number(v);
        } else if (v === 'true') {
          payload[k] = true;
        } else if (v === 'false') {
          payload[k] = false;
        } else {
          try { payload[k] = JSON.parse(v); } catch { payload[k] = v; }
        }
      });
      await api.post(`/api/v1/admin/db/${activeTable}`, payload);
      setShowCreate(false);
      setCreateData({});
      fetchRecords();
      fetchTables();
    } catch (err) {
      alert('Create failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const getColumns = () => {
    if (!tableConfig) return [];
    const colMap = {
      users: ['id', 'email', 'name', 'role', 'status', 'tenantId', 'createdAt'],
      vehicles: ['id', 'code', 'name', 'type', 'status', 'driver', 'tenantId', 'createdAt'],
      drivers: ['id', 'name', 'licenseNo', 'phone', 'vehicleId', 'status', 'tenantId', 'createdAt'],
      officers: ['id', 'name', 'badgeNumber', 'rank', 'status', 'tenantId', 'createdAt'],
      incidents: ['id', 'type', 'severity', 'status', 'vehicleId', 'tenantId', 'createdAt'],
      device_tokens: ['id', 'deviceId', 'tokenHash', 'status', 'tenantId', 'createdAt'],
      api_keys: ['id', 'name', 'keyHash', 'status', 'tenantId', 'createdAt'],
      audit_logs: ['id', 'userId', 'action', 'resource', 'resourceId', 'tenantId', 'createdAt'],
      security_events: ['id', 'eventType', 'deviceId', 'ipAddress', 'createdAt'],
      tenants: ['id', 'name', 'slug', 'status', 'plan', 'createdAt'],
      subscriptions: ['id', 'tenantId', 'plan', 'status', 'pricePerMonth', 'createdAt'],
      invoices: ['id', 'tenantId', 'amount', 'currency', 'status', 'issuedAt'],
      invitations: ['id', 'email', 'role', 'status', 'tenantId', 'createdAt'],
      field_reports: ['id', 'title', 'type', 'status', 'officerId', 'tenantId', 'createdAt'],
      tenant_settings: ['id', 'tenantId', 'category', 'key', 'value'],
      tenant_features: ['id', 'tenantId', 'feature', 'enabled'],
    };
    return colMap[activeTable] || tableConfig.columns;
  };

  const renderCellValue = (val) => {
    if (val === null || val === undefined) return <span style={{ color: '#6b7280' }}>null</span>;
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'object') return JSON.stringify(val).slice(0, 60);
    const s = String(val);
    if (s.length > 40) return s.slice(0, 37) + '...';
    if (['ACTIVE', 'REVOKED', 'EXPIRED', 'SUSPENDED', 'ONLINE', 'OFFLINE', 'RESOLVED', 'OPEN', 'PENDING'].includes(s)) {
      return statusBadge(s);
    }
    return s;
  };

  const columns = getColumns();

  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 60px)' }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: '#111827', borderRight: '1px solid #1f2937', padding: 16, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Database Tables
        </div>
        {tables.map((t) => (
          <div
            key={t.id}
            onClick={() => { setActiveTable(t.id); setSearch(''); setSort('createdAt'); setSortOrder('desc'); setPagination((p) => ({ ...p, page: 1 })); }}
            style={{
              padding: '8px 12px',
              marginBottom: 4,
              borderRadius: 8,
              cursor: 'pointer',
              background: activeTable === t.id ? '#2563eb' : 'transparent',
              color: activeTable === t.id ? '#fff' : '#d1d5db',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 13,
              transition: 'background 0.15s',
            }}
          >
            <span>{t.label}</span>
            <span style={{ fontSize: 11, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f9fafb' }}>
              {tableConfig?.label || activeTable}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              {pagination.total} records
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              style={{ ...inputStyle, width: 240 }}
            />
            <button onClick={() => { setShowCreate(true); setCreateData({}); }} style={btnPrimary}>
              + Add Record
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#dc262622', border: '1px solid #dc2626', borderRadius: 8, padding: 12, marginBottom: 16, color: '#fca5a5', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Table */}
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col} style={thStyle} onClick={() => handleSort(col)}>
                      {col} {sort === col ? (sortOrder === 'asc' ? '\u2191' : '\u2193') : ''}
                    </th>
                  ))}
                  <th style={{ ...thStyle, cursor: 'default' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length + 1} style={{ ...tdStyle, textAlign: 'center', padding: 40, color: '#6b7280' }}>
                      Loading...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} style={{ ...tdStyle, textAlign: 'center', padding: 40, color: '#6b7280' }}>
                      No records found
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id} style={{ borderBottom: '1px solid #1f2937' }}>
                      {columns.map((col) => (
                        <td key={col} style={tdStyle} title={String(record[col] ?? '')}>
                          {renderCellValue(record[col])}
                        </td>
                      ))}
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleEdit(record)} style={btnSmall}>Edit</button>
                          <button onClick={() => setDeleteTarget(record)} style={{ ...btnSmall, background: '#7f1d1d', borderColor: '#991b1b', color: '#fca5a5' }}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13, color: '#9ca3af' }}>
          <span>
            Page {pagination.page} of {pagination.totalPages || 1}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
              style={{ ...btnSmall, opacity: pagination.page <= 1 ? 0.4 : 1 }}
            >
              Prev
            </button>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
              style={{ ...btnSmall, opacity: pagination.page >= pagination.totalPages ? 0.4 : 1 }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editRecord && (
        <div style={overlayStyle} onClick={() => setEditRecord(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18 }}>Edit Record</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              {Object.entries(editData).map(([key, val]) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{key}</label>
                  <input
                    value={val}
                    onChange={(e) => setEditData((d) => ({ ...d, [key]: e.target.value }))}
                    style={inputStyle}
                    disabled={key === 'id' || key === 'createdAt'}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditRecord(null)} style={btnSmall}>Cancel</button>
              <button onClick={handleSaveEdit} style={btnPrimary}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div style={overlayStyle} onClick={() => setDeleteTarget(null)}>
          <div style={{ ...modalStyle, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, color: '#fca5a5' }}>Confirm Delete</h3>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 20px' }}>
              Delete record <strong>{deleteTarget.id}</strong> from <strong>{activeTable}</strong>?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} style={btnSmall}>Cancel</button>
              <button onClick={handleDelete} style={btnDanger}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div style={overlayStyle} onClick={() => setShowCreate(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18 }}>Create Record in {tableConfig?.label}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              {columns.filter((c) => c !== 'id' && c !== 'createdAt').map((col) => (
                <div key={col}>
                  <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{col}</label>
                  <input
                    value={createData[col] || ''}
                    onChange={(e) => setCreateData((d) => ({ ...d, [col]: e.target.value }))}
                    style={inputStyle}
                    placeholder={`Enter ${col}...`}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={btnSmall}>Cancel</button>
              <button onClick={handleCreate} style={btnPrimary}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
