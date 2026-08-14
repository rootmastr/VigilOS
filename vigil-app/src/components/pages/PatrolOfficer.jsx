import React, { useState } from 'react';
import { Shield, Navigation, AlertTriangle, CheckCircle, Camera, FileText, Phone, BellRing, MapPin } from 'lucide-react';

const DUTY_STATUSES = [
  { id: 'Available', label: 'Available', color: 'var(--status-green)', badgeClass: 'badge-green' },
  { id: 'On Duty',   label: 'On Duty',   color: 'var(--accent-blue)',  badgeClass: 'badge-blue' },
  { id: 'Busy',      label: 'Busy / Intercepting', color: 'var(--status-amber)', badgeClass: 'badge-amber' },
  { id: 'Off Duty',   label: 'Off Duty',  color: 'var(--text-muted)',   badgeClass: 'badge-ghost' }
];

export default function PatrolOfficer({ officers = [], incidents = [], onUpdateOfficerStatus, onResolveWithReport }) {
  const currentOfficer = officers[0] || { id: 'OFF-101', name: 'Officer Hendra', badgeNo: 'PTR-8821', dutyStatus: 'On Duty', unitId: 'PATROL-01' };
  
  const [reportNotes, setReportNotes] = useState('');
  const [reportPhotoUrl, setReportPhotoUrl] = useState('https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?w=500');
  const [selectedIncidentForReport, setSelectedIncidentForReport] = useState(null);

  // Active emergency incidents
  const activeIncidents = incidents.filter(i => i.status === 'ACTIVE' || i.status === 'ACKNOWLEDGED');

  const handleStatusToggle = (status) => {
    if (onUpdateOfficerStatus) {
      onUpdateOfficerStatus(currentOfficer.id, status);
    }
  };

  const handleLaunchNavigation = (location) => {
    const lat = location?.lat || -6.2088;
    const lng = location?.lng || 106.8456;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
  };

  const handleSubmitFieldReport = (e) => {
    e.preventDefault();
    if (!selectedIncidentForReport) return;

    if (onResolveWithReport) {
      onResolveWithReport(selectedIncidentForReport.vehicleId, selectedIncidentForReport.id, {
        officerId: currentOfficer.id,
        notes: reportNotes || 'Field unit arrived on scene, verified situation, and resolved incident.',
        photoUrl: reportPhotoUrl
      });
    }

    setSelectedIncidentForReport(null);
    setReportNotes('');
  };

  return (
    <div className="page">
      <div className="page-header" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={20} style={{ color: 'var(--status-green)' }} />
            Patrol & Security Officer Portal
          </h1>
          <p className="page-subtitle">Mobile Responder Command Interface — High Priority Dispatch & Field Logs</p>
        </div>

        {/* Duty Status Selector Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>DUTY STATUS:</span>
          {DUTY_STATUSES.map(st => (
            <button
              key={st.id}
              onClick={() => handleStatusToggle(st.id)}
              className={`btn btn-sm ${currentOfficer.dutyStatus === st.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                background: currentOfficer.dutyStatus === st.id ? st.color : 'transparent',
                borderColor: currentOfficer.dutyStatus === st.id ? st.color : 'transparent',
                color: currentOfficer.dutyStatus === st.id ? 'white' : 'var(--text-secondary)'
              }}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
        {/* Left Column: Officer Profile & High-Priority Emergency Dispatch Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Officer Info Banner */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--status-green), #059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 700,
                fontSize: 18,
                boxShadow: '0 0 16px rgba(16, 185, 129, 0.3)'
              }}>
                <Shield size={24} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{currentOfficer.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, marginTop: 2 }}>
                  <span>Badge: <b>{currentOfficer.badgeNo}</b></span>
                  <span>Unit: <b>{currentOfficer.unitId}</b></span>
                  <span>Phone: <b>{currentOfficer.phone}</b></span>
                </div>
              </div>
            </div>

            <div className={`badge ${currentOfficer.dutyStatus === 'Available' ? 'badge-green' : currentOfficer.dutyStatus === 'On Duty' ? 'badge-blue' : 'badge-amber'}`} style={{ fontSize: 12, padding: '6px 14px' }}>
              {currentOfficer.dutyStatus.toUpperCase()}
            </div>
          </div>

          {/* Active Emergency Dispatch Alerts (FCM Push Notifications Simulation) */}
          <div className="card" style={{ border: activeIncidents.length > 0 ? '1px solid var(--status-red)' : '1px solid var(--border-card)' }}>
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, color: activeIncidents.length > 0 ? 'var(--status-red)' : 'var(--text-muted)' }}>
                <BellRing size={16} className={activeIncidents.length > 0 ? 'pulse' : ''} />
                High-Priority Emergency Dispatches ({activeIncidents.length})
              </span>
            </div>

            {activeIncidents.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                <CheckCircle size={32} style={{ color: 'var(--status-green)', marginBottom: 8, display: 'block', margin: '0 auto 8px auto' }} />
                No active emergencies in your patrol sector. All sectors clear.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {activeIncidents.map(inc => (
                  <div key={inc.id} style={{
                    background: 'var(--status-red-subtle)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ background: 'var(--status-red)', color: 'white', fontWeight: 800, fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>HIGH PRIORITY</span>
                          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{inc.vehicleCode} — {inc.type}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                          {inc.details}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 12 }}>
                          <span>Driver: <b>{inc.driverName}</b></span>
                          <span>Coords: <b>({inc.location?.lat?.toFixed(4)}, {inc.location?.lng?.toFixed(4)})</b></span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      {/* One-Tap Turn-by-Turn Native Navigation Launch */}
                      <button
                        className="btn btn-primary"
                        onClick={() => handleLaunchNavigation(inc.location)}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <Navigation size={15} />
                        Turn-by-Turn Navigation
                      </button>

                      {/* Launch Mobile Incident Field Report */}
                      <button
                        className="btn btn-success"
                        onClick={() => setSelectedIncidentForReport(inc)}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <FileText size={15} />
                        Submit Mobile Field Report
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Officers Sector Map List */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Sector Patrol Roster</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Badge No</th>
                  <th>Officer Name</th>
                  <th>Patrol Unit</th>
                  <th>Phone Contact</th>
                  <th>Duty Status</th>
                </tr>
              </thead>
              <tbody>
                {officers.map(off => (
                  <tr key={off.id}>
                    <td className="mono" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{off.badgeNo}</td>
                    <td style={{ fontWeight: 600 }}>{off.name}</td>
                    <td>{off.unitId}</td>
                    <td>{off.phone}</td>
                    <td>
                      <span className={`badge ${off.dutyStatus === 'Available' ? 'badge-green' : off.dutyStatus === 'On Duty' ? 'badge-blue' : 'badge-amber'}`}>
                        {off.dutyStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Sidebar: Mobile Incident Field Reporting Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={15} style={{ color: 'var(--status-green)' }} />
                Mobile Incident Field Report
              </span>
            </div>

            {selectedIncidentForReport ? (
              <form onSubmit={handleSubmitFieldReport} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 8, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: 'var(--status-red)' }}>Resolving Incident: {selectedIncidentForReport.id}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>Target Vehicle: {selectedIncidentForReport.vehicleCode}</div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>FIELD NOTES / AUDIT SUMMARY</label>
                  <textarea
                    rows={4}
                    value={reportNotes}
                    onChange={(e) => setReportNotes(e.target.value)}
                    placeholder="Enter on-scene observations, suspect descriptions, or medical actions taken..."
                    style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-card)', padding: 8, borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>EVIDENCE PHOTO URL (CAMERA SNAPSHOT)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={reportPhotoUrl}
                      onChange={(e) => setReportPhotoUrl(e.target.value)}
                      style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-card)', padding: 8, borderRadius: 6, fontSize: 12 }}
                    />
                    <button type="button" className="btn btn-ghost" title="Snap Photo Simulation">
                      <Camera size={14} />
                    </button>
                  </div>
                </div>

                {reportPhotoUrl && (
                  <div style={{ width: '100%', height: 140, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                    <img src={reportPhotoUrl} alt="Evidence" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setSelectedIncidentForReport(null)} style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-success" style={{ flex: 1, justifyContent: 'center' }}>
                    <CheckCircle size={14} />
                    Resolve Ticket
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                Select an active emergency alert from the left panel to launch and fill the Mobile Incident Field Report.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
