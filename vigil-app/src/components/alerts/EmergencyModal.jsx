import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, Navigation, CheckCircle, AlertTriangle, MapPin, Clock, User, FileText } from 'lucide-react';
import L from 'leaflet';

export default function EmergencyModal({ vehicle, queue, activeIndex, onQueueSelect, onAcknowledge, onResolve }) {
  const [actions, setActions] = useState({
    called: false,
    dispatched: false,
    acknowledged: false,
  });
  const [auditLog, setAuditLog] = useState([]);
  const [resolutionReason, setResolutionReason] = useState('');
  const [statusMsg, setStatusMsg] = useState('⚠ Awaiting operator action');
  const miniMapRef = useRef(null);
  const miniMapInstanceRef = useRef(null);
  const alarmPlayingRef = useRef(true);

  // Reset state when switching emergencies
  useEffect(() => {
    setActions({ called: false, dispatched: false, acknowledged: false });
    setAuditLog([]);
    setResolutionReason('');
    setStatusMsg('⚠ Awaiting operator action');
    alarmPlayingRef.current = true;
  }, [vehicle?.id]);

  // Initialize mini map
  useEffect(() => {
    if (!vehicle || !miniMapRef.current) return;

    // Clean up previous instance
    if (miniMapInstanceRef.current) {
      miniMapInstanceRef.current.remove();
      miniMapInstanceRef.current = null;
    }

    const map = L.map(miniMapRef.current, {
      center: [vehicle.lat || -6.2088, vehicle.lng || 106.8456],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Vehicle marker
    const marker = L.marker([vehicle.lat || -6.2088, vehicle.lng || 106.8456], {
      icon: L.divIcon({
        className: '',
        html: `<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" fill="#ef4444" stroke="#991b1b" stroke-width="2"/><path d="M14 6 L18 18 L14 15 L10 18 Z" fill="white"/></svg>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
    }).addTo(map);

    // Pulse ring
    L.circle([vehicle.lat || -6.2088, vehicle.lng || 106.8456], {
      radius: 100,
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: 0.1,
      weight: 1,
      opacity: 0.5,
    }).addTo(map);

    miniMapInstanceRef.current = map;

    return () => {
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove();
        miniMapInstanceRef.current = null;
      }
    };
  }, [vehicle?.id, vehicle?.lat, vehicle?.lng]);

  const addAuditEntry = useCallback((msg) => {
    const now = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAuditLog(prev => [...prev, { time: now, msg }]);
  }, []);

  const handleAction = (action) => {
    setActions(prev => ({ ...prev, [action]: true }));
    const msgs = {
      called: '📞 Audio link established with cabin',
      dispatched: '🚔 Patrol unit dispatched to coordinates',
      acknowledged: '✓ Incident acknowledged by operator',
    };
    const msg = msgs[action] || '';
    setStatusMsg(msg);
    addAuditEntry(msg);

    if (action === 'acknowledged') {
      alarmPlayingRef.current = false;
      onAcknowledge && onAcknowledge();
    }
  };

  const canResolve = resolutionReason.trim().length >= 10;

  const handleResolve = () => {
    if (!canResolve) return;
    const msg = '✓ Incident resolved — ticket closed';
    setStatusMsg(msg);
    addAuditEntry(msg);
    setTimeout(() => {
      onResolve && onResolve(resolutionReason);
    }, 800);
  };

  if (!vehicle) return null;

  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const hasMultipleEmergencies = queue && queue.length > 1;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Emergency Alert">
      <div className="emergency-modal" style={{ maxWidth: hasMultipleEmergencies ? 680 : 520 }}>
        {/* Header — Blinking red per PRD */}
        <div className="emergency-modal-header" style={{ animation: 'emergency-header-pulse 2s ease-in-out infinite' }}>
          <div className="emergency-icon-ring">
            <AlertTriangle size={24} />
          </div>
          <div className="emergency-header-text">
            <div className="emergency-title">🚨 PANIC BUTTON ACTIVATED</div>
            <div className="emergency-subtitle">Vehicle {vehicle.id} — {vehicle.route}</div>
          </div>
          <div className="emergency-alert-tag">LIVE</div>
        </div>

        {/* Body */}
        <div className="emergency-modal-body">
          {/* Mini Map */}
          <div className="mini-map-container" ref={miniMapRef} />

          {/* Info Grid */}
          <div className="emergency-info-grid">
            <div className="emergency-info-item">
              <div className="emergency-info-label"><MapPin size={10} style={{ display: 'inline', marginRight: 3 }} />Location</div>
              <div className="emergency-info-value">{vehicle.lat != null ? `${Math.abs(vehicle.lat).toFixed(4)}°${vehicle.lat >= 0 ? 'N' : 'S'}` : '--°S'}</div>
              <div className="emergency-info-value">{vehicle.lng != null ? `${Math.abs(vehicle.lng).toFixed(4)}°${vehicle.lng >= 0 ? 'E' : 'W'}` : '--°E'}</div>
            </div>
            <div className="emergency-info-item">
              <div className="emergency-info-label"><User size={10} style={{ display: 'inline', marginRight: 3 }} />Driver</div>
              <div className="emergency-info-value" style={{ fontSize: 12 }}>{vehicle.driver}</div>
              <div className="emergency-info-value" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{vehicle.driverId}</div>
            </div>
            <div className="emergency-info-item">
              <div className="emergency-info-label">Speed</div>
              <div className="emergency-info-value danger">{Math.round(vehicle.speed || 0)} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontWeight: 400 }}>km/h</span></div>
            </div>
            <div className="emergency-info-item">
              <div className="emergency-info-label"><Clock size={10} style={{ display: 'inline', marginRight: 3 }} />Triggered</div>
              <div className="emergency-info-value" style={{ fontSize: 11 }}>{now}</div>
            </div>
          </div>

          {/* Actions — No dismiss button per PRD */}
          <div className="emergency-actions">
            <button
              id="emergency-action-call"
              className={`emergency-action-btn call${actions.called ? ' done' : ''}`}
              onClick={() => !actions.called && handleAction('called')}
            >
              <div className="emergency-action-icon"><Phone size={16} /></div>
              {actions.called ? '✓ Called' : 'Call Cabin'}
            </button>

            <button
              id="emergency-action-dispatch"
              className={`emergency-action-btn dispatch${actions.dispatched ? ' done' : ''}`}
              onClick={() => !actions.dispatched && handleAction('dispatched')}
            >
              <div className="emergency-action-icon"><Navigation size={16} /></div>
              {actions.dispatched ? '✓ Dispatched' : 'Dispatch Patrol'}
            </button>

            <button
              id="emergency-action-acknowledge"
              className={`emergency-action-btn acknowledge${actions.acknowledged ? ' done' : ''}`}
              onClick={() => !actions.acknowledged && handleAction('acknowledged')}
            >
              <div className="emergency-action-icon"><CheckCircle size={16} /></div>
              {actions.acknowledged ? '✓ Acknowledged' : 'Acknowledge'}
            </button>
          </div>

          {/* Mandatory Resolve Textarea — per PRD */}
          <div className="emergency-resolve-section">
            <div className="emergency-resolve-label">
              <FileText size={12} />
              Resolution Notes <span style={{ color: 'var(--status-red)', fontWeight: 800 }}>*</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                (minimum 10 characters — required to close)
              </span>
            </div>
            <textarea
              className="emergency-resolve-textarea"
              rows={3}
              placeholder="Describe the resolution action taken (e.g., driver contacted, patrol dispatched, incident cleared)..."
              value={resolutionReason}
              onChange={(e) => setResolutionReason(e.target.value)}
              maxLength={500}
            />
            <div className="emergency-resolve-footer">
              <span>{resolutionReason.length}/500</span>
              {!canResolve && resolutionReason.length > 0 && (
                <span style={{ color: 'var(--status-red)' }}>Min 10 characters required</span>
              )}
            </div>
          </div>

          {/* Resolve Button */}
          <button
            className={`btn w-full${canResolve ? ' btn-success' : ''}`}
            disabled={!canResolve}
            onClick={handleResolve}
            style={{
              opacity: canResolve ? 1 : 0.4,
              cursor: canResolve ? 'pointer' : 'not-allowed',
              marginTop: 8,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 700,
              justifyContent: 'center',
            }}
          >
            {canResolve ? '✓ Resolve Incident' : '🔒 Resolve (fill reason above)'}
          </button>

          {/* Audit Log */}
          {auditLog.length > 0 && (
            <div className="emergency-audit-log">
              {auditLog.map((entry, i) => (
                <div key={i} className="emergency-audit-entry">
                  <span className="emergency-audit-time">{entry.time}</span>
                  <span className="emergency-audit-msg">{entry.msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Queue Selector — Multiple emergencies */}
          {hasMultipleEmergencies && (
            <div className="emergency-queue-list">
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                Emergency Queue ({queue.length})
              </div>
              {queue.map((eq, i) => (
                <div
                  key={eq.id}
                  className={`emergency-queue-item${i === activeIndex ? ' active' : ''}`}
                  onClick={() => onQueueSelect(i)}
                >
                  <span className="queue-id">{eq.id}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{eq.route}</span>
                  <span className="queue-time">
                    {eq._queueTime ? Math.floor((Date.now() - eq._queueTime) / 1000) : 0}s ago
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="emergency-modal-footer">
          <div className="emergency-timestamp">{statusMsg}</div>
        </div>
      </div>
    </div>
  );
}
