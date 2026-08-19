import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';

const BACKEND_URL = '';

export function useWebSocket(onEmergency, onRouteDeviation, tenantId = 'transsemarang-01') {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [connected, setConnected] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [deviceTokens, setDeviceTokens] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [routeDeviations, setRouteDeviations] = useState([]);
  const socketRef = useRef(null);
  const emergencyCallbackRef = useRef(onEmergency);
  const routeDeviationCallbackRef = useRef(onRouteDeviation);

  // Reset data when tenant changes — fetch fresh from API
  useEffect(() => {
    let active = true;
    async function fetchInitial() {
      try {
        const [vehRes, drvRes] = await Promise.all([
          api.get('/api/v1/fleet/vehicles'),
          api.get('/api/v1/fleet/drivers'),
        ]);
        if (!active) return;
        if (vehRes.data.success) setVehicles(vehRes.data.data);
        if (drvRes.data.success) setDrivers(drvRes.data.data);
      } catch (e) {
        console.warn('Failed to fetch initial fleet data:', e);
      }
    }
    fetchInitial();
    return () => { active = false; };
  }, [tenantId]);

  useEffect(() => {
    emergencyCallbackRef.current = onEmergency;
  }, [onEmergency]);

  useEffect(() => {
    routeDeviationCallbackRef.current = onRouteDeviation;
  }, [onRouteDeviation]);

  useEffect(() => {
    let active = true;
    const socket = io(BACKEND_URL, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (!active) return;
      console.log('[WebSocket Client] Connected to VigilOS Backend Server');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      if (!active) return;
      console.log('[WebSocket Client] Disconnected from VigilOS Backend Server');
      setConnected(false);
    });

    socket.on('initial_state', (data) => {
      if (!active) return;
      if (data.vehicles) {
        setVehicles(data.vehicles);
      }
      if (data.drivers) {
        setDrivers(data.drivers);
      }
      if (data.officers) {
        setOfficers(data.officers);
      }
      if (data.incidents) {
        setIncidents(data.incidents);
      }
      if (data.deviceTokens) {
        setDeviceTokens(data.deviceTokens);
      }
      if (data.securityEvents) {
        setSecurityEvents(data.securityEvents);
      }
      if (data.routeDeviations) {
        setRouteDeviations(data.routeDeviations);
      }
    });

    socket.on('officer_status_changed', (updatedOfficer) => {
      if (!active) return;
      setOfficers(prev => prev.map(o => o.id === updatedOfficer.id ? updatedOfficer : o));
    });

    socket.on('telemetry_update', (update) => {
      if (!active) return;
      setVehicles(prev =>
        prev.map(v => (v.id === update.vehicleId ? { ...v, ...update } : v))
      );
    });

    socket.on('emergency_alert', (data) => {
      if (!active) return;
      const { incident, vehicle } = data;
      setVehicles(prev =>
        prev.map(v => (v.id === vehicle.id ? { ...v, status: 'emergency' } : v))
      );
      setIncidents(prev => [incident, ...prev.filter(i => i.id !== incident.id)]);

      if (emergencyCallbackRef.current) {
        emergencyCallbackRef.current(vehicle || incident);
      }
    });

    socket.on('incident_acknowledged', (incident) => {
      if (!active) return;
      setIncidents(prev => prev.map(i => i.id === incident.id ? incident : i));
    });

    socket.on('incident_resolved', (incident) => {
      if (!active) return;
      setIncidents(prev => prev.map(i => i.id === incident.id ? incident : i));
      setVehicles(prev =>
        prev.map(v => (v.id === incident.vehicleId ? { ...v, status: 'normal' } : v))
      );
    });

    // Route Deviation Events — 3-state workflow
    socket.on('route_deviation_event', (event) => {
      if (!active) return;
      const { vehicleId, severity, deviationMeters, route, lat, lng } = event;

      setRouteDeviations(prev => {
        const existing = prev.find(d => d.vehicleId === vehicleId);
        const updated = {
          id: existing?.id || `DEV-${Date.now()}`,
          vehicleId,
          severity,         // 'normal' | 'warning' | 'critical'
          deviationMeters: deviationMeters || 0,
          route: route || '',
          lat: lat || 0,
          lng: lng || 0,
          timestamp: new Date().toISOString(),
          resolved: false,
        };

        // Remove existing deviation for this vehicle and add updated one
        const filtered = prev.filter(d => d.vehicleId !== vehicleId);
        if (severity === 'normal') {
          // Clear deviation when vehicle returns to route
          return filtered;
        }
        return [updated, ...filtered];
      });

      // Update vehicle status based on severity
      setVehicles(prev =>
        prev.map(v => {
          if (v.id === vehicleId) {
            const newStatus = severity === 'critical' ? 'emergency' : severity === 'warning' ? 'warning' : 'normal';
            return { ...v, status: newStatus };
          }
          return v;
        })
      );

      // Trigger callback for UI handling (warning toast or critical modal)
      if (routeDeviationCallbackRef.current && severity !== 'normal') {
        routeDeviationCallbackRef.current({
          vehicleId,
          severity,
          deviationMeters,
          route,
          lat,
          lng,
        });
      }
    });

    socket.on('route_deviation_resolved', (data) => {
      if (!active) return;
      const { vehicleId, resolutionReason } = data;
      setRouteDeviations(prev =>
        prev.map(d => d.vehicleId === vehicleId ? { ...d, resolved: true, resolutionReason } : d)
      );
      setVehicles(prev =>
        prev.map(v => v.id === vehicleId ? { ...v, status: 'normal' } : v)
      );
    });

    socket.on('vehicle_added', (newVehicle) => {
      if (!active) return;
      setVehicles(prev => [...prev.filter(v => v.id !== newVehicle.id), newVehicle]);
    });

    socket.on('vehicle_updated', (updated) => {
      if (!active) return;
      setVehicles(prev => prev.map(v => v.id === updated.id ? updated : v));
    });

    socket.on('vehicle_deleted', ({ id }) => {
      if (!active) return;
      setVehicles(prev => prev.filter(v => v.id !== id));
    });

    socket.on('driver_added', (newDriver) => {
      if (!active) return;
      setDrivers(prev => [...prev.filter(d => d.id !== newDriver.id), newDriver]);
    });

    socket.on('driver_updated', (updated) => {
      if (!active) return;
      setDrivers(prev => prev.map(d => d.id === updated.id ? updated : d));
    });

    socket.on('driver_deleted', ({ id }) => {
      if (!active) return;
      setDrivers(prev => prev.filter(d => d.id !== id));
    });

    socket.on('token_updated', ({ token }) => {
      if (!active) return;
      setDeviceTokens(prev => {
        const others = prev.filter(t => t.id !== token.id);
        return [token, ...others];
      });
    });

    socket.on('security_event', (event) => {
      if (!active) return;
      setSecurityEvents(prev => [event, ...prev.filter(e => e.id !== event.id)].slice(0, 200));
    });

    return () => {
      active = false;
      socket.disconnect();
    };
  }, []);

  const triggerRandomEmergency = useCallback((vehicleId, details) => {
    if (socketRef.current && socketRef.current.connected && vehicleId) {
      socketRef.current.emit('trigger_panic_button', {
        vehicleId: vehicleId,
        details: details || 'Manual Panic Button alert dispatched from Command Center.'
      });
    }
  }, []);

  const acknowledgeEmergency = useCallback((incidentId) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('acknowledge_incident', { incidentId, operatorId: 'Operator 04' });
    }
  }, []);

  const resolveEmergency = useCallback((vehicleId, incidentId) => {
    if (socketRef.current && socketRef.current.connected) {
      if (incidentId) {
        socketRef.current.emit('resolve_incident', { incidentId, operatorId: 'Operator 04' });
      } else {
        setVehicles(prev => prev.map(v => (v.id === vehicleId ? { ...v, status: 'normal' } : v)));
      }
    } else {
      setVehicles(prev => prev.map(v => (v.id === vehicleId ? { ...v, status: 'normal' } : v)));
    }
  }, []);

  const resolveRouteDeviation = useCallback((deviation, resolutionReason) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('resolve_route_deviation', {
        vehicleId: deviation.vehicleId,
        resolutionReason,
        operatorId: 'Operator 04',
      });
    }
    // Always update locally regardless of connection
    setRouteDeviations(prev =>
      prev.map(d => d.vehicleId === deviation.vehicleId
        ? { ...d, resolved: true, resolutionReason }
        : d
      )
    );
    setVehicles(prev =>
      prev.map(v => v.id === deviation.vehicleId ? { ...v, status: 'normal' } : v)
    );
  }, []);

  // Simulate route deviation for demo/testing
  const simulateRouteDeviation = useCallback((vehicleId, severity = 'warning') => {
    if (!vehicleId) return null;
    const deviation = {
      id: `DEV-${Date.now()}`,
      vehicleId: vehicleId,
      severity,
      deviationMeters: severity === 'critical' ? 620 : 380,
      route: 'Unknown',
      lat: 0,
      lng: 0,
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    setRouteDeviations(prev => {
      const filtered = prev.filter(d => d.vehicleId !== vehicleId);
      return [deviation, ...filtered];
    });

    setVehicles(prev =>
      prev.map(v => {
        if (v.id === vehicleId) {
          const newStatus = severity === 'critical' ? 'emergency' : 'warning';
          return { ...v, status: newStatus };
        }
        return v;
      })
    );

    if (routeDeviationCallbackRef.current) {
      const vehicle = INITIAL_VEHICLES.find(v => v.id === vehicleId) || {};
      routeDeviationCallbackRef.current({
        vehicleId: vehicleId,
        severity,
        deviationMeters: deviation.deviationMeters,
        route: deviation.route,
        lat: deviation.lat,
        lng: deviation.lng,
        vehicle: { ...vehicle, id: vehicleId },
      });
    }
  }, []);

  const refreshFleet = async () => {
    try {
      const [vehRes, drvRes] = await Promise.all([
        api.get('/api/v1/fleet/vehicles'),
        api.get('/api/v1/fleet/drivers'),
      ]);
      if (vehRes.data.success) setVehicles(vehRes.data.data);
      if (drvRes.data.success) setDrivers(drvRes.data.data);
    } catch (e) {
      console.warn('Failed to refresh fleet:', e);
    }
  };

  const addVehicle = async (vehicleData) => {
    try {
      const { data } = await api.post('/api/v1/fleet/vehicles', vehicleData);
      if (data.success) {
        await refreshFleet();
        return data.data;
      }
      throw new Error(data.error || 'Failed to add vehicle');
    } catch (err) {
      console.warn('API error, adding locally:', err);
      const fallback = {
        id: vehicleData.code || `VEH-${Date.now().toString().slice(-3)}`,
        code: vehicleData.code || 'NEW-001',
        name: vehicleData.name || 'New Vehicle',
        type: vehicleData.type || 'Vehicle',
        driver: vehicleData.driver || 'Unassigned',
        speedLimit: Number(vehicleData.speedLimit) || 50,
        speed: 0,
        passengers: 0,
        status: 'offline',
        lat: 0,
        lng: 0
      };
      setVehicles(prev => [...prev, fallback]);
      return fallback;
    }
  };

  const addDriver = async (driverData) => {
    try {
      const { data } = await api.post('/api/v1/fleet/drivers', driverData);
      if (data.success) {
        await refreshFleet();
        return data.data;
      }
      throw new Error(data.error || 'Failed to add driver');
    } catch (err) {
      console.warn('API error, adding locally:', err);
      const fallback = {
        id: driverData.id || `DRV-${Date.now().toString().slice(-3)}`,
        name: driverData.name,
        vehicleId: driverData.vehicleId || 'UNASSIGNED',
        licenseNo: driverData.licenseNo || 'SIM-B2-00000',
        phone: driverData.phone || '+62 812-0000-0000',
        safetyScore: Number(driverData.safetyScore) || 90,
        status: 'normal',
        trips: 0,
        hoursOnDuty: '0.0'
      };
      setDrivers(prev => [...prev, fallback]);
      return fallback;
    }
  };

  const deleteVehicle = async (id) => {
    try {
      await api.delete(`/api/v1/fleet/vehicles/${id}`);
    } catch (e) {}
    await refreshFleet();
  };

  const deleteDriver = async (id) => {
    try {
      await api.delete(`/api/v1/fleet/drivers/${id}`);
    } catch (e) {}
    await refreshFleet();
  };

  const generateToken = async (deviceId, expiryDays = null) => {
    const { data } = await api.post('/api/v1/tokens/generate', { deviceId, expiryDays });
    if (data.success) {
      setDeviceTokens(prev => [data.data, ...prev.filter(t => t.id !== data.data.id)]);
      return data.data;
    }
    throw new Error(data.error || 'Failed to generate token');
  };

  const revokeToken = async (tokenId) => {
    const { data } = await api.post(`/api/v1/tokens/${encodeURIComponent(tokenId)}/revoke`);
    if (data.success) {
      setDeviceTokens(prev => prev.map(t => t.id === tokenId ? data.data : t));
      return data.data;
    }
    throw new Error(data.error || 'Failed to revoke token');
  };

  const rotateToken = async (deviceId) => {
    const { data } = await api.post(`/api/v1/tokens/${encodeURIComponent(deviceId)}/rotate`, { deviceId });
    if (data.success) {
      setDeviceTokens(prev => [data.data, ...prev.filter(t => t.id !== data.data.id)]);
      return data.data;
    }
    throw new Error(data.error || 'Failed to rotate token');
  };

  const refreshSecurityEvents = async () => {
    try {
      const { data } = await api.get('/api/v1/tokens/security-events');
      if (data.success) setSecurityEvents(data.data);
      return data.data;
    } catch (error) {
      console.warn('Failed to refresh security events:', error);
      return securityEvents;
    }
  };

  const updateOfficerStatus = useCallback((officerId, dutyStatus) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('update_officer_status', { officerId, dutyStatus });
    } else {
      setOfficers(prev => prev.map(o => o.id === officerId ? { ...o, dutyStatus } : o));
    }
  }, []);

  const resolveEmergencyWithReport = useCallback((vehicleId, incidentId, fieldReport) => {
    if (socketRef.current && socketRef.current.connected) {
      if (incidentId) {
        socketRef.current.emit('resolve_incident', { incidentId, operatorId: 'Officer Hendra', fieldReport });
      } else {
        setVehicles(prev => prev.map(v => (v.id === vehicleId ? { ...v, status: 'normal' } : v)));
      }
    } else {
      setVehicles(prev => prev.map(v => (v.id === vehicleId ? { ...v, status: 'normal' } : v)));
    }
  }, []);

  return {
    vehicles,
    drivers,
    officers,
    connected,
    incidents,
    deviceTokens,
    securityEvents,
    routeDeviations,
    triggerRandomEmergency,
    acknowledgeEmergency,
    resolveEmergency,
    resolveEmergencyWithReport,
    resolveRouteDeviation,
    simulateRouteDeviation,
    updateOfficerStatus,
    addVehicle,
    addDriver,
    deleteVehicle,
    deleteDriver,
    generateToken,
    revokeToken,
    rotateToken,
    refreshSecurityEvents
  };
}
