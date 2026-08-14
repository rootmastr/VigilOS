import React, { useState, useMemo } from 'react';
import { FileText, Search, Clock, MapPin, User, X, Download, FileDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { INCIDENT_LOGS } from '../../data/mockData';

const STATUS_FILTERS = ['all', 'open', 'acknowledged', 'resolved'];
const TYPE_FILTERS = ['all', 'Panic Button', 'Engine Fault', 'Speed Violation', 'Breakdown'];
const SEVERITY_FILTERS = ['all', 'critical', 'high', 'medium', 'low'];
const ITEMS_PER_PAGE = 10;

const typeIcon = (type) => {
  if (type === 'Panic Button') return '🚨';
  if (type === 'Engine Fault') return '⚠️';
  if (type === 'Speed Violation') return '🚀';
  if (type === 'Breakdown') return '🔧';
  return '📋';
};

const severityColor = (sev) => {
  if (sev === 'critical') return 'var(--status-red)';
  if (sev === 'high') return 'var(--status-amber)';
  if (sev === 'medium') return 'var(--accent-blue)';
  return 'var(--text-muted)';
};

// Mock timeline data for detail view
const mockTimeline = (inc) => [
  { time: inc.time, title: 'Incident triggered', desc: `${inc.type} detected on ${inc.vehicleId}`, color: 'var(--status-red)' },
  { time: inc.time, title: 'Alert dispatched', desc: 'Operator notified via WebSocket', color: 'var(--accent-blue)' },
  ...(inc.status !== 'open' ? [{ time: inc.time, title: 'Acknowledged', desc: `By ${inc.operator}`, color: 'var(--status-amber)' }] : []),
  ...(inc.status === 'resolved' ? [{ time: inc.time, title: 'Resolved', desc: 'Incident cleared and logged', color: 'var(--status-green)' }] : []),
];

// Skeleton rows for loading state
function SkeletonRows({ count }) {
  return Array.from({ length: count }).map((_, i) => (
    <tr key={`skel-${i}`}>
      {Array.from({ length: 8 }).map((__, j) => (
        <td key={j}><div className="skeleton-row" style={{ width: j === 0 ? 80 : j === 4 ? 100 : '70%' }} /></td>
      ))}
    </tr>
  ));
}

export default function IncidentLogs() {
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading] = useState(false);
  const [detailIncident, setDetailIncident] = useState(null);

  const filtered = useMemo(() => {
    return INCIDENT_LOGS.filter(inc => {
      const matchFilter = filter === 'all' || inc.status === filter;
      const matchType = typeFilter === 'all' || inc.type === typeFilter;
      const matchSeverity = severityFilter === 'all' || (inc.severity || 'medium') === severityFilter;
      const matchSearch = !search ||
        inc.id.toLowerCase().includes(search.toLowerCase()) ||
        inc.vehicleId.toLowerCase().includes(search.toLowerCase()) ||
        inc.location.toLowerCase().includes(search.toLowerCase()) ||
        inc.type.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchType && matchSeverity && matchSearch;
    });
  }, [filter, typeFilter, severityFilter, search]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openCount = INCIDENT_LOGS.filter(i => i.status === 'open').length;
  const ackCount = INCIDENT_LOGS.filter(i => i.status === 'acknowledged').length;
  const resolvedCount = INCIDENT_LOGS.filter(i => i.status === 'resolved').length;

  // Export CSV
  const exportCSV = () => {
    const headers = ['ID', 'Type', 'Vehicle', 'Location', 'Time', 'Operator', 'Status'];
    const rows = filtered.map(inc => [inc.id, inc.type, inc.vehicleId, inc.location, inc.time, inc.operator, inc.status]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export PDF
  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('VigilOS — Incident Logs Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Total incidents: ${filtered.length}`, 14, 34);

    let y = 44;
    doc.setFontSize(8);
    doc.text('ID', 14, y);
    doc.text('Type', 50, y);
    doc.text('Vehicle', 90, y);
    doc.text('Status', 130, y);
    doc.text('Time', 160, y);
    y += 6;

    filtered.forEach(inc => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(inc.id, 14, y);
      doc.text(inc.type, 50, y);
      doc.text(inc.vehicleId, 90, y);
      doc.text(inc.status, 130, y);
      doc.text(inc.time, 160, y);
      y += 6;
    });

    doc.save(`incidents-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <FileText size={18} style={{ color: 'var(--accent-blue)' }} />
        <div>
          <div className="page-title">Incident Logs</div>
          <div className="page-subtitle">Audit trail & emergency archives</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-red">{openCount} Open</span>
          <span className="badge badge-amber">{ackCount} Acknowledged</span>
          <span className="badge badge-green">{resolvedCount} Resolved</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        {/* Status filters */}
        {STATUS_FILTERS.map(f => (
          <button
            key={f}
            className={`filter-btn${filter === f ? ' active' : ''}`}
            onClick={() => { setFilter(f); setPage(1); }}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 4px' }} />

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-card)',
            borderRadius: 6, padding: '4px 8px', color: 'var(--text-secondary)',
            fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none',
          }}
        >
          {TYPE_FILTERS.map(t => <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>)}
        </select>

        {/* Severity filter */}
        <select
          value={severityFilter}
          onChange={e => { setSeverityFilter(e.target.value); setPage(1); }}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-card)',
            borderRadius: 6, padding: '4px 8px', color: 'var(--text-secondary)',
            fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none',
          }}
        >
          {SEVERITY_FILTERS.map(s => <option key={s} value={s}>{s === 'all' ? 'All Severity' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }} />
          <input
            placeholder="Search incidents..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-card)',
              borderRadius: 8, padding: '6px 12px 6px 30px',
              color: 'var(--text-primary)', fontSize: 12,
              fontFamily: 'var(--font-sans)', width: 200, outline: 'none',
            }}
          />
        </div>

        {/* Export buttons */}
        <div className="export-btn-group">
          <button className="export-btn" onClick={exportCSV}>
            <FileDown size={12} /> CSV
          </button>
          <button className="export-btn" onClick={exportPDF}>
            <Download size={12} /> PDF
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="page-body" style={{ padding: '0' }}>
        <div style={{ padding: '0 24px 24px' }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 20 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Incident ID</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Vehicle</th>
                  <th><MapPin size={10} style={{ display: 'inline', marginRight: 3 }} />Location</th>
                  <th><Clock size={10} style={{ display: 'inline', marginRight: 3 }} />Time</th>
                  <th><User size={10} style={{ display: 'inline', marginRight: 3 }} />Operator</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows count={8} />
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 32 }}>✅</div>
                        <div style={{ fontWeight: 600, color: 'var(--status-green)' }}>No incidents found</div>
                        <div style={{ fontSize: 12 }}>All systems operating normally — great work!</div>
                      </div>
                    </td>
                  </tr>
                ) : paginated.map(inc => (
                  <tr
                    key={inc.id}
                    onClick={() => setDetailIncident(inc)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td>
                      <span className="mono" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{inc.id}</span>
                    </td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{typeIcon(inc.type)}</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{inc.type}</span>
                      </span>
                    </td>
                    <td>
                      <span style={{ color: severityColor(inc.severity || 'medium'), fontWeight: 600, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                        {(inc.severity || 'medium').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: 'var(--text-secondary)' }}>{inc.vehicleId}</span>
                    </td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inc.location}
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 11 }}>{inc.time}</span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: 'var(--text-muted)' }}>{inc.operator}</span>
                    </td>
                    <td>
                      <span className={`badge ${inc.status === 'resolved' ? 'badge-green' : inc.status === 'acknowledged' ? 'badge-amber' : 'badge-red'}`}>
                        {inc.status === 'open' ? '⚠ Open' : inc.status === 'acknowledged' ? '↻ Acknowledged' : '✓ Resolved'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {filtered.length > ITEMS_PER_PAGE && (
              <div className="pagination-bar">
                <span className="pagination-info">
                  Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                </span>
                <div className="pagination-buttons">
                  <button
                    className="pagination-btn"
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft size={12} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        className={`pagination-btn${page === pageNum ? ' active' : ''}`}
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    className="pagination-btn"
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {detailIncident && (
        <div className="incident-detail-drawer">
          <div className="incident-detail-header">
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{detailIncident.id}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detailIncident.type} — {detailIncident.vehicleId}</div>
            </div>
            <button
              onClick={() => setDetailIncident(null)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          <div className="incident-detail-body">
            {/* Info */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Location</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{detailIncident.location}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Operator</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{detailIncident.operator}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Time</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{detailIncident.time}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
                  <span className={`badge ${detailIncident.status === 'resolved' ? 'badge-green' : detailIncident.status === 'acknowledged' ? 'badge-amber' : 'badge-red'}`}>
                    {detailIncident.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
              Incident Timeline
            </div>
            {mockTimeline(detailIncident).map((entry, i) => (
              <div key={i} className="incident-timeline-entry">
                <div className="incident-timeline-dot" style={{ background: entry.color }} />
                <div className="incident-timeline-content">
                  <div className="incident-timeline-title">{entry.title}</div>
                  <div className="incident-timeline-time">{entry.time}</div>
                  <div className="incident-timeline-desc">{entry.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
