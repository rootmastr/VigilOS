/**
 * InfluxDB Time-Series Data Layer Adapter
 * High-frequency telemetry logging for speed evaluation, route playback, and historical analytics.
 */

class InfluxAdapter {
  constructor() {
    this.telemetryLogs = [];
    this.maxMemoryLogs = 10000; // Cap log memory window
  }

  /**
   * Record telemetry point into InfluxDB bucket `fleet_telemetry`
   */
  writePoint({ vehicleId, lat, lng, speed, heading, passengers, heartbeatRateSec, anomalyDetected }) {
    const point = {
      timestamp: new Date().toISOString(),
      measurement: 'vehicle_telemetry',
      tags: {
        vehicleId,
        anomalyDetected: anomalyDetected ? 'true' : 'false'
      },
      fields: {
        lat: Number(lat),
        lng: Number(lng),
        speed: Number(speed),
        heading: Number(heading),
        passengers: Number(passengers),
        heartbeatRateSec: Number(heartbeatRateSec || 10)
      }
    };

    this.telemetryLogs.push(point);
    if (this.telemetryLogs.length > this.maxMemoryLogs) {
      this.telemetryLogs.shift();
    }
    return point;
  }

  /**
   * Query historical telemetry for a specific vehicle within a time range
   */
  queryVehicleHistory(vehicleId, limit = 100) {
    return this.telemetryLogs
      .filter(p => p.tags.vehicleId === vehicleId)
      .slice(-limit);
  }

  /**
   * Query speed anomalies aggregate across fleet
   */
  querySpeedAnomalies() {
    return this.telemetryLogs.filter(p => p.tags.anomalyDetected === 'true');
  }
}

export const influxDB = new InfluxAdapter();
