/**
 * MQTT Broker & Ingestion Simulator
 * Simulates high-concurrency MQTT telemetry and emergency panic button ingestion pipeline.
 * Topics:
 *   - Ingestion: `fleet/{device_id}/telemetry`
 *   - Emergency: `fleet/{device_id}/emergency`
 *   - Downstream Control: `fleet/{device_id}/control`
 */

import { postgresDB } from '../database/postgresAdapter.js';
import { refreshDevicePresence, updateDeviceState } from '../cache/cacheService.js';

export class MQTTBrokerSimulator {
  constructor(speedEvaluator, onSocketBroadcast) {
    this.speedEvaluator = speedEvaluator;
    this.onSocketBroadcast = onSocketBroadcast;
    this.telemetryIntervals = new Map();
    this.isStreaming = false;
    // Track devices that are sending real telemetry (prevents simulation restart)
    this.realTelemetryActive = new Set();
    // Emergency queue for multiple simultaneous emergencies
    this.emergencyQueue = [];
  }

  startIngestionPipeline() {
    if (this.isStreaming) return;
    this.isStreaming = true;

    const vehicles = postgresDB.getVehicles();
    const tokens = postgresDB.getDeviceTokens();
    const activeDeviceIds = new Set(tokens.filter(t => t.status === 'ACTIVE').map(t => t.deviceId));

    vehicles.forEach(vehicle => {
      if (activeDeviceIds.has(vehicle.id)) {
        this.startVehicleTelemetryLoop(vehicle.id, vehicle.heartBeatIntervalSec || 10);
        postgresDB.updateVehicleStatus(vehicle.id, 'normal', vehicle.heartBeatIntervalSec || 10);
      } else {
        postgresDB.updateVehicleStatus(vehicle.id, 'offline', vehicle.heartBeatIntervalSec || 10);
      }
    });

    console.log(`[MQTT Broker] Ingestion pipeline operational — ${activeDeviceIds.size}/${vehicles.length} devices connected`);
  }

  startDeviceTelemetry(vehicleId) {
    // Don't restart simulation if real device is already sending telemetry
    if (this.realTelemetryActive.has(vehicleId)) {
      console.log(`[MQTT Broker] Skipping simulation for ${vehicleId} — real telemetry active`);
      return;
    }
    const vehicle = postgresDB.getVehicleById(vehicleId);
    if (!vehicle) return;
    postgresDB.updateVehicleStatus(vehicleId, 'normal', vehicle.heartBeatIntervalSec || 10);
    this.startVehicleTelemetryLoop(vehicleId, vehicle.heartBeatIntervalSec || 10);
  }

  stopDeviceTelemetry(vehicleId) {
    if (this.telemetryIntervals.has(vehicleId)) {
      clearInterval(this.telemetryIntervals.get(vehicleId));
      this.telemetryIntervals.delete(vehicleId);
    }
    postgresDB.updateVehicleStatus(vehicleId, 'offline');
  }

  startVehicleTelemetryLoop(vehicleId, intervalSec) {
    // Clear any existing timer for this vehicle
    if (this.telemetryIntervals.has(vehicleId)) {
      clearInterval(this.telemetryIntervals.get(vehicleId));
    }

    const intervalMs = intervalSec * 1000;
    const timer = setInterval(() => {
      this.publishVehicleTelemetry(vehicleId);
    }, Math.max(1000, intervalMs));

    this.telemetryIntervals.set(vehicleId, timer);
  }

