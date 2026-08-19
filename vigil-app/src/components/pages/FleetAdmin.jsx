import React, { useState, useMemo } from 'react';
import { Settings, Bus, User, Shield, Wifi, WifiOff, Plus, Trash2, X, CheckCircle, RefreshCw, Key, Copy, Eye, EyeOff, ShieldAlert, Clock, Search } from 'lucide-react';

export default function FleetAdmin({
  vehicles = [],
  drivers = [],
  onAddVehicle,
  onAddDriver,
  onDeleteVehicle,
  onDeleteDriver,
  onToggleVehicleActive,
  tokens = [],
  securityEvents = [],
  onGenerateToken,
  onRevokeToken,
  onRotateToken
}) {
  const [activeTab, setActiveTab] = useState('devices');
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [revealedToken, setRevealedToken] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [fleetSearch, setFleetSearch] = useState('');
  const [vehicleErrors, setVehicleErrors] = useState({});
  const [driverErrors, setDriverErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // New token form state
  const [tDeviceId, setTDeviceId] = useState('');
  const [tExpiryDays, setTExpiryDays] = useState('');

  const handleGenerateTokenSubmit = async (e) => {
    e.preventDefault();
    if (!tDeviceId) return;
    await onGenerateToken(tDeviceId, tExpiryDays ? Number(tExpiryDays) : null);
    setShowTokenModal(false);
    setTDeviceId('');
    setTExpiryDays('');
  };

  const copyToken = async (token) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedId(token.slice(-8));
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      setCopiedId('error');
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  function maskToken(token) {
    if (!token) return '-';
    if (token.length <= 16) return `${token.slice(0, 4)}••••${token.slice(-4)}`;
    return `${token.slice(0, 9)}••••••••••${token.slice(-8)}`;
  }

  function tokenStatusBadge(t) {
    if (t.status === 'REVOKED') return 'badge-red';
    if (t.expiresAt && new Date(t.expiresAt) <= new Date()) return 'badge-red';
    return 'badge-green';
  }

  function tokenStatusText(t) {
    if (t.status === 'REVOKED') return 'REVOKED';
    if (t.expiresAt && new Date(t.expiresAt) <= new Date()) return 'EXPIRED';
    return 'ACTIVE';
  }

  function eventBadgeClass(type) {
    if (type === 'MISSING_DEVICE_TOKEN') return 'badge-amber';
    if (type === 'TOKEN_REVOKED' || type === 'TOKEN_ROTATED') return 'badge-blue';
    return 'badge-red';
  }

  // New vehicle form state
  const [vId, setVId] = useState('');
  const [vCode, setVCode] = useState('');
  const [vName, setVName] = useState('');
  const [vType, setVType] = useState('BUS');
  const [vDriver, setVDriver] = useState('');
  const [vSpeedLimit, setVSpeedLimit] = useState('50');

  // New driver form state
  const [dName, setDName] = useState('');
  const [dLicense, setDLicense] = useState('');
  const [dPhone, setDPhone] = useState('');
  const [dVehicleId, setDVehicleId] = useState('');
  const [dSafetyScore, setDSafetyScore] = useState('90');

  // Real-time validation for vehicle form
  const validateVehicleField = (field, value) => {
    const errors = { ...vehicleErrors };
    if (field === 'code' && !value.trim()) {
      errors.code = 'Vehicle code is required';
    } else if (field === 'code') {
      delete errors.code;
    }
    if (field === 'name' && !value.trim()) {
      errors.name = 'Vehicle name is required';
    } else if (field === 'name') {
      delete errors.name;
    }
    if (field === 'speedLimit' && (isNaN(value) || Number(value) < 1 || Number(value) > 200)) {
      errors.speedLimit = 'Speed limit must be 1-200 km/h';
    } else if (field === 'speedLimit') {
      delete errors.speedLimit;
    }
    setVehicleErrors(errors);
  };

  // Real-time validation for driver form
  const validateDriverField = (field, value) => {
    const errors = { ...driverErrors };
    if (field === 'name' && !value.trim()) {
      errors.name = 'Driver name is required';
    } else if (field === 'name') {
      delete errors.name;
    }
    if (field === 'safetyScore' && (isNaN(value) || Number(value) < 0 || Number(value) > 100)) {
      errors.safetyScore = 'Score must be 0-100';
    } else if (field === 'safetyScore') {
      delete errors.safetyScore;
    }
    setDriverErrors(errors);
  };

  const handleVehicleToggle = (vehicleId, currentActive) => {
    if (onToggleVehicleActive) {
      onToggleVehicleActive(vehicleId, !currentActive);
    }
  };

  const handleDeleteClick = (type, id) => {
    setDeleteTarget({ type, id });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (deleteTarget?.type === 'vehicle' && onDeleteVehicle) {
      onDeleteVehicle(deleteTarget.id);
    } else if (deleteTarget?.type === 'driver' && onDeleteDriver) {
      onDeleteDriver(deleteTarget.id);
    }
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const handleAddVehicleSubmit = async (e) => {
    e.preventDefault();
    if (!vCode || !vName) return;
    const createdId = vId || `BUS-${100 + vehicles.length + 1}`;
    await onAddVehicle({
      id: createdId,
      code: vCode,
      name: vName,
      type: vType,
      driver: vDriver || 'Unassigned Driver',
      speedLimit: Number(vSpeedLimit) || 50
    });
    setShowVehicleModal(false);
    // Reset form
    setVId(''); setVCode(''); setVName(''); setVDriver(''); setVSpeedLimit('50');
  };

  const handleAddDriverSubmit = async (e) => {
    e.preventDefault();
    if (!dName) return;
    const createdId = `D${String(drivers.length + 1).padStart(3, '0')}`;
    await onAddDriver({
      id: createdId,
      name: dName,
      licenseNo: dLicense || `SIM-B2-${Math.floor(10000 + Math.random() * 90000)}`,
      phone: dPhone || '+62 812-3456-7890',
      vehicleId: dVehicleId || 'UNASSIGNED',
      safetyScore: Number(dSafetyScore) || 90
    });
    setShowDriverModal(false);
    // Reset form
    setDName(''); setDLicense(''); setDPhone(''); setDVehicleId(''); setDSafetyScore('90');
  };

  function scoreColor(score) {
    if (score >= 85) return '#10b981';
    if (score >= 70) return '#f59e0b';
    return '#ef4444';
  }

  const filteredVehicles = useMemo(() => {
    if (!fleetSearch.trim()) return vehicles;
    const q = fleetSearch.toLowerCase();
    return vehicles.filter(v => v.id.toLowerCase().includes(q) || v.code?.toLowerCase().includes(q) || v.name?.toLowerCase().includes(q));
  }, [vehicles, fleetSearch]);

  const filteredDrivers = useMemo(() => {
    if (!fleetSearch.trim()) return drivers;
    const q = fleetSearch.toLowerCase();
    return drivers.filter(d => d.id.toLowerCase().includes(q) || d.name?.toLowerCase().includes(q));
  }, [drivers, fleetSearch]);

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <Settings size={18} style={{ color: 'var(--accent-blue)' }} />
        <div>
          <div className="page-title">Fleet Administration</div>
          <div className="page-subtitle">Device management, vehicle registry & driver safety profiles</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {activeTab === 'devices' && (
            <button
              className="btn btn-primary"
              onClick={() => setShowVehicleModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600 }}
            >
              <Plus size={14} /> Add Vehicle
            </button>
          )}
          {activeTab === 'drivers' && (
            <button
              className="btn btn-primary"
              onClick={() => setShowDriverModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600 }}
            >
              <Plus size={14} /> Register Driver
            </button>
          )}
          {activeTab === 'tokens' && (
            <button
              className="btn btn-primary"
              onClick={() => setShowTokenModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600 }}
            >
              <Key size={14} /> Generate Device Token
            </button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="filter-bar">
        {[
          { id: 'devices', icon: Bus,  label: `Vehicles & Devices (${vehicles.length})` },
          { id: 'drivers', icon: User, label: `Registered Drivers (${drivers.length})` },
          { id: 'tokens', icon: Shield, label: `Device Tokens (${tokens.length})` },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            id={`tab-${id}`}
            className={`filter-btn${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div className="page-body">
        {activeTab === 'devices' && (
          <div className="animate-fade-in">
            <div className="fleet-search-bar">
              <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                className="fleet-search-input"
                placeholder="Search vehicles by ID, code, or name..."
                value={fleetSearch}
                onChange={e => setFleetSearch(e.target.value)}
              />
            </div>
            <div className="fleet-grid">
            {vehicles.map(v => (
              <div key={v.id} className={`fleet-unit-card${v.status === 'emergency' ? ' emergency' : ''}`}>
                <div className="fleet-unit-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span className="fleet-unit-id">{v.id}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>({v.code})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Active/Inactive Toggle */}
                    <button
                      onClick={() => handleVehicleToggle(v.id, v.status !== 'idle')}
                      title={v.status !== 'idle' ? 'Click to deactivate' : 'Click to activate'}
                      style={{
                        background: v.status !== 'idle' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                        border: `1px solid ${v.status !== 'idle' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(107, 114, 128, 0.3)'}`,
                        borderRadius: 6,
                        padding: '2px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        color: v.status !== 'idle' ? 'var(--status-green)' : 'var(--text-muted)',
                      }}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: v.status !== 'idle' ? 'var(--status-green)' : 'var(--text-muted)',
                      }} />
                      {v.status !== 'idle' ? 'ACTIVE' : 'INACTIVE'}
                    </button>
                    <span className={`badge ${v.status === 'normal' ? 'badge-green' : v.status === 'idle' ? 'badge-blue' : 'badge-red'}`}>
                      {v.status}
                    </span>
                    <button
                      onClick={() => handleDeleteClick('vehicle', v.id)}
                      title="Delete vehicle"
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2, opacity: 0.7 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '6px 0' }}>
                  {v.name}
                </div>

                <div className="fleet-unit-body">
                  <div className="fleet-unit-stat">
                    Type<strong>{v.type || 'City Bus'}</strong>
                  </div>
                  <div className="fleet-unit-stat">
                    Speed Limit<strong>{v.speedLimit || 50} km/h</strong>
                  </div>
                  <div className="fleet-unit-stat">
                    Current Speed<strong>{Math.round(v.speed || 0)} km/h</strong>
                  </div>
                  <div className="fleet-unit-stat">
                    Heartbeat<strong>{v.heartBeatIntervalSec || 10}s</strong>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <User size={11} /> {v.driver || 'Unassigned'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: v.status !== 'idle' ? 'var(--status-green)' : 'var(--text-muted)' }}>
                      {v.status !== 'idle' ? <Wifi size={11} /> : <WifiOff size={11} />}
                      {v.status !== 'idle' ? 'MQTT Online' : 'Offline'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent-blue)' }}>
                      <Shield size={10} /> IoT Connected
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </div>
        )}

        {activeTab === 'drivers' && (
          <div className="animate-fade-in">
            <div className="fleet-search-bar">
              <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                className="fleet-search-input"
                placeholder="Search drivers by ID or name..."
                value={fleetSearch}
                onChange={e => setFleetSearch(e.target.value)}
              />
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Driver Name</th>
                    <th>Driver ID</th>
                    <th>Assigned Vehicle</th>
                    <th>License Number</th>
                    <th>Phone</th>
                    <th>Trips</th>
                    <th>Duty Hours</th>
                    <th>Safety Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map(d => (
                    <tr key={d.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="driver-avatar" style={{ width: 28, height: 28, fontSize: 10, borderRadius: 8 }}>
                            {d.name ? d.name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'DR'}
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</span>
                        </div>
                      </td>
                      <td><span className="mono">{d.id}</span></td>
                      <td><span className="mono" style={{ color: 'var(--accent-blue)' }}>{d.vehicleId || 'UNASSIGNED'}</span></td>
                      <td><span className="mono">{d.licenseNo}</span></td>
                      <td>{d.phone}</td>
                      <td><span className="mono">{d.trips || 0}</span></td>
                      <td><span className="mono">{d.hoursOnDuty || '0.0'}h</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, maxWidth: 80 }}>
                            <div className="safety-score-bar">
                              <div className="safety-score-fill" style={{
                                width: `${d.safetyScore || 90}%`,
                                background: `linear-gradient(90deg, ${scoreColor(d.safetyScore || 90)}, ${scoreColor(d.safetyScore || 90)}88)`,
                               }} />
                            </div>
                          </div>
                          <span className="mono" style={{ fontWeight: 700, color: scoreColor(d.safetyScore || 90), fontSize: 12 }}>
                            {d.safetyScore || 90}
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteClick('driver', d.id)}
                          title="Delete driver"
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'tokens' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Device Tokens Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bound Device</th>
                    <th>Token</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Last Used</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                        No device tokens issued yet. Generate one to provision an edge device.
                      </td>
                    </tr>
                  )}
                  {tokens.map(t => (
                    <tr key={t.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="driver-avatar" style={{ width: 26, height: 26, fontSize: 10, borderRadius: 7 }}>
                            <Bus size={13} />
                          </div>
                          <span className="mono" style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{t.deviceId}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                            {revealedToken === t.id ? t.token : maskToken(t.token)}
                          </span>
                          <button
                            onClick={() => setRevealedToken(revealedToken === t.id ? null : t.id)}
                            title={revealedToken === t.id ? 'Hide token' : 'Reveal token'}
                            style={iconBtnStyle}
                          >
                            {revealedToken === t.id ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button
                            onClick={() => copyToken(t.token)}
                            title="Copy token"
                            style={iconBtnStyle}
                          >
                            {copiedId === t.token.slice(-8) ? <CheckCircle size={13} style={{ color: 'var(--status-green)' }} /> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${tokenStatusBadge(t)}`}>{tokenStatusText(t)}</span>
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: 11 }}>
                          {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : 'Never'}
                        </span>
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: 11 }}>
                          {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : 'Never'}
                        </span>
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: 11 }}>
                          {new Date(t.createdAt).toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            onClick={() => onRotateToken && onRotateToken(t.deviceId)}
                            title="Rotate token"
                            disabled={t.status === 'REVOKED'}
                            style={{ ...iconBtnStyle, color: 'var(--accent-blue)', opacity: t.status === 'REVOKED' ? 0.4 : 1 }}
                          >
                            <RefreshCw size={13} />
                          </button>
                          <button
                            onClick={() => onRevokeToken && onRevokeToken(t.id)}
                            title="Revoke token"
                            disabled={t.status === 'REVOKED'}
                            style={{ ...iconBtnStyle, color: '#ef4444', opacity: t.status === 'REVOKED' ? 0.4 : 1 }}
                          >
                            <ShieldAlert size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Security Audit Log */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="card-header" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldAlert size={15} style={{ color: 'var(--status-amber)' }} />
                  <span className="card-title" style={{ color: 'var(--text-primary)', textTransform: 'none', letterSpacing: '0.3px' }}>
                    Security Audit Log <span className="text-muted">— unauthorized access attempts & token lifecycle</span>
                  </span>
                </div>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {securityEvents.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>
                    No security events recorded. All token authentications are healthy.
                  </div>
                )}
                {securityEvents.map(ev => (
                  <div key={ev.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'flex-start' }}>
                    <span className={`badge ${eventBadgeClass(ev.eventType)}`} style={{ flexShrink: 0, marginTop: 2 }}>
                      {ev.eventType}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{ev.details}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 10.5, color: 'var(--text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={10} /> {new Date(ev.timestamp).toLocaleString()}
                        </span>
                        <span className="mono">Device: {ev.deviceId}</span>
                        {ev.ipAddress && <span className="mono">IP: {ev.ipAddress}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Vehicle Modal */}
      {showVehicleModal && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle} className="animate-fade-in">
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700 }}>
                <Bus size={18} style={{ color: 'var(--accent-blue)' }} /> Add New Fleet Vehicle
              </div>
              <button onClick={() => setShowVehicleModal(false)} style={closeBtnStyle}><X size={16} /></button>
            </div>
            <form onSubmit={handleAddVehicleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Vehicle ID (e.g. BUS-105)</label>
                  <input style={inputStyle} value={vId} onChange={e => setVId(e.target.value)} placeholder="BUS-105" />
                </div>
                <div>
                  <label style={labelStyle}>Vehicle Code / Route <span style={{ color: 'var(--status-red)' }}>*</span></label>
                  <input
                    style={{ ...inputStyle, borderColor: vehicleErrors.code ? 'var(--status-red)' : undefined }}
                    value={vCode}
                    onChange={e => { setVCode(e.target.value); validateVehicleField('code', e.target.value); }}
                    placeholder="TS-001 / Koridor 1"
                  />
                  {vehicleErrors.code && <div style={{ fontSize: 10, color: 'var(--status-red)', marginTop: 3 }}>{vehicleErrors.code}</div>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Vehicle Name / Corridor <span style={{ color: 'var(--status-red)' }}>*</span></label>
                <input
                  style={{ ...inputStyle, borderColor: vehicleErrors.name ? 'var(--status-red)' : undefined }}
                  value={vName}
                  onChange={e => { setVName(e.target.value); validateVehicleField('name', e.target.value); }}
                  placeholder="Koridor 5 - Kampung Melayu - Ancol"
                />
                {vehicleErrors.name && <div style={{ fontSize: 10, color: 'var(--status-red)', marginTop: 3 }}>{vehicleErrors.name}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Vehicle Type</label>
                  <select style={inputStyle} value={vType} onChange={e => setVType(e.target.value)}>
                    <option value="BUS">City Bus</option>
                    <option value="MINIBUS">Minibus</option>
                    <option value="MICROBUS">Microbus</option>
                    <option value="SHUTTLE">Shuttle</option>
                    <option value="PATROL">Patrol</option>
                    <option value="TRUCK">Truck</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Speed Limit (km/h)</label>
                  <input
                    style={{ ...inputStyle, borderColor: vehicleErrors.speedLimit ? 'var(--status-red)' : undefined }}
                    type="number"
                    value={vSpeedLimit}
                    onChange={e => { setVSpeedLimit(e.target.value); validateVehicleField('speedLimit', e.target.value); }}
                  />
                  {vehicleErrors.speedLimit && <div style={{ fontSize: 10, color: 'var(--status-red)', marginTop: 3 }}>{vehicleErrors.speedLimit}</div>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Assigned Driver</label>
                <select
                  style={inputStyle}
                  value={vDriver}
                  onChange={e => setVDriver(e.target.value)}
                >
                  <option value="">-- Pilih Driver --</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.name}>{d.name} ({d.id})</option>
                  ))}
                  <option value="UNASSIGNED">UNASSIGNED</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => setShowVehicleModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={14} /> Register Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Driver Modal */}
      {showDriverModal && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle} className="animate-fade-in">
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700 }}>
                <User size={18} style={{ color: 'var(--accent-blue)' }} /> Register Driver Profile
              </div>
              <button onClick={() => setShowDriverModal(false)} style={closeBtnStyle}><X size={16} /></button>
            </div>
            <form onSubmit={handleAddDriverSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              <div>
                <label style={labelStyle}>Driver Full Name <span style={{ color: 'var(--status-red)' }}>*</span></label>
                <input
                  style={{ ...inputStyle, borderColor: driverErrors.name ? 'var(--status-red)' : undefined }}
                  value={dName}
                  onChange={e => { setDName(e.target.value); validateDriverField('name', e.target.value); }}
                  placeholder="Rudi Hermawan"
                />
                {driverErrors.name && <div style={{ fontSize: 10, color: 'var(--status-red)', marginTop: 3 }}>{driverErrors.name}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Driver's License (SIM B2 / POL)</label>
                  <input style={inputStyle} value={dLicense} onChange={e => setDLicense(e.target.value)} placeholder="SIM-B2-88219" />
                </div>
                <div>
                  <label style={labelStyle}>Contact Phone Number</label>
                  <input style={inputStyle} value={dPhone} onChange={e => setDPhone(e.target.value)} placeholder="+62 812-9988-1122" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Assign to Vehicle</label>
                  <select style={inputStyle} value={dVehicleId} onChange={e => setDVehicleId(e.target.value)}>
                    <option value="UNASSIGNED">-- Unassigned --</option>
            {filteredVehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.id} - {v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Initial Safety Score</label>
                  <input
                    style={{ ...inputStyle, borderColor: driverErrors.safetyScore ? 'var(--status-red)' : undefined }}
                    type="number"
                    min="0"
                    max="100"
                    value={dSafetyScore}
                    onChange={e => { setDSafetyScore(e.target.value); validateDriverField('safetyScore', e.target.value); }}
                  />
                  {driverErrors.safetyScore && <div style={{ fontSize: 10, color: 'var(--status-red)', marginTop: 3 }}>{driverErrors.safetyScore}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => setShowDriverModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={14} /> Register Driver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Generate Device Token Modal */}
      {showTokenModal && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle} className="animate-fade-in">
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700 }}>
                <Key size={18} style={{ color: 'var(--accent-blue)' }} /> Generate Device Token
              </div>
              <button onClick={() => setShowTokenModal(false)} style={closeBtnStyle}><X size={16} /></button>
            </div>
            <form onSubmit={handleGenerateTokenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              <div>
                <label style={labelStyle}>Bind Token to Device</label>
                <select style={inputStyle} value={tDeviceId} onChange={e => setTDeviceId(e.target.value)} required>
                  <option value="">-- Select vehicle / device --</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.id} - {v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Expiry (days, optional)</label>
                <input style={inputStyle} type="number" min="1" value={tExpiryDays} onChange={e => setTExpiryDays(e.target.value)} placeholder="Leave empty for no expiry" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--status-amber-subtle)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '10px 12px' }}>
                <Shield size={14} style={{ color: 'var(--status-amber)', flexShrink: 0 }} />
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  A secure 32-character random token will be generated and permanently bound to the selected device. Store it in the microcontroller's LittleFS during provisioning.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => setShowTokenModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={14} /> Generate & Bind Token
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle} className="animate-fade-in">
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700 }}>
                <Trash2 size={18} style={{ color: 'var(--status-red)' }} /> Confirm Delete
              </div>
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }} style={closeBtnStyle}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Are you sure you want to delete this {deleteTarget?.type}? This action cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }} className="btn btn-secondary">Cancel</button>
              <button onClick={confirmDelete} className="btn" style={{ background: 'var(--status-red)', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 6,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(9, 13, 22, 0.85)',
  backdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 3000,
  padding: 20
};

const modalCardStyle = {
  background: 'var(--bg-card, #0f172a)',
  border: '1px solid var(--border-accent, #3b82f644)',
  borderRadius: 14,
  padding: 24,
  width: '100%',
  maxWidth: 520,
  boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
  color: 'var(--text-primary)'
};

const modalHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid var(--border-subtle, #1e293b)',
  paddingBottom: 14
};

const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer'
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-muted)',
  marginBottom: 4
};

const inputStyle = {
  width: '100%',
  background: 'var(--bg-card-hover, #1e293b)',
  border: '1px solid var(--border-subtle, #334155)',
  borderRadius: 8,
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none'
};
