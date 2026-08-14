/**
 * Device Token Authentication Middleware for VigilOS IoT Gateway
 * Validates `X-Device-Token` header on incoming hardware REST telemetry packets.
 *
 * Validation Flow (PRD 3.1):
 *  1. Check Redis cache  → sub-millisecond HIT path (< 2ms acceptance criterion)
 *  2. On cache MISS      → fallback to PostgreSQL lookup, then seed Redis for next time
 */

import { postgresDB } from '../database/postgresAdapter.js';
import { lookupTokenFromCache, cacheToken } from '../cache/cacheService.js';

export async function validateDeviceToken(req, res, next, onSecurityEvent = null) {
  const deviceTokenHeader = req.headers['x-device-token'] || req.headers['authorization'];
  const clientIP = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // Helper to record a security event and, if provided, push it to live command center clients
  const recordSecurityEvent = (payload) => {
    const event = postgresDB.logSecurityEvent(payload);
    if (onSecurityEvent) onSecurityEvent(event);
    return event;
  };

  if (!deviceTokenHeader) {
    recordSecurityEvent({
      eventType: 'MISSING_DEVICE_TOKEN',
      deviceId: req.body?.vehicleId || 'UNKNOWN_DEVICE',
      ipAddress: clientIP,
      details: 'HTTP 401: Request rejected due to missing X-Device-Token header.'
    });

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing required device token header `X-Device-Token`.',
      statusCode: 401
    });
  }

  // Sanitize token string
  const tokenString = deviceTokenHeader.replace(/^Bearer\s+/, '').trim();

  // ── Step 1: Redis cache lookup (O(1), sub-millisecond) ─────────────────────
  let tokenRecord = await lookupTokenFromCache(tokenString);
  let cacheHit = !!tokenRecord;

  // ── Step 2: Postgres fallback on cache miss ────────────────────────────────
  if (!tokenRecord) {
    tokenRecord = postgresDB.getTokenByValue(tokenString);
    // If found in Postgres and valid, back-fill the cache for next requests
    if (tokenRecord && tokenRecord.status === 'ACTIVE') {
      await cacheToken(tokenRecord);
    }
  }

  if (!tokenRecord) {
    recordSecurityEvent({
      eventType: 'INVALID_DEVICE_TOKEN',
      deviceId: req.body?.vehicleId || 'UNKNOWN_DEVICE',
      ipAddress: clientIP,
      details: `HTTP 403: Forbidden access attempt with unrecognized token string: ${tokenString.slice(0, 12)}...`
    });

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid or unrecognized device token.',
      statusCode: 403
    });
  }

  if (tokenRecord.status === 'REVOKED') {
    recordSecurityEvent({
      eventType: 'REVOKED_TOKEN_ACCESS_ATTEMPT',
      deviceId: tokenRecord.deviceId,
      ipAddress: clientIP,
      details: `HTTP 403: Hardware device attempted transmission using revoked token ID ${tokenRecord.id}.`
    });

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Device token has been revoked by platform administrator.',
      statusCode: 403
    });
  }

  if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) <= new Date()) {
    recordSecurityEvent({
      eventType: 'EXPIRED_DEVICE_TOKEN',
      deviceId: tokenRecord.deviceId,
      ipAddress: clientIP,
      details: `HTTP 401: Device token ID ${tokenRecord.id} expired on ${tokenRecord.expiresAt}.`
    });

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Device token has expired. Please rotate the token via the management portal.',
      statusCode: 401
    });
  }

  // Enforce cryptographically isolated binding: the payload's vehicleId must match
  // the device this token was provisioned for (prevents cross-device token reuse).
  if (req.body?.vehicleId && req.body.vehicleId !== tokenRecord.deviceId) {
    recordSecurityEvent({
      eventType: 'DEVICE_BINDING_MISMATCH',
      deviceId: tokenRecord.deviceId,
      ipAddress: clientIP,
      details: `HTTP 403: Token ID ${tokenRecord.id} bound to ${tokenRecord.deviceId} used to claim vehicleId ${req.body.vehicleId}.`
    });

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Device token is bound to a different device ID.',
      statusCode: 403
    });
  }

  // Valid token: update lastUsedAt timestamp & attach metadata to request
  // Only update the Postgres record on cache miss (avoids redundant DB writes)
  if (!cacheHit) {
    const dbRecord = postgresDB.getTokenByValue(tokenString);
    if (dbRecord) dbRecord.lastUsedAt = new Date().toISOString();
  }

  req.authenticatedDevice = tokenRecord;
  next();
}