  publishVehicleTelemetry(vehicleId) {
    const vehicle = postgresDB.getVehicleById(vehicleId);
    if (!vehicle) return;

    // Simulate location movement delta
    const deltaLat = (Math.random() - 0.5) * 0.0012;
    const deltaLng = (Math.random() - 0.5) * 0.0012;
    const newLat = vehicle.lat + deltaLat;
    const newLng = vehicle.lng + deltaLng;
    
    // Simulate speed variations (with periodic speed spikes to trigger speed anomaly evaluator)
    let newSpeed = vehicle.speed;
    if (vehicle.status === 'emergency') {
      newSpeed = Math.min(85, Math.max(0, vehicle.speed + (Math.random() - 0.5) * 15));
    } else {
      // Occasional speed boost to test threshold
      const speedBoost = Math.random() < 0.15 ? 18 : 0;
      newSpeed = Math.max(15, Math.min(75, vehicle.speed + (Math.random() - 0.5) * 6 + speedBoost));
    }

    const newPassengers = Math.max(0, Math.min(80, vehicle.passengers + Math.floor((Math.random() - 0.5) * 4)));
    const newHeading = Math.round((vehicle.heading + (Math.random() - 0.5) * 20 + 360) % 360);

    const telemetryPayload = {
      topic: `fleet/${vehicleId}/telemetry`,
      vehicleId,
      lat: newLat,
      lng: newLng,
      speed: newSpeed,
      heading: newHeading,
      passengers: newPassengers,
      timestamp: new Date().toISOString()
    };

    // Process stream through speed evaluator
    const evalResult = this.speedEvaluator.evaluateTelemetry(telemetryPayload);

    // If speed evaluator updated heartbeat interval, adjust loop timer
    if (evalResult.heartBeatIntervalSec && vehicle.heartBeatIntervalSec !== evalResult.heartBeatIntervalSec) {
      this.startVehicleTelemetryLoop(vehicleId, evalResult.heartBeatIntervalSec);
    }

    // ── Redis: Refresh device presence (30s TTL) and update latest state cache ──
    refreshDevicePresence(vehicleId);
    updateDeviceState(vehicleId, {
      lat: newLat,
      lng: newLng,
      speed: newSpeed,
      heading: newHeading,
      passengers: newPassengers,
      status: vehicle.status,
      timestamp: telemetryPayload.timestamp,
    });

    // Broadcast live update over WebSocket to Command Center dashboard
    if (this.onSocketBroadcast) {
      this.onSocketBroadcast('telemetry_update', {
        vehicleId,
        lat: newLat,
        lng: newLng,
        speed: newSpeed,
        heading: newHeading,
        passengers: newPassengers,
        status: vehicle.status,
        heartBeatIntervalSec: evalResult.heartBeatIntervalSec,
        anomaly: evalResult.anomaly
      });
    }
  }

  // Handle MQTT Emergency Panic Button trigger payload
  handleEmergencyPublish(vehicleId, details) {
    const vehicle = postgresDB.getVehicleById(vehicleId);
    if (!vehicle) return null;

    // Set vehicle status to emergency and scale heartbeat to 1s
    postgresDB.updateVehicleStatus(vehicleId, 'emergency', 1);

    // Only restart simulation if device is NOT sending real telemetry
    if (!this.realTelemetryActive.has(vehicleId)) {
      this.startVehicleTelemetryLoop(vehicleId, 1);
    }

    // Record incident in audit trail
    const incidentRecord = postgresDB.createIncidentRecord({
      vehicleId,
      type: 'PANIC_BUTTON',
      severity: 'CRITICAL',
      location: { lat: vehicle.lat, lng: vehicle.lng },
      details: details || `Emergency Panic Button triggered on board ${vehicle.code} (${vehicle.name}).`
    });

    // Add to emergency queue
    this.emergencyQueue.push({
      incidentId: incidentRecord.id,
      vehicleId,
      vehicleCode: vehicle.code,
      timestamp: incidentRecord.timestamp,
      status: 'ACTIVE'
    });

    // Broadcast emergency alert with queue info
    if (this.onSocketBroadcast) {
      this.onSocketBroadcast('emergency_alert', {
        incident: incidentRecord,
        vehicle: postgresDB.getVehicleById(vehicleId),
        queue: this.emergencyQueue,
        queueIndex: this.emergencyQueue.length - 1
      });

      // Also broadcast queue update for other connected clients
      this.onSocketBroadcast('emergency_queue_update', {
        queue: this.emergencyQueue,
        totalActive: this.emergencyQueue.filter(e => e.status === 'ACTIVE').length
      });
    }

    console.log(`[MQTT Broker] EMERGENCY TRIGGERED on topic \`fleet/${vehicleId}/emergency\`: Incident ID ${incidentRecord.id}. Queue size: ${this.emergencyQueue.length}`);
    return incidentRecord;
  }

