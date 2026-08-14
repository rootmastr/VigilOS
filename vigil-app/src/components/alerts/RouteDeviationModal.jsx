import React, { useState, useEffect, useRef } from 'react';
import { Phone, Bell, X, AlertTriangle, MapPin, Clock, FileText } from 'lucide-react';
import L from 'leaflet';

export default function RouteDeviationModal({ deviation, onClose, onResolve }) {
  const [called, setCalled] = useState(false);
  const [notified, setNotified] = useState(false);
  const [resolutionReason, setResolutionReason] = useState('');
  const [statusMsg, setStatusMsg] = useState('⚠ Mandatory operator action required');
  const miniMapRef = useRef(null);
  const miniMapInstanceRef = useRef(null);

  // Initialize mini map
  useEffect(() => {
    if (!deviation || !miniMapRef.current) return;

    if (miniMapInstanceRef.current) {
      miniMapInstanceRef.current.remove();
      miniMapInstanceRef.current = null;
    }

    const vehicle = deviation.vehicle || {};
    const map = L.map(miniMapRef.current, {
      center: [vehicle.lat || -6.2088, vehicle.lng || 106.8456],
      zoom: 14,
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

    // Vehicle marker (orange for deviation)
    L.marker([vehicle.lat || -6.2088, vehicle.lng || 106.8456], {
      icon: L.divIcon({
        className: '',
        html: `<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" fill="#f59e0b" stroke="#92400e" stroke-width="2"/><path d="M14 6 L18 18 L14 15 L10 18 Z" fill="white"/></svg>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
    }).addTo(map);

    // Deviation radius circle (500m threshold)
    L.circle([vehicle.lat || -6.2088, vehicle.lng || 106.8456], {
      radius: 500,
      color: '#f59e0b',
      fillColor: '#f59e0b',
      fillOpacity: 0.08,
      weight: 1,
      opacity: 0.4,
      dashArray: '5,5',
    }).addTo(map);

    // Assigned route marker (blue, simulated position nearby)
    if (vehicle.lat && vehicle.lng) {
      L.marker([vehicle.lat + 0.002, vehicle.lng - 0.001], {
        icon: L.divIcon({
          className: '',
          html: `<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#3b82f6" stroke="#1e40af" stroke-width="2"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">R</text></svg>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })
      }).addTo(map).bindTooltip('Assigned Route', { permanent: true, direction: 'top', offset: [0, -8] });
    }

    miniMapInstanceRef.current = map;

    return () => {
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove();
        miniMapInstanceRef.current = null;
      }
    };
  }, [deviation?.vehicle?.id, deviation?.vehicle?.lat, deviation?.vehicle?.lng]);

  if (!deviation) return null;

  const canResolve = resolutionReason.trim().length >= 10;
  const vehicle = deviation.vehicle || {};
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const handleCall = () => {
    setCalled(true);
    setStatusMsg('📞 Audio link established with cabin');
  };

  const handleNotify = () => {
    setNotified(true);
    setStatusMsg('🔔 Push notification sent to driver');
  };

  const handleResolve = () => {
    if (!canResolve) return;
    setStatusMsg('✓ Incident resolved — audit log recorded');
    setTimeout(() => {
      if (onResolve) onResolve(deviation, resolutionReason);
    }, 1000);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Route Deviation Alert">
      <div className="route-deviation-modal">
        {/* Header */}
        <div className="emergency-modal-header">
          <div className="emergency-icon-ring">
            <AlertTriangle size={24} />
          </div>
          <div className="emergency-header-text">
            <div className="emergency-title">⚠ ROUTE DEVIATION — CRITICAL</div>
            <div className="emergency-subtitle">
              {vehicle.id || deviation.vehicleId} — Exceeded {deviation.deviationMeters || '500m'} threshold
            </div>
          </div>
          <div className="emergency-alert-tag">CRITICAL</div>
        </div>

        {/* Body */}
        <div className="emergency-modal-body">
          {/* Mini Map */}
          <div style={{
            height: 180,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
            marginBottom: 16,
            position: 'relative',
          }}>
            <div ref={miniMapRef} style={{ width: '100%', height: '100%' }} />
            {/* Map legend */}
            <div style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              background: 'rgba(15, 23, 42, 0.9)',
              borderRadius: 6,
              padding: '4px 8px',
              display: 'flex',
              gap: 10,
              fontSize: 10,
              zIndex: 1000,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Vehicle</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Route</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', border: '1px dashed #f59e0b', background: 'transparent' }} />
                <span style={{ color: 'var(--text-secondary)' }}>500m radius</span>
              </div>
            </div>
          </div>

          {/* Info Grid */}
          <div className="emergency-info-grid">
            <div className="emergency-info-item">
              <div className="emergency-info-label">
                <MapPin size={10} style={{ display: 'inline', marginRight: 3 }} />Vehicle Position
              </div>
              <div className="emergency-info-value">
                {vehicle.lat ? vehicle.lat.toFixed(4) : '--'}°S
              </div>
              <div className="emergency-info-value">
                {vehicle.lng ? vehicle.lng.toFixed(4) : '--'}°E
              </div>
            </div>
            <div className="emergency-info-item">
              <div className="emergency-info-label">Assigned Route</div>
              <div className="emergency-info-value" style={{ fontSize: 12 }}>
                {vehicle.route || deviation.route || '--'}
              </div>
            </div>
            <div className="emergency-info-item">
              <div className="emergency-info-label">Deviation Distance</div>
              <div className="emergency-info-value danger">
                {deviation.deviationMeters || '500+'}{' '}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontWeight: 400 }}>meters</span>
              </div>
            </div>
            <div className="emergency-info-item">
              <div className="emergency-info-label">
                <Clock size={10} style={{ display: 'inline', marginRight: 3 }} />Detected
              </div>
              <div className="emergency-info-value" style={{ fontSize: 11 }}>{now}</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="emergency-actions" style={{ marginBottom: 16 }}>
            <button
              className={`emergency-action-btn call${called ? ' done' : ''}`}
              onClick={() => !called && handleCall()}
            >
              <div className="emergency-action-icon"><Phone size={16} /></div>
              {called ? '✓ Called' : 'Call Cabin'}
            </button>
            <button
              className={`emergency-action-btn dispatch${notified ? ' done' : ''}`}
              onClick={() => !notified && handleNotify()}
            >
              <div className="emergency-action-icon"><Bell size={16} /></div>
              {notified ? '✓ Notified' : 'Push Notification'}
            </button>
          </div>

          {/* Mandatory Resolution Reason */}
          <div className="deviation-resolution-section">
            <div className="deviation-resolution-label">
              <FileText size={12} style={{ display: 'inline', marginRight: 4 }} />
              Resolution Reason <span style={{ color: 'var(--status-red)', fontWeight: 800 }}>*</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                (minimum 10 characters — required for audit compliance)
              </span>
            </div>
            <textarea
              className="deviation-resolution-textarea"
              rows={3}
              placeholder="Describe the resolution action taken (e.g., driver contacted, route corrected, incident cleared)..."
              value={resolutionReason}
              onChange={(e) => setResolutionReason(e.target.value)}
              maxLength={500}
            />
            <div className="deviation-resolution-footer">
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {resolutionReason.length}/500
              </span>
              {!canResolve && resolutionReason.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--status-red)', fontFamily: 'var(--font-mono)' }}>
                  Min 10 characters required
                </span>
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
            {canResolve ? '✓ Resolve Incident' : '🔒 Resolve Incident (fill reason above)'}
          </button>
        </div>

        {/* Footer */}
        <div className="emergency-modal-footer">
          <div className="emergency-timestamp">{statusMsg}</div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <X size={13} /> Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
