import React from 'react';
import { BarChart2, TrendingUp, TrendingDown, AlertCircle, Zap, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';
import { TRAFFIC_DATA } from '../../data/mockData';

const TOTAL_VOLUME = TRAFFIC_DATA.reduce((a, c) => a + c.volume, 0);
const AVG_SPEED = Math.round(TRAFFIC_DATA.reduce((a, c) => a + c.avgSpeed, 0) / TRAFFIC_DATA.length);
const TOTAL_INCIDENTS = TRAFFIC_DATA.reduce((a, c) => a + c.incidents, 0);
const AVG_SCORE = Math.round(TRAFFIC_DATA.reduce((a, c) => a + c.score, 0) / TRAFFIC_DATA.length);

function scoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

// Generate hourly traffic data for the line chart
const HOURLY_DATA = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, '0')}:00`,
  volume: Math.floor(800 + Math.sin(i / 3) * 400 + Math.random() * 200),
  avgSpeed: Math.floor(25 + Math.cos(i / 4) * 10 + Math.random() * 5),
}));

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 13 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ fontSize: 12, color: p.color, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span>{p.name}:</span>
            <span style={{ fontWeight: 600 }}>{p.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function TrafficAnalytics() {
  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <BarChart2 size={18} style={{ color: 'var(--accent-blue)' }} />
        <div>
          <div className="page-title">Traffic Analytics</div>
          <div className="page-subtitle">Heatmaps, corridor performance & bottleneck analysis</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Last updated: {new Date().toLocaleTimeString('id-ID')}
        </div>
      </div>

      <div className="page-body">
        {/* KPI Stats */}
        <div className="analytics-grid">
          <div className="stat-card">
            <div className="stat-card-label">Total Volume</div>
            <div className="stat-card-value glow-text-blue">{TOTAL_VOLUME.toLocaleString()}</div>
            <div className="stat-card-sub">
              <TrendingUp size={12} className="stat-card-trend-up" /> <span className="stat-card-trend-up">+8.3%</span> from yesterday
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Avg Speed</div>
            <div className="stat-card-value glow-text-green">{AVG_SPEED}</div>
            <div className="stat-card-sub">km/h across all corridors</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Total Incidents</div>
            <div className="stat-card-value glow-text-red">{TOTAL_INCIDENTS}</div>
            <div className="stat-card-sub">
              <TrendingDown size={12} className="stat-card-trend-up" /> <span className="stat-card-trend-up">-2</span> from yesterday
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Network Score</div>
            <div className="stat-card-value" style={{ color: scoreColor(AVG_SCORE) }}>{AVG_SCORE}</div>
            <div className="stat-card-sub">Overall efficiency index</div>
          </div>
        </div>

        <div className="analytics-bottom-grid">
          {/* Traffic Volume Chart — Recharts */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><Activity size={12} style={{ display: 'inline', marginRight: 6 }} />Traffic Volume by Corridor</div>
            </div>
            <div style={{ padding: '16px 16px 8px' }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={TRAFFIC_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="corridor"
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    axisLine={{ stroke: 'var(--border-subtle)' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    axisLine={{ stroke: 'var(--border-subtle)' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="volume" name="Volume" radius={[4, 4, 0, 0]}>
                    {TRAFFIC_DATA.map((entry, index) => (
                      <Cell key={index} fill={scoreColor(entry.score)} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottleneck Ranking */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><AlertCircle size={12} style={{ display: 'inline', marginRight: 6 }} />Bottleneck Index</div>
            </div>
            <div className="bottleneck-list">
              {[...TRAFFIC_DATA]
                .sort((a, b) => a.score - b.score)
                .map(d => (
                  <div key={d.corridor} className="bottleneck-item">
                    <div className="bottleneck-score" style={{
                      background: `${scoreColor(d.score)}22`,
                      border: `1px solid ${scoreColor(d.score)}44`,
                      color: scoreColor(d.score),
                    }}>
                      {d.score}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{d.corridor}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {d.avgSpeed} km/h avg · {d.incidents} incident{d.incidents !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div>
                      <span className={`badge ${d.score >= 80 ? 'badge-green' : d.score >= 60 ? 'badge-amber' : 'badge-red'}`}>
                        {d.score >= 80 ? 'Good' : d.score >= 60 ? 'Fair' : 'Poor'}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Hourly Trend Chart */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <div className="card-title"><Zap size={12} style={{ display: 'inline', marginRight: 6 }} />Hourly Traffic Trend</div>
          </div>
          <div style={{ padding: '16px 16px 8px' }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={HOURLY_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  interval={3}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }}
                />
                <Line
                  type="monotone"
                  dataKey="volume"
                  name="Volume"
                  stroke="var(--accent-blue)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="avgSpeed"
                  name="Avg Speed"
                  stroke="var(--status-green)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Heatmap Visual */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <div className="card-title"><Zap size={12} style={{ display: 'inline', marginRight: 6 }} />Congestion Heatmap — Semarang (Simulated)</div>
          </div>
          <div style={{
            height: 180,
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {/* Heatmap blobs */}
            {[
              { top: '20%', left: '30%', size: 120, color: '#ef4444', opacity: 0.35 },
              { top: '50%', left: '55%', size: 90,  color: '#f59e0b', opacity: 0.3  },
              { top: '65%', left: '20%', size: 70,  color: '#f59e0b', opacity: 0.25 },
              { top: '35%', left: '70%', size: 60,  color: '#10b981', opacity: 0.2  },
              { top: '75%', left: '65%', size: 80,  color: '#10b981', opacity: 0.2  },
              { top: '10%', left: '60%', size: 55,  color: '#ef4444', opacity: 0.25 },
            ].map((blob, i) => (
              <div key={i} style={{
                position: 'absolute',
                top: blob.top, left: blob.left,
                width: blob.size, height: blob.size,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${blob.color} 0%, transparent 70%)`,
                opacity: blob.opacity,
                transform: 'translate(-50%, -50%)',
                filter: 'blur(12px)',
              }} />
            ))}
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>REAL-TIME CONGESTION OVERLAY</div>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                {[['#ef4444', 'High'], ['#f59e0b', 'Medium'], ['#10b981', 'Low']].map(([c, l]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
                    <span>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