  // Remove resolved emergency from queue
  removeFromEmergencyQueue(incidentId) {
    this.emergencyQueue = this.emergencyQueue.filter(e => e.incidentId !== incidentId);
    if (this.onSocketBroadcast) {
      this.onSocketBroadcast('emergency_queue_update', {
        queue: this.emergencyQueue,
        totalActive: this.emergencyQueue.filter(e => e.status === 'ACTIVE').length
      });
    }
  }

  /**
   * Process an authenticated external REST telemetry packet from edge hardware
   * (ESP8266/ESP32). Runs the payload through the speed evaluator which persists
   * the point to PostgreSQL (PostGIS) and InfluxDB (time-series), and broadcasts
   * the live update over WebSocket to the Command Center.
   */
  ingestExternalTelemetry({ vehicleId, lat, lng, speed, heading, passengers }) {
    const vehicle = postgresDB.getVehicleById(vehicleId);
    if (!vehicle) return { error: 'Vehicle not found' };

    // Stop simulation loop — real hardware is sending data
    if (this.telemetryIntervals.has(vehicleId)) {
      clearInterval(this.telemetryIntervals.get(vehicleId));
      this.telemetryIntervals.delete(vehicleId);
    }

    // Mark this device as receiving real telemetry (prevents simulation restart)
    this.realTelemetryActive.add(vehicleId);

    const toNum = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

    const clampLat = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= -90 && n <= 90 ? n : null;
    };
    const clampLng = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= -180 && n <= 180 ? n : null;
    };

    const telemetryPayload = {
      topic: `fleet/${vehicleId}/telemetry`,
      vehicleId,
      lat: clampLat(lat) ?? vehicle.lat ?? -6.9666,
      lng: clampLng(lng) ?? vehicle.lng ?? 110.4196,
      speed: toNum(speed, 0),
      heading: toNum(heading, 0),
      passengers: toNum(passengers, 0),
      timestamp: new Date().toISOString()
    };

    const evalResult = this.speedEvaluator.evaluateTelemetry(telemetryPayload);

    // Note: Do NOT restart telemetry loop here — real hardware sends its own data

    // ── Redis: Refresh device presence (30s TTL) and update latest state cache ──
    refreshDevicePresence(vehicleId);
    updateDeviceState(vehicleId, {
      lat: telemetryPayload.lat,
      lng: telemetryPayload.lng,
      speed: telemetryPayload.speed,
      heading: telemetryPayload.heading,
      passengers: telemetryPayload.passengers,
      status: vehicle.status,
      timestamp: telemetryPayload.timestamp,
    });

    if (this.onSocketBroadcast) {
      this.onSocketBroadcast('telemetry_update', {
        vehicleId,
        lat: telemetryPayload.lat,
        lng: telemetryPayload.lng,
        speed: telemetryPayload.speed,
        heading: telemetryPayload.heading,
        passengers: telemetryPayload.passengers,
        status: vehicle.status,
        heartBeatIntervalSec: evalResult.heartBeatIntervalSec,
        anomaly: evalResult.anomaly
      });
    }

    return { telemetry: telemetryPayload, evaluation: evalResult };
  }

  // Process control command sent to vehicle
  publishControlCommand(controlSignal) {
    console.log(`[MQTT Broker] Control signal published to \`${controlSignal.topic}\`:`, controlSignal);
    if (this.onSocketBroadcast) {
      this.onSocketBroadcast('control_signal', controlSignal);
    }
  }

  stop() {
    this.telemetryIntervals.forEach(timer => clearInterval(timer));
    this.telemetryIntervals.clear();
    this.isStreaming = false;
  }
}
