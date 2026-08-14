import React, { useState } from 'react';
import { Bus, MapPin, Navigation, AlertTriangle, Clock, Search, QrCode, ShieldAlert } from 'lucide-react';

const STATIONS = [
  { id: 'ST-01', name: 'Halte Terminal Terboyo', lat: -6.9567, lng: 110.4383, routes: ['Koridor 1', 'Koridor 13'] },
  { id: 'ST-02', name: 'Halte Simpang Lima', lat: -6.9900, lng: 110.4200, routes: ['Koridor 1'] },
  { id: 'ST-03', name: 'Halte Pandanaran', lat: -6.9750, lng: 110.4220, routes: ['Koridor 1', 'Koridor 9'] },
  { id: 'ST-04', name: 'Halte Kota Lama', lat: -6.9650, lng: 110.4300, routes: ['Koridor 1', 'Koridor 9', 'Koridor 13'] },
  { id: 'ST-05', name: 'Halte Kota Station', lat: -6.1375, lng: 106.8146, routes: ['Koridor 1'] }
];

export default function PublicTransit({ vehicles = [], onTriggerPanic }) {
  const [selectedStation, setSelectedStation] = useState(STATIONS[0]);
  const [origin, setOrigin] = useState('ST-01');
  const [destination, setDestination] = useState('ST-05');
  const [routePlan, setRoutePlan] = useState(null);
  const [panicModalOpen, setPanicModalOpen] = useState(false);
  const [selectedVehicleForPanic, setSelectedVehicleForPanic] = useState(vehicles[0]?.id || '');
  const [panicReason, setPanicReason] = useState('harassment');

  // Filter public bus units
  const busUnits = vehicles.filter(v => v.type.toLowerCase().includes('bus') || v.id.startsWith('BUS'));

  // Calculate ETA for selected station
  const calculateETA = (vehicle, station) => {
    const R = 6371; // km
    const dLat = (station.lat - vehicle.lat) * Math.PI / 180;
    const dLng = (station.lng - vehicle.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(vehicle.lat * Math.PI / 180) * Math.cos(station.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distKm = R * c;
    const speed = vehicle.speed > 5 ? vehicle.speed : 30; // fallback avg speed
    const timeMinutes = Math.round((distKm / speed) * 60);
    return { distKm: distKm.toFixed(1), timeMinutes: Math.max(1, timeMinutes) };
  };

  const handlePlanRoute = (e) => {
    e.preventDefault();
    const stOrigin = STATIONS.find(s => s.id === origin);
    const stDest = STATIONS.find(s => s.id === destination);
    setRoutePlan({
      from: stOrigin?.name || origin,
      to: stDest?.name || destination,
      corridor: 'Koridor 1 (Simpang Lima - Kota Lama)',
      totalTime: '24 menit',
      transfers: 'Direct Route (No transfer)',
      fare: 'Rp 3.500',
      nextBusEta: '3 mins'
    });
  };

  const handleSendPanic = () => {
    if (onTriggerPanic) {
      onTriggerPanic(selectedVehicleForPanic, `[PASSENGER PANIC ALERT] Reported issue: ${panicReason.toUpperCase()} on vehicle ${selectedVehicleForPanic}`);
    }
    setPanicModalOpen(false);
  };

  return (
    <div className="page">
      <div className="page-header" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bus size={20} style={{ color: 'var(--accent-blue)' }} />
            Public Transit & Route Planner
          </h1>
          <p className="page-subtitle">Citizen Mobility Portal — Real-time Bus Tracking, Station ETAs & Safety</p>
        </div>
        <button
          className="btn btn-danger"
          onClick={() => setPanicModalOpen(true)}
          style={{ boxShadow: 'var(--shadow-glow-red)' }}
        >
          <ShieldAlert size={16} />
          In-Vehicle Passenger Panic
        </button>
      </div>

      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
        {/* Main Left: Live Bus Overview & Station ETAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Station Selector & ETA Card Grid */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={15} style={{ color: 'var(--accent-blue)' }} />
                Real-Time Station Arrival ETAs
              </span>
              <select
                value={selectedStation.id}
                onChange={(e) => setSelectedStation(STATIONS.find(s => s.id === e.target.value))}
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-accent)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12
                }}
              >
                {STATIONS.map(st => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 10 }}>
              {busUnits.map(bus => {
                const eta = calculateETA(bus, selectedStation);
                return (
                  <div key={bus.id} style={{
                    background: bus.status === 'emergency' ? 'var(--status-red-subtle)' : 'var(--bg-secondary)',
                    border: bus.status === 'emergency' ? '1px solid var(--status-red)' : '1px solid var(--border-subtle)',
                    borderRadius: 10,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                        {bus.code} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({bus.name})</span>
                      </div>
                      <span className={`badge ${bus.status === 'emergency' ? 'badge-red' : 'badge-green'}`}>
                        {bus.status === 'emergency' ? 'EMERGENCY' : 'APPROACHING'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent-blue)', fontWeight: 600 }}>
                        <Clock size={14} />
                        ETA: {eta.timeMinutes} mins ({eta.distKm} km)
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Speed: {Math.round(bus.speed)} km/h
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bus Fleet Corridor List */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Active Public Transport Fleet</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit Code</th>
                  <th>Corridor / Route</th>
                  <th>Driver</th>
                  <th>Current Speed</th>
                  <th>Passengers</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {busUnits.map(v => (
                  <tr key={v.id}>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{v.code}</td>
                    <td>{v.name}</td>
                    <td>{v.driver}</td>
                    <td className="mono">{Math.round(v.speed)} km/h</td>
                    <td className="mono">{v.passengers || 0} passengers</td>
                    <td>
                      <span className={`badge ${v.status === 'emergency' ? 'badge-red' : 'badge-green'}`}>
                        {v.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Sidebar: Point-to-Point Route Planner */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Navigation size={15} style={{ color: 'var(--accent-blue)' }} />
                Point-to-Point Route Planner
              </span>
            </div>

            <form onSubmit={handlePlanRoute} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ORIGIN STATION</label>
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-card)', padding: 8, borderRadius: 6, fontSize: 13 }}
                >
                  {STATIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>DESTINATION STATION</label>
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-card)', padding: 8, borderRadius: 6, fontSize: 13 }}
                >
                  {STATIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: 4, justifyContent: 'center' }}>
                <Search size={14} />
                Find Optimal Transit Route
              </button>
            </form>

            {routePlan && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                  Recommended Journey
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{routePlan.corridor}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>Travel Time: <b>{routePlan.totalTime}</b></div>
                  <div style={{ color: 'var(--text-secondary)' }}>Next Bus ETA: <b style={{ color: 'var(--status-green)' }}>{routePlan.nextBusEta}</b></div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{routePlan.transfers} • Fare: {routePlan.fare}</div>
                </div>
              </div>
            )}
          </div>

          {/* Info Banner */}
          <div style={{
            background: 'var(--accent-blue-subtle)',
            border: '1px solid var(--border-accent)',
            borderRadius: 12,
            padding: 16,
            fontSize: 12,
            color: 'var(--text-secondary)'
          }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-blue)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <QrCode size={16} />
              Bus Boarding & Safety QR
            </div>
            Scan the QR code inside any TransSemarang bus or use the Passenger Panic button if you experience harassment, theft, or medical emergencies.
          </div>
        </div>
      </div>

      {/* Passenger Panic Modal */}
      {panicModalOpen && (
        <div className="modal-overlay">
          <div className="card" style={{ width: 440, border: '2px solid var(--status-red)', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, color: 'var(--status-red)' }}>
              <AlertTriangle size={24} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>In-Vehicle Panic Alert</h3>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Triggering this alert will transmit your vehicle location & alert the VigilOS Command Center and nearby Patrol Units immediately.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>SELECT VEHICLE YOU ARE ON</label>
                <select
                  value={selectedVehicleForPanic}
                  onChange={(e) => setSelectedVehicleForPanic(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-card)', padding: 8, borderRadius: 6, fontSize: 13 }}
                >
                  {busUnits.map(b => (
                    <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>INCIDENT REASON</label>
                <select
                  value={panicReason}
                  onChange={(e) => setPanicReason(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-card)', padding: 8, borderRadius: 6, fontSize: 13 }}
                >
                  <option value="harassment">Sexual Harassment / Threats</option>
                  <option value="robbery">Pickpocketing / Theft / Robbery</option>
                  <option value="medical">Medical Emergency / Fainting</option>
                  <option value="accident">Vehicle Accident / Driver Distress</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setPanicModalOpen(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleSendPanic}>DISPATCH PANIC ALERT</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
