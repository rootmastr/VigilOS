import express from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { postgresDB } from '../../database/postgresAdapter.js';
import { invalidateToken } from '../../cache/cacheService.js';
import { db } from '../../services/databaseService.js';

const router = express.Router();

let mqttBroker = null;

export function setMqttBroker(broker) {
  mqttBroker = broker;
}

router.get('/', authenticateToken, (req, res) => {
  const tokens = postgresDB.getDeviceTokens();
  res.json({ success: true, count: tokens.length, data: tokens });
});

router.post('/generate', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const { deviceId, expiryDays } = req.body;
  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'deviceId is required to bind token' });
  }
  const tenantId = req.user.tenantId || 'ws-semarang-01';
  const newToken = postgresDB.generateDeviceToken(
    deviceId,
    tenantId,
    expiryDays ? Math.max(1, Number(expiryDays)) : null
  );
  try {
    await db.createDeviceToken({
      id: newToken.id,
      tenantId,
      deviceId,
      tokenHash: newToken.token,
      status: 'ACTIVE',
      permissions: ['telemetry:write'],
      expiresAt: newToken.expiresAt ? new Date(newToken.expiresAt) : null,
    });
  } catch (err) {
    console.error('[Tokens] Failed to persist token to DB:', err.message);
  }
  if (mqttBroker?.startDeviceTelemetry) {
    mqttBroker.startDeviceTelemetry(deviceId);
  }
  res.status(201).json({ success: true, data: newToken });
});

router.post('/:id/revoke', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  // Revoke by token id OR deviceId
  let revoked = postgresDB.revokeDeviceToken(req.params.id);
  if (!revoked) {
    // Try revoking by deviceId
    const tokens = postgresDB.getDeviceTokens().filter(t => t.deviceId === req.params.id && t.status === 'ACTIVE');
    for (const t of tokens) {
      revoked = postgresDB.revokeDeviceToken(t.id);
      if (revoked) await invalidateToken(revoked.token);
    }
  } else {
    await invalidateToken(revoked.token);
  }
  if (!revoked) {
    return res.status(404).json({ success: false, error: 'Token not found' });
  }
  try {
    await db.updateDeviceToken(revoked.id, {
      status: 'REVOKED',
      revokedAt: new Date(),
    });
  } catch (err) {
    console.error('[Tokens] Failed to persist revoke to DB:', err.message);
  }
  if (mqttBroker?.stopDeviceTelemetry) {
    mqttBroker.stopDeviceTelemetry(revoked.deviceId);
  }
  res.json({ success: true, data: revoked });
});

router.delete('/:id', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const token = postgresDB.getDeviceTokens().find(t => t.id === req.params.id);
  if (!token) {
    return res.status(404).json({ success: false, error: 'Token not found' });
  }
  if (mqttBroker?.stopDeviceTelemetry) {
    mqttBroker.stopDeviceTelemetry(token.deviceId);
  }
  postgresDB.deleteDeviceToken(req.params.id);
  await invalidateToken(token.token);
  try {
    await db.deleteDeviceToken(req.params.id);
  } catch (err) {
    console.error('[Tokens] Failed to delete token from DB:', err.message);
  }
  res.json({ success: true, message: 'Token deleted' });
});

router.post('/:id/rotate', authenticateToken, requireRole('SUPER_ADMIN', 'TENANT_ADMIN'), async (req, res) => {
  const { deviceId } = req.body;
  const existingToken = postgresDB.getTokenByValue(req.params.id)
    || postgresDB.getDeviceTokens().find(t => t.id === req.params.id);
  const targetDevice = deviceId || existingToken?.deviceId;

  if (!targetDevice) {
    return res.status(400).json({ success: false, error: 'deviceId is required to rotate token' });
  }

  const tenantId = req.user.tenantId || 'ws-semarang-01';
  const oldTokens = postgresDB.getDeviceTokens().filter(t => t.deviceId === targetDevice && t.status === 'ACTIVE');
  for (const t of oldTokens) {
    await invalidateToken(t.token);
    try {
      await db.updateDeviceToken(t.id, { status: 'REVOKED', revokedAt: new Date() });
    } catch (err) {
      console.error('[Tokens] Failed to persist revoke to DB:', err.message);
    }
  }

  const newToken = postgresDB.rotateDeviceToken(targetDevice, tenantId);
  try {
    await db.createDeviceToken({
      id: newToken.id,
      tenantId,
      deviceId: targetDevice,
      tokenHash: newToken.token,
      status: 'ACTIVE',
      permissions: ['telemetry:write'],
      expiresAt: newToken.expiresAt ? new Date(newToken.expiresAt) : null,
    });
  } catch (err) {
    console.error('[Tokens] Failed to persist rotated token to DB:', err.message);
  }
  res.json({ success: true, data: newToken });
});

router.get('/security-events', authenticateToken, (req, res) => {
  const events = postgresDB.getSecurityEvents();
  res.json({ success: true, count: events.length, data: events });
});

export default router;
