/**
 * Telemetry & Emergency Routes for VigilOS IoT Gateway
 * Handles device telemetry ingestion and emergency triggers.
 */

import express from 'express';
import { validateDeviceToken } from '../../middleware/deviceAuth.js';
import { postgresDB } from '../../database/postgresAdapter.js';
import { influxDB } from '../../database/influxAdapter.js';
import { fcmService } from '../../services/fcmService.js';
import { checkRateLimit } from '../../cache/cacheService.js';

const router = express.Router();

let mqttBroker = null;

export function setMqttBroker(broker) {
  mqttBroker = broker;
}

// ── Rate Limit Middleware (PRD 3.4) ────────────────────────────────────────
const rateLimitMiddleware = async (req, res, next) => {
  const tokenHeader = req.headers['x-device-token'] || req.headers['authorization'] || '';
  const tokenString = tokenHeader.replace(/^Bearer\s+/, '').trim();
  const isEmergency = req.body?.emergency === true || req.query?.emergency === 'true';
  const deviceIdHint = req.body?.vehicleId || tokenString.slice(-8) || 'UNKNOWN';

  const { allowed, count, remaining, retryAfterSec } = await checkRateLimit(deviceIdHint, isEmergency);

  if (!allowed) {
    postgresDB.logSecurityEvent({
      eventType: 'RATE_LIMIT_EXCEEDED',
      deviceId: deviceIdHint,
      ipAddress: req.ip || req.socket.remoteAddress,
      details: `Device throttled: ${count} requests in 60s window. Max allowed: 20. Retry after ${retryAfterSec}s.`
    });

    res.set({
      'X-RateLimit-Limit': '20',
      'X-RateLimit-Remaining': '0',
      'Retry-After': String(retryAfterSec),
    });

    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Maximum 20 telemetry packets per 60 seconds. Retry after ${retryAfterSec} seconds.`,
      retryAfterSec,
      statusCode: 429
    });
  }

  res.set({
    'X-RateLimit-Limit': '20',
    'X-RateLimit-Remaining': String(remaining),
  });

  next();
};

// POST /api/v1/telemetry/ingest - Protected Telemetry Submission (Requires X-Device-Token Header)
router.post('/telemetry/ingest', rateLimitMiddleware, (req, res, next) => {
  validateDeviceToken(req, res, next);
}, (req, res) => {
  const { vehicleId, lat, lng, speed, heading, passengers } = req.body;
  const targetVehicleId = vehicleId || req.authenticatedDevice.deviceId;

  if (targetVehicleId !== req.authenticatedDevice.deviceId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: `Token bound to ${req.authenticatedDevice.deviceId} cannot be used for ${targetVehicleId}.`
    });
  }

  if (!mqttBroker) {
    return res.status(500).json({ success: false, error: 'MQTT Broker ingestion not ready' });
  }

  const result = mqttBroker.ingestExternalTelemetry({
    vehicleId: targetVehicleId,
    lat, lng, speed, heading, passengers
  });

  if (result.error) {
    return res.status(404).json({ success: false, error: result.error });
  }

  res.json({
    success: true,
    message: 'Telemetry authenticated and processed successfully via X-Device-Token.',
    authenticatedDevice: req.authenticatedDevice.deviceId,
    data: result.telemetry,
    evaluation: result.evaluation
  });
});

// POST /api/v1/emergency/trigger
router.post('/emergency/trigger', (req, res, next) => {
  validateDeviceToken(req, res, next);
}, (req, res) => {
  const { vehicleId, details } = req.body;
  const targetId = vehicleId || req.authenticatedDevice.deviceId;

  if (targetId !== req.authenticatedDevice.deviceId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: `Token bound to ${req.authenticatedDevice.deviceId} cannot trigger emergency for ${targetId}.`
    });
  }

  if (!mqttBroker) {
    return res.status(500).json({ success: false, error: 'MQTT Broker ingestion not ready' });
  }

  const incident = mqttBroker.handleEmergencyPublish(targetId, details);

  const nearbyPatrols = postgresDB.findNearbyVehicles(incident.location.lat, incident.location.lng, 10000);
  fcmService.dispatchPatrolPushAlert(incident, nearbyPatrols);

  res.json({
    success: true,
    message: 'Emergency trigger processed and propagated (< 1s)',
    data: incident
  });
});

// GET /api/v1/telemetry/history
router.get('/telemetry/history', (req, res) => {
  const { vehicleId, limit } = req.query;
  if (vehicleId) {
    const history = influxDB.queryVehicleHistory(vehicleId, Number(limit) || 100);
    return res.json({ success: true, vehicleId, count: history.length, data: history });
  }
  const anomalies = influxDB.querySpeedAnomalies();
  res.json({ success: true, type: 'anomalies', count: anomalies.length, data: anomalies });
});

export default router;
