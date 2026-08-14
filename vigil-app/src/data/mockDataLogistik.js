// ============================================================
// VigilOS — Tenant Fleet Data
// NO MOCK DATA — All data comes from real devices via backend API
// ============================================================

// Vehicles — empty until real ESP devices connect and send telemetry
export const LOGISTIK_A_VEHICLES = [];

// Drivers — populated from real driver registrations
export const LOGISTIK_A_DRIVERS = [];

// Incidents — populated from real panic triggers
export const LOGISTIK_A_INCIDENTS = [];

// Traffic analytics — populated from real telemetry
export const LOGISTIK_A_TRAFFIC_DATA = [];

// Geofence zones — configure via backend
export const LOGISTIK_A_GEOFENCES = [];

// Corridor routes — configure via backend
export const LOGISTIK_A_CORRIDORS = [];

// Tenant info — configured via backend tenant management
export const LOGISTIK_A_TENANT = {
  id: 'logistik-a-01',
  name: 'Tenant',
  plan: 'FREE',
  deviceLimit: 10,
  activeDevices: 0,
  region: '',
  industry: '',
};
