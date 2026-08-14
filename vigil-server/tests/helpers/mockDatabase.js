// In-memory database for testing
class MockDatabase {
  constructor() {
    this.users = new Map();
    this.vehicles = new Map();
    this.incidents = new Map();
    this.fieldReports = new Map();
    this.telemetry = [];
    this.subscriptions = new Map();
    this.invoices = new Map();
    this.apiKeys = new Map();
    this.auditLogs = [];
    
    this.initializeWithDefaults();
  }

  initializeWithDefaults() {
    // Default users
    this.users.set('usr-001', {
      id: 'usr-001',
      tenantId: 'ws-semarang-01',
      email: 'admin@semarang.go.id',
      name: 'Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    // Default vehicles
    for (let i = 1; i <= 5; i++) {
      const id = `veh-${i.toString().padStart(3, '0')}`;
      this.vehicles.set(id, {
        id,
        tenantId: 'ws-semarang-01',
        code: `TS-10${i}`,
        name: `Vehicle ${i}`,
        type: 'BUS',
        lat: -6.9666 + (Math.random() - 0.5) * 0.1,
        lng: 110.4196 + (Math.random() - 0.5) * 0.1,
        heading: Math.random() * 360,
        speed: Math.random() * 60,
        status: 'ACTIVE',
      });
    }
  }

  // Users
  findUser(query) {
    for (const user of this.users.values()) {
      if (this.matchesQuery(user, query)) {
        return user;
      }
    }
    return null;
  }

  findUsers(query) {
    const results = [];
    for (const user of this.users.values()) {
      if (this.matchesQuery(user, query)) {
        results.push(user);
      }
    }
    return results;
  }

  createUser(data) {
    const id = `usr-${Date.now()}`;
    const user = { ...data, id };
    this.users.set(id, user);
    return user;
  }

  updateUser(id, data) {
    const user = this.users.get(id);
    if (user) {
      const updated = { ...user, ...data };
      this.users.set(id, updated);
      return updated;
    }
    return null;
  }

  deleteUser(id) {
    return this.users.delete(id);
  }

  // Vehicles
  findVehicle(query) {
    for (const vehicle of this.vehicles.values()) {
      if (this.matchesQuery(vehicle, query)) {
        return vehicle;
      }
    }
    return null;
  }

  findVehicles(query) {
    const results = [];
    for (const vehicle of this.vehicles.values()) {
      if (this.matchesQuery(vehicle, query)) {
        results.push(vehicle);
      }
    }
    return results;
  }

  createVehicle(data) {
    const id = `veh-${Date.now()}`;
    const vehicle = { ...data, id };
    this.vehicles.set(id, vehicle);
    return vehicle;
  }

  updateVehicle(id, data) {
    const vehicle = this.vehicles.get(id);
    if (vehicle) {
      const updated = { ...vehicle, ...data };
      this.vehicles.set(id, updated);
      return updated;
    }
    return null;
  }

  deleteVehicle(id) {
    return this.vehicles.delete(id);
  }

  // Incidents
  findIncident(query) {
    for (const incident of this.incidents.values()) {
      if (this.matchesQuery(incident, query)) {
        return incident;
      }
    }
    return null;
  }

  findIncidents(query, options = {}) {
    let results = [];
    for (const incident of this.incidents.values()) {
      if (this.matchesQuery(incident, query)) {
        results.push(incident);
      }
    }

    // Sort
    if (options.sortBy) {
      results.sort((a, b) => {
        if (options.sortOrder === 'desc') {
          return b[options.sortBy] > a[options.sortBy] ? 1 : -1;
        }
        return a[options.sortBy] > b[options.sortBy] ? 1 : -1;
      });
    }

    // Pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const start = (page - 1) * limit;
    const end = start + limit;

    return {
      data: results.slice(start, end),
      total: results.length,
      page,
      limit,
      totalPages: Math.ceil(results.length / limit),
    };
  }

  createIncident(data) {
    const id = `inc-${Date.now()}`;
    const incident = { ...data, id, createdAt: new Date() };
    this.incidents.set(id, incident);
    return incident;
  }

  updateIncident(id, data) {
    const incident = this.incidents.get(id);
    if (incident) {
      const updated = { ...incident, ...data, updatedAt: new Date() };
      this.incidents.set(id, updated);
      return updated;
    }
    return null;
  }

  deleteIncident(id) {
    return this.incidents.delete(id);
  }

  // Field Reports
  findFieldReport(query) {
    for (const report of this.fieldReports.values()) {
      if (this.matchesQuery(report, query)) {
        return report;
      }
    }
    return null;
  }

  findFieldReports(query) {
    const results = [];
    for (const report of this.fieldReports.values()) {
      if (this.matchesQuery(report, query)) {
        results.push(report);
      }
    }
    return results;
  }

  createFieldReport(data) {
    const id = `rpt-${Date.now()}`;
    const report = { ...data, id, createdAt: new Date() };
    this.fieldReports.set(id, report);
    return report;
  }

  // Telemetry
  addTelemetry(data) {
    this.telemetry.push({ ...data, timestamp: new Date() });
  }

  findTelemetry(query, limit = 100) {
    return this.telemetry
      .filter(t => this.matchesQuery(t, query))
      .slice(-limit);
  }

  // Helper
  matchesQuery(item, query) {
    if (!query) return true;
    
    for (const [key, value] of Object.entries(query)) {
      if (item[key] !== value) {
        return false;
      }
    }
    return true;
  }

  // Clear all data
  clear() {
    this.users.clear();
    this.vehicles.clear();
    this.incidents.clear();
    this.fieldReports.clear();
    this.telemetry = [];
    this.subscriptions.clear();
    this.invoices.clear();
    this.apiKeys.clear();
    this.auditLogs = [];
  }

  // Get counts
  getCounts() {
    return {
      users: this.users.size,
      vehicles: this.vehicles.size,
      incidents: this.incidents.size,
      fieldReports: this.fieldReports.size,
      telemetry: this.telemetry.length,
    };
  }
}

// Singleton instance
const mockDb = new MockDatabase();

module.exports = {
  MockDatabase,
  mockDb,
};
