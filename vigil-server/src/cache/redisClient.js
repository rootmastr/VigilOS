/**
 * VigilOS Redis Client — Singleton ioredis Connection
 * Provides a shared, auto-reconnecting Redis client for the entire backend.
 * Configure via REDIS_URL environment variable (default: redis://127.0.0.1:6379).
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

class RedisClient {
  constructor() {
    this.client = new Redis(REDIS_URL, {
      // Retry strategy: exponential backoff up to 30s, then stop retrying
      retryStrategy(times) {
        if (times > 10) {
          console.error('[Redis] Max reconnection attempts reached. Redis unavailable.');
          return null; // stop retrying
        }
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
      // Lazy connect — don't throw at import time if Redis is down
      lazyConnect: true,
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
    });

    this.isAvailable = false;

    this.client.on('connect', () => {
      this.isAvailable = true;
      console.log('[Redis] ✅ Connected to Redis server at', REDIS_URL);
    });

    this.client.on('ready', () => {
      this.isAvailable = true;
    });

    this.client.on('error', (err) => {
      this.isAvailable = false;
      // Only log the first occurrence to avoid log spam
      if (err.code === 'ECONNREFUSED') {
        console.warn('[Redis] ⚠️  Connection refused. Running in degraded mode (Postgres fallback active).');
      } else {
        console.error('[Redis] Error:', err.message);
      }
    });

    this.client.on('close', () => {
      this.isAvailable = false;
    });
  }

  /**
   * Attempt connection. Called once at server startup.
   * Non-blocking — server continues even if Redis is unavailable.
   */
  async connect() {
    try {
      await this.client.connect();
    } catch (err) {
      console.warn('[Redis] ⚠️  Initial connection failed. Continuing without Redis cache.');
    }
  }

  /**
   * Graceful shutdown — call on SIGTERM/SIGINT.
   */
  async quit() {
    try {
      await this.client.quit();
      console.log('[Redis] Connection closed gracefully.');
    } catch (_) {}
  }

  // ──────────────────────────────────────────────
  // Core Key-Value Operations
  // ──────────────────────────────────────────────

  /** GET a string value. Returns null if key missing or Redis unavailable. */
  async get(key) {
    if (!this.isAvailable) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      console.error(`[Redis] GET error for key "${key}":`, err.message);
      return null;
    }
  }

  /** SET a key with no expiry. */
  async set(key, value) {
    if (!this.isAvailable) return false;
    try {
      await this.client.set(key, String(value));
      return true;
    } catch (err) {
      console.error(`[Redis] SET error for key "${key}":`, err.message);
      return false;
    }
  }

  /** SETEX — SET with TTL in seconds. */
  async setex(key, ttlSeconds, value) {
    if (!this.isAvailable) return false;
    try {
      await this.client.setex(key, ttlSeconds, String(value));
      return true;
    } catch (err) {
      console.error(`[Redis] SETEX error for key "${key}":`, err.message);
      return false;
    }
  }

  /** DEL one or more keys. */
  async del(...keys) {
    if (!this.isAvailable) return 0;
    try {
      return await this.client.del(...keys);
    } catch (err) {
      console.error(`[Redis] DEL error:`, err.message);
      return 0;
    }
  }

  /** EXISTS — Returns true if key exists. */
  async exists(key) {
    if (!this.isAvailable) return false;
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (err) {
      console.error(`[Redis] EXISTS error for key "${key}":`, err.message);
      return false;
    }
  }

  /** EXPIRE — Reset TTL on an existing key. */
  async expire(key, ttlSeconds) {
    if (!this.isAvailable) return false;
    try {
      await this.client.expire(key, ttlSeconds);
      return true;
    } catch (err) {
      console.error(`[Redis] EXPIRE error for key "${key}":`, err.message);
      return false;
    }
  }

  // ──────────────────────────────────────────────
  // Hash Operations
  // ──────────────────────────────────────────────

  /** HSET — Set multiple fields on a Hash key. Accepts a plain object. */
  async hset(key, fieldsObj) {
    if (!this.isAvailable) return false;
    try {
      // ioredis accepts hset(key, field, value, field, value ...) or hset(key, obj)
      await this.client.hset(key, fieldsObj);
      return true;
    } catch (err) {
      console.error(`[Redis] HSET error for key "${key}":`, err.message);
      return false;
    }
  }

  /** HGETALL — Get all fields of a Hash. Returns null if key missing. */
  async hgetall(key) {
    if (!this.isAvailable) return null;
    try {
      const result = await this.client.hgetall(key);
      // ioredis returns {} for missing keys — normalise to null
      if (!result || Object.keys(result).length === 0) return null;
      return result;
    } catch (err) {
      console.error(`[Redis] HGETALL error for key "${key}":`, err.message);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // Counter Operations (Rate Limiting)
  // ──────────────────────────────────────────────

  /** INCR — Atomically increment a counter. Returns new value. */
  async incr(key) {
    if (!this.isAvailable) return null;
    try {
      return await this.client.incr(key);
    } catch (err) {
      console.error(`[Redis] INCR error for key "${key}":`, err.message);
      return null;
    }
  }

  /** TTL — Get remaining time-to-live in seconds (-1 = no expiry, -2 = key missing). */
  async ttl(key) {
    if (!this.isAvailable) return -2;
    try {
      return await this.client.ttl(key);
    } catch (err) {
      return -2;
    }
  }

  // ──────────────────────────────────────────────
  // Scan / Pattern Operations
  // ──────────────────────────────────────────────

  /**
   * SCAN for all keys matching a pattern.
   * Returns an array of matching key strings.
   * Uses cursor-based iteration to avoid blocking the server.
   */
  async scanKeys(pattern) {
    if (!this.isAvailable) return [];
    try {
      const keys = [];
      let cursor = '0';
      do {
        const [nextCursor, batch] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');
      return keys;
    } catch (err) {
      console.error(`[Redis] SCAN error for pattern "${pattern}":`, err.message);
      return [];
    }
  }

  /**
   * Execute multiple HGETALL commands in a pipeline for efficiency.
   * Returns an array of results in the same order as the keys array.
   */
  async pipelineHgetall(keys) {
    if (!this.isAvailable || keys.length === 0) return [];
    try {
      const pipeline = this.client.pipeline();
      keys.forEach(key => pipeline.hgetall(key));
      const results = await pipeline.exec();
      return results.map(([err, val]) => {
        if (err || !val || Object.keys(val).length === 0) return null;
        return val;
      });
    } catch (err) {
      console.error('[Redis] Pipeline HGETALL error:', err.message);
      return keys.map(() => null);
    }
  }
}

// Export a single shared instance
export const redisClient = new RedisClient();
