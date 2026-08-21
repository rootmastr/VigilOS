import React, { useMemo } from 'react';
import { X, Bus, Truck, Gauge, Navigation2, Users, Zap, Clock, Phone, Route, Package } from 'lucide-react';

const statusLabels = {
  normal:   { label: 'Normal',   cls: 'normal' },
  idle:     { label: 'Idle',     cls: 'idle' },
  warning:  { label: 'Warning',  cls: 'warning' },
  emergency:{ label: 'Emergency',cls: 'emergency' },
};

// Mini sparkline component using SVG
function SpeedSparkline({ speed }) {
  const points = useMemo(() => {
    // Generate simulated 10-minute speed history (60 points at 10s intervals)
    const pts = [];
    const baseSpeed = speed || 30;
    for (let i = 0; i < 30; i++) {
      const variance = Math.sin(i * 0.3) * 10 + (Math.random() - 0.5) * 8;
      pts.push(Math.max(0, baseSpeed + variance));
    }
    return pts;
  }, [speed]);

  const max = Math.max(...points, 60);
  const width = 280;
  const height = 48;
  const step = width / (points.length - 1);

  const pathD = points.map((p, i) => {
    const x = i * step;
    const y = height - (p / max) * height;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');

  const areaD = pathD + ` L${width},${height} L0,${height} Z`;

  return (
    <div className="speed-sparkline-container">
      <div className="speed-sparkline-header">
        <span className="speed-sparkline-title">Speed — Last 10 min</span>
        <span className="speed-sparkline-value">{Math.round(speed)} km/h</span>
      </div>
      <div className="speed-sparkline-chart">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#speedGrad)" />
          <path d={pathD} fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinejoin="round" />
          {/* Current speed dot */}
          <circle
            cx={width}
            cy={height - (points[points.length - 1] / max) * height}
            r="3"
            fill="var(--accent-blue)"
            stroke="var(--bg-card)"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </div>
  );
}

export default function VehicleDrawer({ vehicle, onClose }) {
  if (!vehicle) return null;
  const st = statusLabels[vehicle.status] || statusLabels.normal;

  const headingToDirection = (h) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(h / 45) % 8];
  };

  // GPS stale detection (>30 seconds without update)
  const gpsStale = vehicle._lastUpdate
    ? (Date.now() - vehicle._lastUpdate) > 30000
    : false;
  const gpsStaleSeconds = vehicle._lastUpdate
    ? Math.floor((Date.now() - vehicle._lastUpdate) / 1000)
    : 0;

  const statusBadgeClass = st.cls === 'normal' ? 'badge-green'
    : st.cls === 'idle' ? 'badge-blue'
    : st.cls === 'warning' ? 'badge-amber'
    : 'badge-red';

  const isLogistics = vehicle && (vehicle.type?.includes('Truk') || vehicle.type?.includes('Pick Up') || vehicle.id?.startsWith('TRK') || vehicle.id?.startsWith('PU'));

  return (
    <div className={`vehicle-drawer ${vehicle ? 'open' : ''}`}>
      {/* Header */}
      <div className="vehicle-drawer-header">
        <div className={`vehicle-icon-badge ${st.cls}`}>
          {isLogistics ? <Truck size={20} /> : <Bus size={20} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{vehicle.id}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{vehicle.route}</div>
        </div>
        <button className="vehicle-drawer-close" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      <div className="vehicle-drawer-body">
        {/* Status + GPS Stale */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={`badge ${statusBadgeClass}`}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            {st.label}
          </span>
          {gpsStale && (
            <span className="gps-stale-badge">
              <span className="stale-dot" />
              GPS stale — {gpsStaleSeconds}s ago
            </span>
          )}
        </div>

        {/* Speed Sparkline */}
        <SpeedSparkline speed={vehicle.speed} />

        {/* Live Telemetry */}
        <div>
          <div className="telemetry-section-title">Live Telemetry</div>
          <div className="telemetry-grid">
            <div className="telemetry-item">
              <div className="telemetry-label"><Gauge size={9} style={{ display: 'inline' }} /> Speed</div>
              <div className="telemetry-value">
                {Math.round(vehicle.speed)}
                <span className="telemetry-unit"> km/h</span>
              </div>
            </div>
            <div className="telemetry-item">
              <div className="telemetry-label"><Navigation2 size={9} style={{ display: 'inline' }} /> Heading</div>
              <div className="telemetry-value">
                {headingToDirection(vehicle.heading)}
                <span className="telemetry-unit"> {Math.round(vehicle.heading)}°</span>
              </div>
            </div>
            <div className="telemetry-item">
              <div className="telemetry-label"><Users size={9} style={{ display: 'inline' }} /> Passengers</div>
              <div className="telemetry-value">{vehicle.passengers}<span className="telemetry-unit"> pax</span></div>
            </div>
            <div className="telemetry-item">
              <div className="telemetry-label"><Zap size={9} style={{ display: 'inline' }} /> Engine</div>
              <div className="telemetry-value" style={{ fontSize: 13 }}>{vehicle.engine}</div>
            </div>
            {isLogistics && (
              <>
                <div className="telemetry-item">
                  <div className="telemetry-label"><Package size={9} style={{ display: 'inline' }} /> Cargo</div>
                  <div className="telemetry-value" style={{ fontSize: 13 }}>{vehicle.cargo || '-'}</div>
                </div>
                <div className="telemetry-item">
                  <div className="telemetry-label"><Truck size={9} style={{ display: 'inline' }} /> Capacity</div>
                  <div className="telemetry-value" style={{ fontSize: 13 }}>{vehicle.capacity || '-'}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Coordinates */}
        <div>
          <div className="telemetry-section-title">Coordinates</div>
          <div className="telemetry-item" style={{ marginBottom: 6 }}>
            <div className="telemetry-label">GPS Position</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {vehicle.lat != null ? `${vehicle.lat.toFixed(6)}°S` : '--°S'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
              {vehicle.lng != null ? `${vehicle.lng.toFixed(6)}°E` : '--°E'}
            </div>
          </div>
        </div>

        {/* Driver Info */}
        <div>
          <div className="telemetry-section-title">Driver Information</div>
          <div className="driver-card">
            <div className="driver-avatar">
              {vehicle.driver ? vehicle.driver.split(' ').map(n => n[0]).join('').slice(0, 2) : '?'}
            </div>
            <div>
              <div className="driver-name">{vehicle.driver || 'Unassigned'}</div>
              <div className="driver-id">{vehicle.driverId}</div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div>
          <div className="telemetry-section-title">Actions</div>
          <div className="vehicle-drawer-actions">
            <button className="vehicle-action-btn primary">
              <Phone size={13} />
              Hubungi Kabin
            </button>
            <button className="vehicle-action-btn">
              <Route size={13} />
              Lihat Riwayat
            </button>
          </div>
        </div>

        {/* Last Updated */}
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          <Clock size={10} style={{ display: 'inline', marginRight: 4 }} />
          Live — updates every 2s
        </div>
      </div>
    </div>
  );
}
