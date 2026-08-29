/**
 * VigilOS Redis Cache Service
 * Implements the 4 core Redis features defined in PRDredis.md:
 *
 *  3.1  Device Token Caching        — device:token:{token_string}  → device_id
 *  3.2  Device Presence / Heartbeat — device:presence:{device_id}  → "1" (TTL 30s)
 *  3.3  Latest Telemetry State      — device:state:{device_id}     → Hash
 *  3.4  API Rate Limiting           — ratelimit:{device_id}         → counter (TTL 60s)
 */

import { redisClient } from './redisClient.js';
import { postgresDB } from '../database/postgresAdapter.js';

// ──────────────────────────────────────────────────────────────────────────────
// Key Builders — Centralised key patterns to avoid typos across the codebase
// ──────────────────────────────────────────────────────────────────────────────
const KEY = {
  token: (tokenString) => `device:token:${tokenString}`,
  presence: (deviceId) => `device:presence:${deviceId}`,
  state: (deviceId) => `device:state:${deviceId}`,
  rateLimit: (deviceId) => `ratelimit:${deviceId}`,
};

// ──────────────────────────────────────────────────────────────────────────────
// TTL Constants (seconds)
// ──────────────────────────────────────────────────────────────────────────────
const TTL = {
  TOKEN: 3600,        // 1 hour  — token metadata cached in Redis
  PRESENCE: 30,       // 30 sec  — vehicle considered offline after this
  STATE: 300,         // 5 min   — latest telemetry state cache
  RATE_WINDOW: 60,    // 60 sec  — sliding window for rate limiter
};

// ──────────────────────────────────────────────────────────────────────────────
// Rate Limit Constants
// ──────────────────────────────────────────────────────────────────────────────
const RATE_LIMIT_MAX = 20; // max packets per RATE_WINDOW seconds
const LOGIN_RATE_LIMIT_MAX = 5; // max login attempts per LOGIN_WINDOW
const LOGIN_RATE_WINDOW = 300; // 5 minutes lockout window

// ──────────────────────────────────────────────────────────────────────────────
// 3.1  Device Token Caching
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Seed all currently ACTIVE device tokens from Postgres into Redis at startup.
 * Subsequent token lookups hit Redis (sub-ms) instead of the DB.
 */
export async function cacheAllActiveTokens() {
  const tokens = await postgresDB.getDeviceTokens();
  const activeTokens = tokens.filter(t => t.status === 'ACTIVE');
  let seeded = 0;

  for (const t of activeTokens) {
    // Cache the full token record as a compact JSON string
    const payload = JSON.stringify({
      id: t.id,
      deviceId: t.deviceId,
      tenantId: t.tenantId,
      status: t.status,
      expiresAt: t.expiresAt || null,
    });
    const ok = await redisClient.setex(KEY.token(t.token), TTL.TOKEN, payload);
    if (ok) seeded++;
  }

  console.log(`[Cache] ✅ Seeded ${seeded}/${activeTokens.length} active device tokens into Redis.`);
  return seeded;
}

/**
 * Look up a token string in Redis.
 * Returns a parsed token record object, or null on cache miss.
 *
 * Acceptance Criterion: Token validation served from Redis < 2ms.
 */
