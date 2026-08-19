import express from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { postgresDB } from '../../database/postgresAdapter.js';
import { invalidateToken } from '../../cache/cacheService.js';

const router = express.Router();

let mqttBroker = null;

export function setMqttBroker(broker) {
  mqttBroker = broker;
}

router.get('/', authenticateToken, (req, res) => {
  const tokens = postgresDB.getDeviceTokens();
  res.json({ success: true, count: tokens.length, data: tokens });
});

router.post('/generate', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), (req, res) => {
  const { deviceId, expiryDays } = req.body;
  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'deviceId is required to bind token' });
  }
  const newToken = postgresDB.generateDeviceToken(
    deviceId,
    req.user.tenantId || 'ws-semarang-01',
    expiryDays ? Math.max(1, Number(expiryDays)) : null
  );
  if (mqttBroker?.startDeviceTelemetry) {
    mqttBroker.startDeviceTelemetry(deviceId);
  }
  res.status(201).json({ success: true, data: newToken });
});

router.post('/:id/revoke', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const revoked = postgresDB.revokeDeviceToken(req.params.id);
  if (!revoked) {
    return res.status(404).json({ success: false, error: 'Token not found' });
  }
  await invalidateToken(revoked.token);
  if (mqttBroker?.stopDeviceTelemetry) {
    mqttBroker.stopDeviceTelemetry(revoked.deviceId);
  }
  res.json({ success: true, data: revoked });
});

router.post('/:id/rotate', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const { deviceId } = req.body;
  const existingToken = postgresDB.getTokenByValue(req.params.id)
    || postgresDB.getDeviceTokens().find(t => t.id === req.params.id);
  const targetDevice = deviceId || existingToken?.deviceId;

  if (!targetDevice) {
    return res.status(400).json({ success: false, error: 'deviceId is required to rotate token' });
  }

  const oldTokens = postgresDB.getDeviceTokens().filter(t => t.deviceId === targetDevice && t.status === 'ACTIVE');
  for (const t of oldTokens) {
    await invalidateToken(t.token);
  }

  const newToken = postgresDB.rotateDeviceToken(targetDevice);
  res.json({ success: true, data: newToken });
});

router.get('/security-events', authenticateToken, (req, res) => {
  const events = postgresDB.getSecurityEvents();
  res.json({ success: true, count: events.length, data: events });
});

export default router;
