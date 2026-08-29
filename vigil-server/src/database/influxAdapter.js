/**
 * Telemetry Data Layer — Prisma-backed (no in-memory storage).
 * Writes telemetry points to PostgreSQL and queries historical data.
 */

import { db } from '../services/databaseService.js';

class InfluxAdapter {
  /**
   * Record telemetry point into PostgreSQL telemetry table.
   */
  async writePoint({ vehicleId, lat, lng, speed, heading, passengers, heartbeatRateSec, anomalyDetected }) {
    try {
      return await db.prisma.telemetry.create({
        data: {
          vehicleId,
          lat: Number(lat),
          lng: Number(lng),
          speed: Number(speed),
          heading: Number(heading),
          passengers: Number(passengers || 0),
          heartbeatRateSec: Number(heartbeatRateSec || 10),
          anomalyDetected: !!anomalyDetected,
        },
      });
    } catch {
      return null;
    }
  }

  /**
   * Query historical telemetry for a specific vehicle.
   */
  async queryVehicleHistory(vehicleId, limit = 100) {
    try {
      return await db.prisma.telemetry.findMany({
        where: { vehicleId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
    } catch {
      return [];
    }
  }

  /**
   * Query speed anomalies across fleet.
   */
  async querySpeedAnomalies() {
    try {
      return await db.prisma.telemetry.findMany({
        where: { anomalyDetected: true },
        orderBy: { timestamp: 'desc' },
        take: 200,
      });
    } catch {
      return [];
    }
  }
}

export const influxDB = new InfluxAdapter();
