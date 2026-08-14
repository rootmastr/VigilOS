import React, { useState, useEffect } from 'react';
import { FileText, Shield, CheckCircle, Clock, Activity } from 'lucide-react';

const BACKEND_URL = '';

// SVG Gauge Component for Uptime Visualization
function UptimeGauge({ actual, guaranteed, label }) {
  const percentage = Math.min(100, Math.max(0, actual || 0));
  const guaranteedPct = Math.min(100, Math.max(0, guaranteed || 0));
  const radius = 70;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const filled = (percentage / 100) * circumference * 0.75; // 270 degree arc
  const guaranteedFilled = (guaranteedPct / 100) * circumference * 0.75;

  const getColor = (pct) => {
    if (pct >= 99.9) return 'var(--status-green)';
    if (pct >= 99.0) return 'var(--status-amber)';
    return 'var(--status-red)';
  };

  const color = getColor(percentage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="180" height="140" viewBox="0 0 180 140">
        {/* Background arc */}
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="var(--bg-secondary)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform="rotate(135 90 90)"
        />
        {/* Guaranteed line indicator */}
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth={2}
          strokeDasharray={`${guaranteedFilled} ${circumference - guaranteedFilled}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform="rotate(135 90 90)"
          opacity={0.5}
        />
        {/* Actual uptime arc */}
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform="rotate(135 90 90)"
          style={{ transition: 'stroke-dasharray 1s ease-in-out' }}
        />
        {/* Center value */}
        <text x="90" y="85" textAnchor="middle" fill="var(--text-primary)" fontSize="28" fontWeight="bold" fontFamily="var(--font-mono)">
          {percentage.toFixed(2)}%
        </text>
        <text x="90" y="108" textAnchor="middle" fill="var(--text-muted)" fontSize="11">
          {label || 'Uptime'}
        </text>
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 12, height: 3, borderRadius: 2, background: color }} />
          <span style={{ color: 'var(--text-muted)' }}>Actual: {percentage.toFixed(2)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 12, height: 3, borderRadius: 2, background: 'var(--text-muted)', opacity: 0.5 }} />
          <span style={{ color: 'var(--text-muted)' }}>Guaranteed: {guaranteedPct}%</span>
        </div>
      </div>
    </div>
  );
}

export default function SLACompliance({ user: _user }) {
  const [slaDocs, setSlaDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchSLA(); }, []);

  const fetchSLA = async () => {
    try {
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${BACKEND_URL}/api/v1/portal/sla`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setSlaDocs(data.data);
    } catch (e) {
      setSlaDocs([
        { id: 'sla-001', title: 'Enterprise SLA - Semarang', version: '2.1', status: 'ACTIVE', uptimeGuarantee: 99.95, actualUptime: 99.97, responseTimeGuarantee: '< 200ms', supportLevel: '24/7 Priority', acceptedAt: '2024-01-15T08:00:00Z', content: 'VigilOS guarantees 99.95% uptime for the Enterprise tier.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="portal-page"><div className="portal-loading">Loading...</div></div>;

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <div>
          <h1 className="portal-page-title">SLA & Compliance</h1>
          <p className="portal-page-subtitle">Service Level Agreements and compliance reports</p>
        </div>
      </div>

      <div className="portal-page-body">
        {slaDocs.length === 0 ? (
          <div className="portal-card"><div className="portal-card-body"><div className="portal-empty">No SLA documents found</div></div></div>
        ) : (
          slaDocs.map(sla => (
            <div key={sla.id} className="portal-card" style={{ marginBottom: 16 }}>
              <div className="portal-card-header">
                <FileText size={16} style={{ color: 'var(--accent-blue)' }} />
                <span className="portal-card-title">{sla.title}</span>
                <span className="badge badge-green" style={{ marginLeft: 'auto' }}>
                  <CheckCircle size={11} /> {sla.status}
                </span>
              </div>
              <div className="portal-card-body">
                {/* Uptime Gauge Visual */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                  <UptimeGauge
                    actual={sla.actualUptime || sla.uptimeGuarantee}
                    guaranteed={sla.uptimeGuarantee}
                    label="Uptime"
                  />
                </div>

                <div className="portal-sla-metrics">
                  <div className="portal-sla-metric">
                    <Activity size={18} style={{ color: 'var(--status-green)' }} />
                    <div>
                      <div className="portal-sla-metric-value">{sla.uptimeGuarantee}%</div>
                      <div className="portal-sla-metric-label">Uptime Guarantee</div>
                    </div>
                  </div>
                  <div className="portal-sla-metric">
                    <Clock size={18} style={{ color: 'var(--accent-blue)' }} />
                    <div>
                      <div className="portal-sla-metric-value">{sla.responseTimeGuarantee}</div>
                      <div className="portal-sla-metric-label">API Response Time</div>
                    </div>
                  </div>
                  <div className="portal-sla-metric">
                    <Shield size={18} style={{ color: 'var(--status-amber)' }} />
                    <div>
                      <div className="portal-sla-metric-value">{sla.supportLevel}</div>
                      <div className="portal-sla-metric-label">Support Level</div>
                    </div>
                  </div>
                  <div className="portal-sla-metric">
                    <FileText size={18} style={{ color: 'var(--text-muted)' }} />
                    <div>
                      <div className="portal-sla-metric-value">v{sla.version}</div>
                      <div className="portal-sla-metric-label">Document Version</div>
                    </div>
                  </div>
                </div>

                <div className="portal-sla-content">
                  <div className="portal-sla-content-label">Agreement Terms</div>
                  <p className="portal-sla-content-text">{sla.content}</p>
                </div>

                <div className="portal-sla-footer">
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Accepted on {new Date(sla.acceptedAt).toLocaleDateString('id-ID')} by {sla.acceptedBy}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}

        {/* AI Report Placeholder */}
        <div className="portal-card">
          <div className="portal-card-header">
            <Activity size={16} style={{ color: 'var(--status-green)' }} />
            <span className="portal-card-title">AI-Generated Compliance Reports</span>
          </div>
          <div className="portal-card-body">
            <div className="portal-empty" style={{ padding: '24px 0' }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>AI Document Automation Module</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Monthly compliance and fleet performance reports will be automatically generated<br />
                based on telemetry logs using local AI processing. Reports are available for download<br />
                in HTML format at the end of each billing cycle.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
