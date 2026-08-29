/**
 * Speed Anomaly & Real-Time Telemetry Evaluator
 * Evaluates operational telemetry stream against corridor speed limits.
 * Dynamically adjusts vehicle telemetry heartbeat frequency (10s -> 1s).
 */

import { postgresDB } from '../database/postgresAdapter.js';
import { influxDB } from '../database/influxAdapter.js';
import { db } from '../services/databaseService.js';

export class SpeedEvaluator {
  constructor(onControlCommand) {
    this.onControlCommand = onControlCommand;
  }

  async evaluateTelemetry(telemetry) {
    const { vehicleId, speed, lat, lng, heading, passengers } = telemetry;
    const vehicle = await postgresDB.getVehicleById(vehicleId);
    
    if (!vehicle) return { anomaly: false };

    const speedLimit = vehicle.speedLimit || 50;
    const isOverspeeding = speed > speedLimit * 1.15; // >15% over speed limit (e.g. >57.5km/h on 50 limit)
    const isCriticalSpeed = speed > speedLimit * 1.35; // Severe overspeeding threshold

    let heartBeatIntervalSec = 10;
    let anomalyStatus = false;
    let anomalyType = null;

    if (isOverspeeding) {
      anomalyStatus = true;
      anomalyType = isCriticalSpeed ? 'SEVERE_OVERSPEEDING' : 'OVERSPEEDING';
      // Scale heartbeat rate from 10s to 1s for dense evaluation stream
      heartBeatIntervalSec = 1;
    } else {
      // Normal operation: revert back to 10s heartbeat
      heartBeatIntervalSec = 10;
    }

    // Check if heartbeat interval needs updating
    if (vehicle.heartBeatIntervalSec !== heartBeatIntervalSec) {
      await postgresDB.updateVehicleStatus(vehicleId, isOverspeeding ? 'warning' : vehicle.status === 'warning' ? 'normal' : vehicle.status, heartBeatIntervalSec);
      
      // Dispatch control signal down MQTT topic `fleet/{device_id}/control`
      if (this.onControlCommand) {
        this.onControlCommand({
          topic: `fleet/${vehicleId}/control`,
          vehicleId,
          command: 'ADJUST_HEARTBEAT',
          heartBeatIntervalSec,
          reason: isOverspeeding ? `Speed Anomaly Detected (${speed.toFixed(1)} km/h vs limit ${speedLimit} km/h)` : 'Normal Speed Restored'
        });
      }
    }

    // Update PostGIS DB & InfluxDB
    await postgresDB.updateVehicleLocation(vehicleId, { lat, lng, speed, heading, passengers });

    // Persist to PostgreSQL for crash recovery and initial_state on reconnect (fire-and-forget)
    db.updateVehicle(vehicleId, { lat, lng, speed, heading }).catch(() => {});

    await influxDB.writePoint({
      vehicleId,
      lat,
      lng,
      speed,
      heading,
      passengers,
      heartbeatRateSec: heartBeatIntervalSec,
      anomalyDetected: anomalyStatus
    });

    return {
      anomaly: anomalyStatus,
      anomalyType,
      heartBeatIntervalSec,
      currentSpeed: speed,
      speedLimit
    };
  }
}