export async function lookupTokenFromCache(tokenString) {
  const raw = await redisClient.get(KEY.token(tokenString));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write a validated token record into Redis (called on cache miss after DB lookup).
 * Does NOT cache REVOKED tokens.
 */
export async function cacheToken(tokenRecord) {
  if (!tokenRecord || tokenRecord.status === 'REVOKED') return;
  const payload = JSON.stringify({
    id: tokenRecord.id,
    deviceId: tokenRecord.deviceId,
    tenantId: tokenRecord.tenantId,
    status: tokenRecord.status,
    expiresAt: tokenRecord.expiresAt || null,
  });
  await redisClient.setex(KEY.token(tokenRecord.token), TTL.TOKEN, payload);
}

/**
 * Invalidate (delete) a token from Redis cache.
 * Called when a token is revoked or rotated so stale data cannot be used.
 */
export async function invalidateToken(tokenString) {
  if (!tokenString) return;
  await redisClient.del(KEY.token(tokenString));
  console.log(`[Cache] 🗑️  Token invalidated from cache: ${tokenString.slice(0, 16)}...`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 3.2  Device Presence / Heartbeat Tracking
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Refresh the presence key for a device, resetting the 30-second TTL.
 * Called on every telemetry packet received from a hardware unit.
 *
 * When telemetry stops (tunnel / offline), the key expires automatically
 * and `isDeviceOnline()` returns false — triggering the frontend marker update.
 */
export async function refreshDevicePresence(deviceId) {
  await redisClient.setex(KEY.presence(deviceId), TTL.PRESENCE, '1');
}

/**
 * Check whether a device is currently online (key exists in Redis).
 */
export async function isDeviceOnline(deviceId) {
  return redisClient.exists(KEY.presence(deviceId));
}

/**
 * Return a list of all device IDs that currently have an active presence key.
 */
export async function getOnlineDeviceIds() {
  const keys = await redisClient.scanKeys('device:presence:*');
  // Strip the prefix to extract raw device IDs
  return keys.map(k => k.replace('device:presence:', ''));
}

// ──────────────────────────────────────────────────────────────────────────────
// 3.3  Latest Telemetry State Caching
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Update the latest telemetry state for a device in a Redis Hash.
 * Replaces individual fields atomically and resets the TTL.
 *
 * Stored fields: lat, lng, speed, heading, passengers, status, timestamp
 */
export async function updateDeviceState(deviceId, { lat, lng, speed, heading, passengers, status, timestamp }) {
  const key = KEY.state(deviceId);
  await redisClient.hset(key, {
    lat: String(lat ?? ''),
    lng: String(lng ?? ''),
    speed: String(speed ?? ''),
    heading: String(heading ?? ''),
    passengers: String(passengers ?? ''),
    status: status || 'normal',
    timestamp: timestamp || new Date().toISOString(),
  });
  await redisClient.expire(key, TTL.STATE);
}

/**
 * Retrieve the latest telemetry state for a single device from Redis.
 * Returns null if no cached state is available.
 */
export async function getDeviceState(deviceId) {
  const raw = await redisClient.hgetall(KEY.state(deviceId));
  if (!raw) return null;
  const parsedLat = parseFloat(raw.lat);
  const parsedLng = parseFloat(raw.lng);
  return {
    deviceId,
    lat: Number.isFinite(parsedLat) ? parsedLat : null,
    lng: Number.isFinite(parsedLng) ? parsedLng : null,
    speed: parseFloat(raw.speed) || 0,
    heading: parseFloat(raw.heading) || 0,
    passengers: parseInt(raw.passengers) || 0,
    status: raw.status || 'normal',
    timestamp: raw.timestamp,
  };
}

/**
 * Retrieve the latest telemetry states for all known devices in a single pipeline call.
 * Used for instant dashboard initial load without querying InfluxDB.
 *
 * Acceptance Criterion: Initial dashboard load from Redis state cache (no InfluxDB query).
 */
export async function getAllDeviceStates(deviceIds) {
  const keys = deviceIds.map(id => KEY.state(id));
  const results = await redisClient.pipelineHgetall(keys);

  return deviceIds.map((id, i) => {
    const raw = results[i];
    if (!raw) return { deviceId: id, cached: false };
    const parsedLat = parseFloat(raw.lat);
    const parsedLng = parseFloat(raw.lng);
    return {
      deviceId: id,
      cached: true,
      lat: Number.isFinite(parsedLat) ? parsedLat : null,
      lng: Number.isFinite(parsedLng) ? parsedLng : null,
      speed: parseFloat(raw.speed) || 0,
      heading: parseFloat(raw.heading) || 0,
      passengers: parseInt(raw.passengers) || 0,
      status: raw.status || 'normal',
      timestamp: raw.timestamp,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 3.4  API Rate Limiting — Sliding Window Counter
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Check and enforce API rate limiting for a given device.
 *
 * Uses a simple fixed-window counter (INCR + EXPIRE) which is atomic and
 * extremely fast. The window resets when the Redis key expires.
 *
 * @param {string} deviceId  - The device to check rate for
 * @param {boolean} isEmergency - Emergency signals bypass the rate limit
 * @returns {{ allowed: boolean, count: number, remaining: number, retryAfterSec: number }}
 */
export async function checkRateLimit(deviceId, isEmergency = false) {
  // Emergency overrides always bypass the limiter (per PRD 3.4 spec)
  if (isEmergency) {
    return { allowed: true, count: 0, remaining: RATE_LIMIT_MAX, retryAfterSec: 0, bypassed: true };
  }

  const key = KEY.rateLimit(deviceId);

  // Atomically increment the request counter
  const count = await redisClient.incr(key);

  if (count === null) {
    // Redis unavailable — fail open (allow request, do not block)
    return { allowed: true, count: 0, remaining: RATE_LIMIT_MAX, retryAfterSec: 0 };
  }

  // On first request in a window, set the expiry
  if (count === 1) {
    await redisClient.expire(key, TTL.RATE_WINDOW);
  }

  const remaining = Math.max(0, RATE_LIMIT_MAX - count);
  const allowed = count <= RATE_LIMIT_MAX;

  let retryAfterSec = 0;
  if (!allowed) {
    retryAfterSec = await redisClient.ttl(key);
    if (retryAfterSec < 0) retryAfterSec = TTL.RATE_WINDOW;
  }

  return { allowed, count, remaining, retryAfterSec };
}

// ──────────────────────────────────────────────────────────────────────────────
// 3.5  Login Rate Limiting — Per IP Brute Force Protection
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Check and enforce login rate limiting for a given IP address.
 * After LOGIN_RATE_LIMIT_MAX failed attempts within LOGIN_RATE_WINDOW seconds,
 * the IP is locked out and cannot attempt login until the window expires.
 *
 * @param {string} ipAddress - The client IP to rate limit
 * @returns {{ allowed: boolean, attempts: number, remaining: number, retryAfterSec: number }}
 */
export async function checkLoginRateLimit(ipAddress) {
  const key = `ratelimit:login:${ipAddress}`;

  const count = await redisClient.incr(key);

  if (count === null) {
    // Redis unavailable — fail open
    return { allowed: true, attempts: 0, remaining: LOGIN_RATE_LIMIT_MAX, retryAfterSec: 0 };
  }

  // On first attempt in a window, set the expiry
  if (count === 1) {
    await redisClient.expire(key, LOGIN_RATE_WINDOW);
  }

  const remaining = Math.max(0, LOGIN_RATE_LIMIT_MAX - count);
  const allowed = count <= LOGIN_RATE_LIMIT_MAX;

  let retryAfterSec = 0;
  if (!allowed) {
    retryAfterSec = await redisClient.ttl(key);
    if (retryAfterSec < 0) retryAfterSec = LOGIN_RATE_WINDOW;
  }

  return { allowed, attempts: count, remaining, retryAfterSec };
}

/**
 * Reset login rate limit for an IP after successful login.
 */
export async function resetLoginRateLimit(ipAddress) {
  const key = `ratelimit:login:${ipAddress}`;
  await redisClient.del(key);
}
