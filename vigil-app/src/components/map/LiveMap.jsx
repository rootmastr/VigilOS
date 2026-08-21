import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.heat';
import VehicleDrawer from './VehicleDrawer';
import { Map as MapIcon, Layers, RefreshCw, AlertTriangle, Search, WifiOff } from 'lucide-react';
import { GEOFENCES, CORRIDORS } from '../../data/mockData';
import { LOGISTIK_A_GEOFENCES, LOGISTIK_A_CORRIDORS } from '../../data/mockDataLogistik';

// Leaflet default icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Directional arrow marker with heading rotation
function createVehicleIcon(status, heading, vehicleType) {
  const colors = {
    normal:    { fill: '#10b981', stroke: '#059669', glow: 'rgba(16,185,129,0.7)' },
    idle:      { fill: '#6b7280', stroke: '#4b5563', glow: 'rgba(107,114,128,0.5)' },
    warning:   { fill: '#facc15', stroke: '#ca8a04', glow: 'rgba(250,204,21,0.8)' },
    emergency: { fill: '#ef4444', stroke: '#991b1b', glow: 'rgba(239,68,68,0.9)' },
  };
  const c = colors[status] || colors.normal;
  const pulse = status === 'emergency' ? `
    <animate attributeName="r" values="18;24;18" dur="1s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.6;0;0.6" dur="1s" repeatCount="indefinite"/>
  ` : status === 'warning' ? `
    <animate attributeName="r" values="16;21;16" dur="1.5s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.5;0;0.5" dur="1.5s" repeatCount="indefinite"/>
  ` : '';
  const pulseCircle = (status === 'emergency' || status === 'warning')
    ? `<circle cx="20" cy="20" r="16" fill="${c.fill}" opacity="0.3">${pulse}</circle>`
    : '';

  const rot = heading || 0;
  const isLogistics = vehicleType?.includes('Truk') || vehicleType?.includes('Pick Up');

  // Truck icon: rectangle body with cab; Bus/arrow: triangle arrow
  const vehicleShape = isLogistics
    ? `<g transform="rotate(${rot} 20 20)">
        <rect x="10" y="12" width="20" height="14" rx="2" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"/>
        <rect x="14" y="14" width="8" height="6" rx="1" fill="white" opacity="0.9"/>
        <circle cx="14" cy="28" r="2.5" fill="${c.stroke}"/>
        <circle cx="26" cy="28" r="2.5" fill="${c.stroke}"/>
       </g>`
    : `<g transform="rotate(${rot} 20 20)">
        <circle cx="20" cy="20" r="12" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2.5"/>
        <path d="M20 8 L26 24 L20 20 L14 24 Z" fill="white" opacity="0.95"/>
       </g>`;

  const svg = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    ${pulseCircle}
    ${vehicleShape}
  </svg>`;

  return L.divIcon({
    className: '',
    html: svg,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -24],
  });
}

// Convert buffer meters to approximate lat/lng offset
function metersToLatLngOffset(meters, lat) {
  const latOffset = meters / 111320;
  const lngOffset = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  return { latOffset, lngOffset };
}

// Create corridor buffer polygon from waypoints
function createCorridorBuffer(waypoints, bufferMeters) {
  if (!waypoints || waypoints.length < 2) return [];
  const outerPoints = [];
  const innerPoints = [];

  for (let i = 0; i < waypoints.length; i++) {
    const [lat, lng] = waypoints[i];
    const { latOffset, lngOffset } = metersToLatLngOffset(bufferMeters, lat);

    let angle;
    if (i === 0) {
      const [nextLat, nextLng] = waypoints[i + 1];
      angle = Math.atan2(nextLng - lng, nextLat - lat);
    } else if (i === waypoints.length - 1) {
      const [prevLat, prevLng] = waypoints[i - 1];
      angle = Math.atan2(lng - prevLng, lat - prevLat);
    } else {
      const [prevLat, prevLng] = waypoints[i - 1];
      const [nextLat, nextLng] = waypoints[i + 1];
      const a1 = Math.atan2(lng - prevLng, lat - prevLat);
      const a2 = Math.atan2(nextLng - lng, nextLat - lat);
      angle = (a1 + a2) / 2;
    }
    const perpAngle = angle + Math.PI / 2;
    outerPoints.push([lat + latOffset * Math.cos(perpAngle), lng + lngOffset * Math.sin(perpAngle)]);
    innerPoints.unshift([lat - latOffset * Math.cos(perpAngle), lng - lngOffset * Math.sin(perpAngle)]);
  }
  return [...outerPoints, ...innerPoints];
}

export default function LiveMap({ vehicles, onVehicleClick, selectedVehicle, onCloseDrawer, routeDeviations, connected, tenantId = 'transsemarang-01' }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const clusterGroupRef = useRef(null);
  const geofenceLayersRef = useRef([]);
  const corridorLayersRef = useRef([]);
  const heatLayerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showCorridors, setShowCorridors] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const prevPositionsRef = useRef({});

  // Get tenant-specific geofences and corridors
  const currentGeofences = tenantId === 'logistik-a-01' ? LOGISTIK_A_GEOFENCES : GEOFENCES;
  const currentCorridors = tenantId === 'logistik-a-01' ? LOGISTIK_A_CORRIDORS : CORRIDORS;

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !searchFocused) return [];
    const q = searchQuery.toLowerCase();
    return vehicles.filter(v =>
      v.id.toLowerCase().includes(q) ||
      v.code?.toLowerCase().includes(q) ||
      v.name?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [vehicles, searchQuery, searchFocused]);

  // Initialize map
  useEffect(() => {
    if (mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [-6.9666, 110.4196],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/" target="_blank">CARTO</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Initialize marker cluster group
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      chunkedLoading: true,
      iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        let size = 'small';
        if (count > 10) size = 'medium';
        if (count > 20) size = 'large';
        return L.divIcon({
          html: `<div>${count}</div>`,
          className: `marker-cluster marker-cluster-${size}`,
          iconSize: L.point(36, 36),
        });
      }
    });
    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;

    mapInstanceRef.current = map;

    setTimeout(() => {
      setMapReady(true);
      setMapLoading(false);
    }, 600);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render geofence polygons
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    geofenceLayersRef.current.forEach(layer => map.removeLayer(layer));
    geofenceLayersRef.current = [];
    if (!showGeofences) return;

    currentGeofences.forEach(geofence => {
      const polygon = L.polygon(geofence.coordinates, {
        color: geofence.color,
        weight: 2,
        opacity: geofence.borderOpacity,
        fillColor: geofence.color,
        fillOpacity: geofence.opacity,
        dashArray: '6 4',
      }).addTo(map);
      polygon.bindTooltip(geofence.name, { permanent: false, direction: 'center', className: 'geofence-tooltip' });
      geofenceLayersRef.current.push(polygon);
    });
  }, [mapReady, showGeofences, currentGeofences]);

  // Render corridor buffers
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    corridorLayersRef.current.forEach(layer => map.removeLayer(layer));
    corridorLayersRef.current = [];
    if (!showCorridors) return;

    currentCorridors.forEach(corridor => {
      const centerline = L.polyline(corridor.waypoints, {
        color: corridor.color,
        weight: 3,
        opacity: 0.7,
        dashArray: '8 6',
      }).addTo(map);
      centerline.bindTooltip(`${corridor.name} — ${corridor.bufferMeters}m buffer`, { permanent: false, direction: 'center', className: 'corridor-tooltip' });
      corridorLayersRef.current.push(centerline);

      const bufferPoints = createCorridorBuffer(corridor.waypoints, corridor.bufferMeters);
      if (bufferPoints.length > 0) {
        const buffer = L.polygon(bufferPoints, {
          color: corridor.color,
          weight: 1,
          opacity: 0.25,
          fillColor: corridor.color,
          fillOpacity: 0.06,
        }).addTo(map);
        corridorLayersRef.current.push(buffer);
      }

      corridor.waypoints.forEach((wp) => {
        const waypointMarker = L.circleMarker(wp, {
          radius: 4,
          color: corridor.color,
          fillColor: corridor.color,
          fillOpacity: 0.8,
          weight: 2,
          opacity: 0.6,
        }).addTo(map);
        corridorLayersRef.current.push(waypointMarker);
      });
    });
  }, [mapReady, showCorridors, currentCorridors]);

  // Heatmap layer
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (showHeatmap) {
      const heatData = vehicles
        .filter(v => v.speed > 0 && v.lat != null && v.lng != null)
        .map(v => [v.lat, v.lng, Math.min(v.speed / 60, 1)]);
      heatLayerRef.current = L.heatLayer(heatData, {
        radius: 30,
        blur: 20,
        maxZoom: 17,
        max: 1.0,
        gradient: {
          0.0: '#10b981',
          0.3: '#facc15',
          0.6: '#f59e0b',
          1.0: '#ef4444'
        }
      }).addTo(map);
    }
  }, [mapReady, showHeatmap, vehicles]);

  // Update markers with smooth interpolation and clustering
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !clusterGroupRef.current) return;
    const map = mapInstanceRef.current;
    const cluster = clusterGroupRef.current;

    const currentIds = new Set(vehicles.map(v => v.id));
    const prevPositions = prevPositionsRef.current;

    // Remove markers for deleted vehicles
    Object.keys(markersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        cluster.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
        delete prevPositions[id];
      }
    });

    vehicles.forEach(vehicle => {
      if (vehicle.lat == null || vehicle.lng == null) return;
      const latLng = [vehicle.lat, vehicle.lng];
      const icon = createVehicleIcon(vehicle.status, vehicle.heading, vehicle.type);
      const prevPos = prevPositions[vehicle.id];

      if (markersRef.current[vehicle.id]) {
        const marker = markersRef.current[vehicle.id];
        marker.setIcon(icon);

        // Smooth interpolation
        if (prevPos) {
          const steps = 10;
          const startLat = prevPos[0];
          const startLng = prevPos[1];
          const endLat = vehicle.lat;
          const endLng = vehicle.lng;
          let step = 0;

          const animate = () => {
            step++;
            const t = step / steps;
            const curLat = startLat + (endLat - startLat) * t;
            const curLng = startLng + (endLng - startLng) * t;
            marker.setLatLng([curLat, curLng]);
            if (step < steps) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        } else {
          marker.setLatLng(latLng);
        }
      } else {
        const marker = L.marker(latLng, { icon }).addTo(cluster);
        marker.on('click', () => onVehicleClick && onVehicleClick(vehicle));
        markersRef.current[vehicle.id] = marker;
      }

      prevPositions[vehicle.id] = latLng;
    });
  }, [vehicles, mapReady, onVehicleClick]);

  // Center on emergency/warning vehicles
  const vehicleStatuses = vehicles.map(v => v.status).join(',');
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const alertVehicle = vehicles.find(v => (v.status === 'emergency' || v.status === 'warning') && v.lat != null && v.lng != null);
    if (alertVehicle) {
      mapInstanceRef.current.flyTo([alertVehicle.lat, alertVehicle.lng], 15, { duration: 1.5 });
    }
  }, [vehicleStatuses, mapReady, vehicles]);

  const recenterMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([-6.9666, 110.4196], 13, { duration: 1 });
    }
  };

  const normalCount = vehicles.filter(v => v.status === 'normal').length;
  const warnCount   = vehicles.filter(v => v.status === 'warning').length;
  const emergCount  = vehicles.filter(v => v.status === 'emergency').length;
  const totalCount  = vehicles.length;

  const handleSearchSelect = (vehicle) => {
    setSearchQuery('');
    setSearchFocused(false);
    onVehicleClick && onVehicleClick(vehicle);
    if (mapInstanceRef.current && vehicle.lat != null && vehicle.lng != null) {
      mapInstanceRef.current.flyTo([vehicle.lat, vehicle.lng], 16, { duration: 1 });
    }
  };

  return (
    <div className="page" style={{ position: 'relative' }}>
      {/* Loading Skeleton */}
      {mapLoading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2000,
          background: 'var(--bg-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="skeleton-circle" style={{ width: 12, height: 12, background: 'var(--status-green)' }} />
            <div className="skeleton-circle" style={{ width: 12, height: 12, background: 'var(--accent-blue)' }} />
            <div className="skeleton-circle" style={{ width: 12, height: 12, background: 'var(--status-amber)' }} />
          </div>
          <div className="skeleton-row wide" style={{ width: 180 }} />
          <div className="skeleton-row" style={{ width: 120 }} />
        </div>
      )}

      {/* WebSocket Disconnect Banner */}
      {!connected && (
        <div className="map-disconnect-banner">
          <WifiOff size={13} />
          <span>Connection lost — attempting to reconnect...</span>
          <div className="pulse-dot" />
        </div>
      )}

      {/* Search Bar */}
      <div className="map-search-container">
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          className="map-search-input"
          placeholder="Search vehicle (ID, code, name)..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
        />
        {searchResults.length > 0 && searchFocused && (
          <div className="map-search-results">
            {searchResults.map(v => (
              <div
                key={v.id}
                className="map-search-result-item"
                onMouseDown={() => handleSearchSelect(v)}
              >
                <span className="result-id">{v.id}</span>
                <span className="result-name">{v.code || v.name}</span>
                <span
                  className="result-status"
                  style={{
                    background: v.status === 'normal' ? 'rgba(16,185,129,0.15)' :
                                v.status === 'warning' ? 'rgba(250,204,21,0.15)' :
                                v.status === 'emergency' ? 'rgba(239,68,68,0.15)' :
                                'rgba(107,114,128,0.15)',
                    color: v.status === 'normal' ? '#10b981' :
                           v.status === 'warning' ? '#facc15' :
                           v.status === 'emergency' ? '#ef4444' : '#6b7280',
                  }}
                >
                  {v.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Counter Overlay */}
      <div className="map-counter-overlay">
        <div className="map-counter-card">
          <div className="map-counter-dot" style={{ background: 'var(--accent-blue)' }} />
          <span className="map-counter-label">Active</span>
          <span className="map-counter-value" style={{ color: 'var(--accent-blue)' }}>{totalCount}</span>
        </div>
        <div className="map-counter-card">
          <div className="map-counter-dot" style={{ background: 'var(--status-green)' }} />
          <span className="map-counter-label">Normal</span>
          <span className="map-counter-value" style={{ color: 'var(--status-green)' }}>{normalCount}</span>
        </div>
        <div className="map-counter-card">
          <div className="map-counter-dot" style={{ background: 'var(--status-yellow)' }} />
          <span className="map-counter-label">Warning</span>
          <span className="map-counter-value" style={{ color: 'var(--status-yellow)' }}>{warnCount}</span>
        </div>
        <div className="map-counter-card">
          <div className="map-counter-dot" style={{ background: 'var(--status-red)' }} />
          <span className="map-counter-label">Critical</span>
          <span className="map-counter-value" style={{ color: 'var(--status-red)' }}>{emergCount}</span>
        </div>
      </div>

      {/* Map Controls */}
      <div className="map-controls">
        <div className="map-control-panel">
          <MapIcon size={14} style={{ color: 'var(--accent-blue)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>Semarang, Indonesia</span>
          <div style={{ width: 1, height: 14, background: 'var(--border-subtle)', margin: '0 4px' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Live Feed</span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--status-green)' : 'var(--status-red)', animation: connected ? 'pulse-green 2s infinite' : 'none' }} />
        </div>
        <button
          onClick={recenterMap}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-card)',
            borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-sans)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <RefreshCw size={12} /> Recenter
        </button>

        {/* Layer Toggle Buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { label: 'Geofence', show: showGeofences, toggle: () => setShowGeofences(!showGeofences) },
            { label: 'Corridor', show: showCorridors, toggle: () => setShowCorridors(!showCorridors) },
            { label: 'Heatmap', show: showHeatmap, toggle: () => setShowHeatmap(!showHeatmap) },
          ].map(({ label, show, toggle }) => (
            <button
              key={label}
              onClick={toggle}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: show ? 'var(--accent-blue-subtle)' : 'var(--bg-secondary)',
                border: `1px solid ${show ? 'var(--border-accent)' : 'var(--border-card)'}`,
                borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                color: show ? 'var(--accent-blue)' : 'var(--text-muted)', fontSize: 11,
                fontFamily: 'var(--font-mono)', boxShadow: 'var(--shadow-card)',
              }}
            >
              <Layers size={11} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="map-legend">
        <div className="map-legend-title">Vehicle Status</div>
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#10b981' }} />
          Normal <span style={{ marginLeft: 4, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{normalCount}</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#6b7280' }} />
          Idle <span style={{ marginLeft: 4, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{vehicles.filter(v => v.status === 'idle').length}</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#facc15' }} />
          Warning <span style={{ marginLeft: 4, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{warnCount}</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#ef4444' }} />
          Emergency <span style={{ marginLeft: 4, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{emergCount}</span>
        </div>
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
        <div className="map-legend-title">Map Layers</div>
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#3b82f6', opacity: 0.3, border: '1px dashed #3b82f6' }} />
          Geofence Zones
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#10b981', opacity: 0.3, border: '1px dashed #10b981' }} />
          Corridor Buffers
        </div>
      </div>

      {/* Route Deviation Indicators */}
      {routeDeviations && routeDeviations.filter(d => !d.resolved).length > 0 && (
        <div className="map-deviation-indicator">
          <AlertTriangle size={14} style={{ color: 'var(--status-amber)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {routeDeviations.filter(d => !d.resolved && d.severity === 'critical').length} Critical
          </span>
          <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>/</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--status-amber)' }}>
            {routeDeviations.filter(d => !d.resolved && d.severity === 'warning').length} Warning
          </span>
        </div>
      )}

      {/* Empty State */}
      {vehicles.length === 0 && !mapLoading && (
        <div className="map-empty-state">
          <div className="empty-icon">
            <MapIcon size={28} />
          </div>
          <div className="empty-title">No vehicles registered</div>
          <div className="empty-desc">Add your first vehicle to start tracking the fleet in real-time.</div>
        </div>
      )}

      {/* Map Canvas */}
      <div ref={mapRef} className="leaflet-map" style={{ height: '100%', width: '100%' }} />

      {/* Vehicle Drawer */}
      {selectedVehicle && (
        <VehicleDrawer vehicle={selectedVehicle} onClose={onCloseDrawer} />
      )}
    </div>
  );
}
