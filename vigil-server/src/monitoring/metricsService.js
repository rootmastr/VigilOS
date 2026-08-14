/**
 * VigilOS Metrics Service — System Health, Performance & Operational Monitoring
 *
 * Tracks request metrics, active connections, system resources, business KPIs,
 * cache ratios, and database query performance. Implements circuit breaker
 * pattern, alerting rules, and a 24-hour circular buffer for historical data.
 */

import os from 'os';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
const HISTORY_BUCKET_MS = 60 * 1000;              // 1-minute aggregation
const MAX_HISTORY_BUCKETS = Math.ceil(HISTORY_RETENTION_MS / HISTORY_BUCKET_MS);

const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,
  RECOVERY_TIMEOUT_MS: 30000,
  HALF_OPEN_MAX_CALLS: 3,
};

const ALERT_THRESHOLDS = {
  HIGH_ERROR_RATE_PERCENT: 5,
  HIGH_ERROR_RATE_DURATION_MS: 5 * 60 * 1000,
  HIGH_RESPONSE_TIME_MS: 500,
  HIGH_RESPONSE_TIME_DURATION_MS: 5 * 60 * 1000,
  MEMORY_USAGE_PERCENT: 80,
  CACHE_HIT_RATIO_PERCENT: 50,
  WEBSOCKET_SPIKE_MULTIPLIER: 3,
};

// ──────────────────────────────────────────────────────────────────────────────
// Circular Buffer — Fixed-size ring buffer for historical metric data
// ──────────────────────────────────────────────────────────────────────────────

class CircularBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;
    this.size = 0;
  }

  push(value) {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  getAll() {
    if (this.size === 0) return [];
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ];
  }

  getLatest(count) {
    const all = this.getAll();
    return all.slice(-count);
  }

  getRange(startTime, endTime) {
    return this.getAll().filter(
      (entry) => entry.timestamp >= startTime && entry.timestamp <= endTime
    );
  }

  clear() {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.size = 0;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Circuit Breaker — Prevents cascade failures on external service calls
// ──────────────────────────────────────────────────────────────────────────────

class CircuitBreaker {
  constructor(name) {
    this.name = name;
    this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;

    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= CIRCUIT_BREAKER.RECOVERY_TIMEOUT_MS) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
        return true;
      }
      return false;
    }

    // HALF_OPEN
    return this.halfOpenCalls < CIRCUIT_BREAKER.HALF_OPEN_MAX_CALLS;
  }

  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= CIRCUIT_BREAKER.HALF_OPEN_MAX_CALLS) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      return;
    }

    if (this.failureCount >= CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
      this.state = 'OPEN';
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// MetricsService — Singleton service for all operational metrics
// ──────────────────────────────────────────────────────────────────────────────

class MetricsService {
  constructor() {
    this.startTime = Date.now();

    // ── Request metrics ────────────────────────────────────────────────────
    this.requestMetrics = {
      total: 0,
      success: 0,
      clientError: 0,
      serverError: 0,
      responseTimes: [],
      byEndpoint: new Map(),
      byMethod: new Map(),
    };

    // ── Connection counters ────────────────────────────────────────────────
    this.connections = {
      websocket: { current: 0, totalConnects: 0, totalDisconnects: 0 },
      mqtt: { current: 0, totalConnects: 0, totalDisconnects: 0, reconnects: 0 },
      database: { current: 0, totalConnects: 0, totalDisconnects: 0 },
    };

    // ── System resource snapshot (updated on collection tick) ──────────────
    this.systemResources = {
      memoryUsage: { heapUsed: 0, heapTotal: 0, rss: 0, external: 0, percentUsed: 0 },
      cpuUsage: { user: 0, system: 0 },
      uptime: 0,
      loadAverage: [0, 0, 0],
      freeMemory: 0,
      totalMemory: 0,
    };

    // ── Business metrics ───────────────────────────────────────────────────
    this.businessMetrics = {
      vehiclesOnline: 0,
      totalVehicles: 0,
      incidents: { active: 0, total: 0 },
      alerts: { active: 0, total: 0 },
    };

    // ── Cache metrics ──────────────────────────────────────────────────────
    this.cacheMetrics = {
      gets: { hits: 0, misses: 0 },
      sets: { success: 0, failure: 0 },
      deletes: { success: 0, failure: 0 },
      hitRatio: 0,
    };

    // ── Database metrics ───────────────────────────────────────────────────
    this.databaseMetrics = {
      queries: { total: 0, success: 0, failure: 0 },
      avgQueryTime: 0,
      slowQueries: 0,
      queryTimes: [],
    };

    // ── Circuit breakers ───────────────────────────────────────────────────
    this.circuitBreakers = {
      database: new CircuitBreaker('database'),
      externalService: new CircuitBreaker('externalService'),
    };

    // ── Alert state ────────────────────────────────────────────────────────
    this.alerts = {
      active: [],
      history: [],
      lastChecked: null,
    };

    // ── Historical data (circular buffers) ─────────────────────────────────
    this.history = {
      requests: new CircularBuffer(MAX_HISTORY_BUCKETS),
      responseTimes: new CircularBuffer(MAX_HISTORY_BUCKETS),
      errors: new CircularBuffer(MAX_HISTORY_BUCKETS),
      connections: new CircularBuffer(MAX_HISTORY_BUCKETS),
      systemResources: new CircularBuffer(MAX_HISTORY_BUCKETS),
      business: new CircularBuffer(MAX_HISTORY_BUCKETS),
      cache: new CircularBuffer(MAX_HISTORY_BUCKETS),
      database: new CircularBuffer(MAX_HISTORY_BUCKETS),
    };

    // ── Collection timer ───────────────────────────────────────────────────
    this.collectionInterval = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Request Tracking
  // ═══════════════════════════════════════════════════════════════════════════

  trackRequest(endpoint, method, duration, statusCode) {
    this.requestMetrics.total++;

    if (statusCode < 400) {
      this.requestMetrics.success++;
    } else if (statusCode < 500) {
      this.requestMetrics.clientError++;
    } else {
      this.requestMetrics.serverError++;
    }

    this.requestMetrics.responseTimes.push(duration);
    if (this.requestMetrics.responseTimes.length > 1000) {
      this.requestMetrics.responseTimes.shift();
    }

    const endpointKey = this._normalizeEndpoint(endpoint);
    const epStats = this.requestMetrics.byEndpoint.get(endpointKey) || {
      count: 0,
      totalTime: 0,
      errors: 0,
    };
    epStats.count++;
    epStats.totalTime += duration;
    if (statusCode >= 500) epStats.errors++;
    this.requestMetrics.byEndpoint.set(endpointKey, epStats);

    const methodStats = this.requestMetrics.byMethod.get(method) || {
      count: 0,
      totalTime: 0,
      errors: 0,
    };
    methodStats.count++;
    methodStats.totalTime += duration;
    if (statusCode >= 500) methodStats.errors++;
    this.requestMetrics.byMethod.set(method, methodStats);

    this._checkResponseTimeAlert(duration);
    this._checkErrorRateAlert();
  }

  _normalizeEndpoint(endpoint) {
    return endpoint
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/gi, '/:uuid')
      .replace(/\?.*$/, '');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Connection Tracking
  // ═══════════════════════════════════════════════════════════════════════════

  trackWebSocketConnection(action) {
    if (action === 'connect') {
      this.connections.websocket.current++;
      this.connections.websocket.totalConnects++;
    } else if (action === 'disconnect') {
      this.connections.websocket.current = Math.max(0, this.connections.websocket.current - 1);
      this.connections.websocket.totalDisconnects++;
    }
    this._checkWebSocketSpikeAlert();
  }

  trackMqttConnection(action) {
    if (action === 'connect') {
      this.connections.mqtt.current++;
      this.connections.mqtt.totalConnects++;
    } else if (action === 'disconnect') {
      this.connections.mqtt.current = Math.max(0, this.connections.mqtt.current - 1);
      this.connections.mqtt.totalDisconnects++;
    } else if (action === 'reconnect') {
      this.connections.mqtt.reconnects++;
    }
  }

  trackDatabaseConnection(action) {
    const cb = this.circuitBreakers.database;
    if (!cb.canExecute()) {
      return { accepted: false, circuitState: cb.state };
    }

    if (action === 'connect') {
      this.connections.database.current++;
      this.connections.database.totalConnects++;
      cb.recordSuccess();
    } else if (action === 'disconnect') {
      this.connections.database.current = Math.max(0, this.connections.database.current - 1);
      this.connections.database.totalDisconnects++;
    }

    return { accepted: true, circuitState: cb.state };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Cache Tracking
  // ═══════════════════════════════════════════════════════════════════════════

  trackCacheOperation(action, hit) {
    if (action === 'get') {
      if (hit) {
        this.cacheMetrics.gets.hits++;
      } else {
        this.cacheMetrics.gets.misses++;
      }
      const total = this.cacheMetrics.gets.hits + this.cacheMetrics.gets.misses;
      this.cacheMetrics.hitRatio =
        total > 0 ? (this.cacheMetrics.gets.hits / total) * 100 : 0;
      this._checkCacheHitRatioAlert();
    } else if (action === 'set') {
      if (hit) {
        this.cacheMetrics.sets.success++;
      } else {
        this.cacheMetrics.sets.failure++;
      }
    } else if (action === 'delete') {
      if (hit) {
        this.cacheMetrics.deletes.success++;
      } else {
        this.cacheMetrics.deletes.failure++;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Database Query Tracking
  // ═══════════════════════════════════════════════════════════════════════════

  trackDatabaseQuery(operation, duration, success) {
    const cb = this.circuitBreakers.database;
    if (!cb.canExecute()) {
      return { tracked: false, circuitState: cb.state };
    }

    this.databaseMetrics.queries.total++;
    this.databaseMetrics.queryTimes.push(duration);
    if (this.databaseMetrics.queryTimes.length > 500) {
      this.databaseMetrics.queryTimes.shift();
    }

    if (success) {
      this.databaseMetrics.queries.success++;
      cb.recordSuccess();
    } else {
      this.databaseMetrics.queries.failure++;
      cb.recordFailure();
    }

    if (duration > 1000) {
      this.databaseMetrics.slowQueries++;
    }

    if (this.databaseMetrics.queryTimes.length > 0) {
      this.databaseMetrics.avgQueryTime =
        this.databaseMetrics.queryTimes.reduce((a, b) => a + b, 0) /
        this.databaseMetrics.queryTimes.length;
    }

    return { tracked: true, circuitState: cb.state };
  }

  trackExternalServiceCall(serviceName, duration, success) {
    const cb = this.circuitBreakers.externalService;
    if (!cb.canExecute()) {
      return { called: false, circuitState: cb.state };
    }

    if (success) {
      cb.recordSuccess();
    } else {
      cb.recordFailure();
    }

    return { called: true, circuitState: cb.state };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Business Metrics
  // ═══════════════════════════════════════════════════════════════════════════

  trackBusinessMetric(name, value, tags = {}) {
    if (!this.businessMetrics[name]) {
      this.businessMetrics[name] = { value: 0, tags: {}, history: [] };
    }

    const metric = this.businessMetrics[name];
    metric.value = value;
    metric.tags = tags;
    metric.lastUpdated = Date.now();

    if (!metric.history) metric.history = [];
    metric.history.push({ value, timestamp: Date.now(), tags });
    if (metric.history.length > 100) metric.history.shift();
  }

  setBusinessMetrics(data) {
    if (data.vehiclesOnline !== undefined) {
      this.businessMetrics.vehiclesOnline = data.vehiclesOnline;
    }
    if (data.totalVehicles !== undefined) {
      this.businessMetrics.totalVehicles = data.totalVehicles;
    }
    if (data.activeIncidents !== undefined) {
      this.businessMetrics.incidents.active = data.activeIncidents;
    }
    if (data.totalIncidents !== undefined) {
      this.businessMetrics.incidents.total = data.totalIncidents;
    }
    if (data.activeAlerts !== undefined) {
      this.businessMetrics.alerts.active = data.activeAlerts;
    }
    if (data.totalAlerts !== undefined) {
      this.businessMetrics.alerts.total = data.totalAlerts;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Metrics Retrieval
  // ═══════════════════════════════════════════════════════════════════════════

  getMetrics() {
    const avgResponseTime =
      this.requestMetrics.responseTimes.length > 0
        ? this.requestMetrics.responseTimes.reduce((a, b) => a + b, 0) /
          this.requestMetrics.responseTimes.length
        : 0;

    const p95ResponseTime = this._percentile(this.requestMetrics.responseTimes, 95);
    const p99ResponseTime = this._percentile(this.requestMetrics.responseTimes, 99);

    const errorRate =
      this.requestMetrics.total > 0
        ? (this.requestMetrics.serverError / this.requestMetrics.total) * 100
        : 0;

    const topEndpoints = [...this.requestMetrics.byEndpoint.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        avgTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
        errorRate: stats.count > 0 ? (stats.errors / stats.count) * 100 : 0,
      }));

    return {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      requests: {
        total: this.requestMetrics.total,
        success: this.requestMetrics.success,
        clientError: this.requestMetrics.clientError,
        serverError: this.requestMetrics.serverError,
        errorRate: parseFloat(errorRate.toFixed(2)),
        avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
        p95ResponseTime: parseFloat(p95ResponseTime.toFixed(2)),
        p99ResponseTime: parseFloat(p99ResponseTime.toFixed(2)),
        throughput: this._calculateThroughput(),
        topEndpoints,
      },
      connections: { ...this.connections },
      system: { ...this.systemResources },
      business: { ...this.businessMetrics },
      cache: {
        hitRatio: parseFloat(this.cacheMetrics.hitRatio.toFixed(2)),
        gets: { ...this.cacheMetrics.gets },
        sets: { ...this.cacheMetrics.sets },
        deletes: { ...this.cacheMetrics.deletes },
      },
      database: {
        queries: { ...this.databaseMetrics.queries },
        avgQueryTime: parseFloat(this.databaseMetrics.avgQueryTime.toFixed(2)),
        slowQueries: this.databaseMetrics.slowQueries,
        circuitBreaker: this.circuitBreakers.database.getStatus(),
      },
      circuitBreakers: {
        database: this.circuitBreakers.database.getStatus(),
        externalService: this.circuitBreakers.externalService.getStatus(),
      },
      alerts: {
        active: this.alerts.active,
        recentCount: this.alerts.history.length,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Health Status
  // ═══════════════════════════════════════════════════════════════════════════

  getHealthStatus() {
    const mem = this.systemResources.memoryUsage;
    const errorRate =
      this.requestMetrics.total > 0
        ? (this.requestMetrics.serverError / this.requestMetrics.total) * 100
        : 0;

    const issues = [];

    if (mem.percentUsed > ALERT_THRESHOLDS.MEMORY_USAGE_PERCENT) {
      issues.push(`Memory usage critical: ${mem.percentUsed.toFixed(1)}%`);
    }
    if (errorRate > ALERT_THRESHOLDS.HIGH_ERROR_RATE_PERCENT) {
      issues.push(`Error rate elevated: ${errorRate.toFixed(2)}%`);
    }
    if (this.circuitBreakers.database.state === 'OPEN') {
      issues.push('Database circuit breaker OPEN');
    }
    if (this.circuitBreakers.externalService.state === 'OPEN') {
      issues.push('External service circuit breaker OPEN');
    }

    const avgResponseTime =
      this.requestMetrics.responseTimes.length > 0
        ? this.requestMetrics.responseTimes.reduce((a, b) => a + b, 0) /
          this.requestMetrics.responseTimes.length
        : 0;
    if (avgResponseTime > ALERT_THRESHOLDS.HIGH_RESPONSE_TIME_MS) {
      issues.push(`Response time elevated: ${avgResponseTime.toFixed(0)}ms avg`);
    }

    let status = 'healthy';
    if (issues.length > 0) status = 'degraded';
    if (
      mem.percentUsed > 95 ||
      errorRate > 20 ||
      this.circuitBreakers.database.state === 'OPEN'
    ) {
      status = 'unhealthy';
    }

    return {
      status,
      uptime: Date.now() - this.startTime,
      uptimeFormatted: this._formatUptime(Date.now() - this.startTime),
      timestamp: new Date().toISOString(),
      memory: {
        heapUsed: this._bytesToMB(mem.heapUsed),
        heapTotal: this._bytesToMB(mem.heapTotal),
        rss: this._bytesToMB(mem.rss),
        percentUsed: parseFloat(mem.percentUsed.toFixed(1)),
      },
      activeConnections: {
        websocket: this.connections.websocket.current,
        mqtt: this.connections.mqtt.current,
        database: this.connections.database.current,
        total:
          this.connections.websocket.current +
          this.connections.mqtt.current +
          this.connections.database.current,
      },
      recentErrorRate: parseFloat(errorRate.toFixed(2)),
      avgResponseTime: parseFloat(avgResponseTime.toFixed(0)),
      requestsTotal: this.requestMetrics.total,
      circuitBreakers: {
        database: this.circuitBreakers.database.state,
        externalService: this.circuitBreakers.externalService.state,
      },
      issues,
      services: {
        api: status === 'unhealthy' ? 'down' : 'up',
        websocket: this.connections.websocket.current > 0 ? 'active' : 'idle',
        mqtt: this.connections.mqtt.current > 0 ? 'active' : 'idle',
        database:
          this.circuitBreakers.database.state === 'OPEN' ? 'degraded' : 'up',
        cache: this.cacheMetrics.hitRatio > 0 ? 'active' : 'unused',
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Historical Data
  // ═══════════════════════════════════════════════════════════════════════════

  getMetricsHistory(metricName, durationMs = 3600000) {
    const endTime = Date.now();
    const startTime = endTime - durationMs;

    const buffer = this.history[metricName];
    if (!buffer) {
      return { error: `Unknown metric: ${metricName}`, available: Object.keys(this.history) };
    }

    const data = buffer.getRange(startTime, endTime);

    return {
      metric: metricName,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      durationMs,
      dataPoints: data.length,
      data,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Periodic Collection
  // ═══════════════════════════════════════════════════════════════════════════

  startCollection(intervalMs = 60000) {
    if (this.collectionInterval) return;

    this._collectSnapshot();

    this.collectionInterval = setInterval(() => {
      this._collectSnapshot();
    }, intervalMs);

    console.log(`[Metrics] Collection started (interval: ${intervalMs}ms)`);
  }

  stopCollection() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
      console.log('[Metrics] Collection stopped');
    }
  }

  _collectSnapshot() {
    const now = Date.now();

    // System resources
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memPercent = ((totalMem - freeMem) / totalMem) * 100;

    this.systemResources = {
      memoryUsage: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
        percentUsed: memPercent,
      },
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      loadAverage: os.loadavg(),
      freeMemory: freeMem,
      totalMemory: totalMem,
    };

    const avgResponseTime =
      this.requestMetrics.responseTimes.length > 0
        ? this.requestMetrics.responseTimes.reduce((a, b) => a + b, 0) /
          this.requestMetrics.responseTimes.length
        : 0;

    const errorRate =
      this.requestMetrics.total > 0
        ? (this.requestMetrics.serverError / this.requestMetrics.total) * 100
        : 0;

    // Write snapshots to circular buffers
    this.history.requests.push({
      timestamp: now,
      total: this.requestMetrics.total,
      success: this.requestMetrics.success,
      errors: this.requestMetrics.serverError,
      throughput: this._calculateThroughput(),
    });

    this.history.responseTimes.push({
      timestamp: now,
      avg: parseFloat(avgResponseTime.toFixed(2)),
      p95: parseFloat(this._percentile(this.requestMetrics.responseTimes, 95).toFixed(2)),
      p99: parseFloat(this._percentile(this.requestMetrics.responseTimes, 99).toFixed(2)),
    });

    this.history.errors.push({
      timestamp: now,
      rate: parseFloat(errorRate.toFixed(2)),
      total: this.requestMetrics.serverError,
    });

    this.history.connections.push({
      timestamp: now,
      websocket: this.connections.websocket.current,
      mqtt: this.connections.mqtt.current,
      database: this.connections.database.current,
    });

    this.history.systemResources.push({
      timestamp: now,
      memoryPercentUsed: parseFloat(memPercent.toFixed(1)),
      heapUsedMB: this._bytesToMB(mem.heapUsed),
      rssMB: this._bytesToMB(mem.rss),
      loadAverage: [...this.systemResources.loadAverage],
    });

    this.history.business.push({
      timestamp: now,
      ...this.businessMetrics,
    });

    this.history.cache.push({
      timestamp: now,
      hitRatio: parseFloat(this.cacheMetrics.hitRatio.toFixed(2)),
      totalGets: this.cacheMetrics.gets.hits + this.cacheMetrics.gets.misses,
    });

    this.history.database.push({
      timestamp: now,
      avgQueryTime: parseFloat(this.databaseMetrics.avgQueryTime.toFixed(2)),
      totalQueries: this.databaseMetrics.queries.total,
      slowQueries: this.databaseMetrics.slowQueries,
    });

    this._evaluateAlerts();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Express Middleware
  // ═══════════════════════════════════════════════════════════════════════════

  createMiddleware() {
    return (req, res, next) => {
      const start = process.hrtime.bigint();

      const originalEnd = res.end;
      res.end = (...args) => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1e6; // nanoseconds to ms

        const endpoint = req.route?.path || req.path || 'unknown';
        const method = req.method;
        const statusCode = res.statusCode;

        this.trackRequest(endpoint, method, duration, statusCode);

        originalEnd.apply(res, args);
      };

      next();
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Health Check Endpoint Handler
  // ═══════════════════════════════════════════════════════════════════════════

  createHealthCheckHandler() {
    return (req, res) => {
      const health = this.getHealthStatus();
      const statusCode =
        health.status === 'healthy'
          ? 200
          : health.status === 'degraded'
            ? 200
            : 503;

      const body = JSON.stringify(health);
      if (typeof res.status === 'function') {
        res.status(statusCode).json(health);
      } else {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(body);
      }
    };
  }

  createMetricsEndpointHandler() {
    return (req, res) => {
      const metrics = this.getMetrics();
      if (typeof res.json === 'function') {
        res.json(metrics);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metrics));
      }
    };
  }

  createHistoryEndpointHandler() {
    return (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const metric = url.searchParams.get('metric');
      const duration = url.searchParams.get('duration');

      if (!metric) {
        const body = JSON.stringify({
          error: 'metric query parameter required',
          available: Object.keys(this.history),
        });
        if (typeof res.status === 'function') {
          res.status(400).json({ error: 'metric query parameter required', available: Object.keys(this.history) });
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(body);
        }
        return;
      }

      const durationMs = duration ? parseInt(duration, 10) : 3600000;
      const history = this.getMetricsHistory(metric, durationMs);
      if (typeof res.json === 'function') {
        res.json(history);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(history));
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Alerting
  // ═══════════════════════════════════════════════════════════════════════════

  _evaluateAlerts() {
    this.alerts.lastChecked = new Date().toISOString();
    this._checkErrorRateAlert();
    this._checkMemoryAlert();
    this._checkCacheHitRatioAlert();
  }

  _checkErrorRateAlert() {
    if (this.requestMetrics.total < 10) return;

    const errorRate =
      (this.requestMetrics.serverError / this.requestMetrics.total) * 100;

    if (errorRate > ALERT_THRESHOLDS.HIGH_ERROR_RATE_PERCENT) {
      this._addAlert(
        'HIGH_ERROR_RATE',
        `Error rate ${errorRate.toFixed(2)}% exceeds ${ALERT_THRESHOLDS.HIGH_ERROR_RATE_PERCENT}% threshold`,
        'critical'
      );
    } else {
      this._resolveAlert('HIGH_ERROR_RATE');
    }
  }

  _checkResponseTimeAlert(duration) {
    if (duration > ALERT_THRESHOLDS.HIGH_RESPONSE_TIME_MS) {
      const avgResponseTime =
        this.requestMetrics.responseTimes.length > 0
          ? this.requestMetrics.responseTimes.reduce((a, b) => a + b, 0) /
            this.requestMetrics.responseTimes.length
          : 0;

      if (avgResponseTime > ALERT_THRESHOLDS.HIGH_RESPONSE_TIME_MS) {
        this._addAlert(
          'HIGH_RESPONSE_TIME',
          `Avg response time ${avgResponseTime.toFixed(0)}ms exceeds ${ALERT_THRESHOLDS.HIGH_RESPONSE_TIME_MS}ms threshold`,
          'warning'
        );
      }
    } else {
      this._resolveAlert('HIGH_RESPONSE_TIME');
    }
  }

  _checkMemoryAlert() {
    const memPercent = this.systemResources.memoryUsage.percentUsed;

    if (memPercent > ALERT_THRESHOLDS.MEMORY_USAGE_PERCENT) {
      this._addAlert(
        'HIGH_MEMORY_USAGE',
        `Memory usage ${memPercent.toFixed(1)}% exceeds ${ALERT_THRESHOLDS.MEMORY_USAGE_PERCENT}% threshold`,
        memPercent > 90 ? 'critical' : 'warning'
      );
    } else {
      this._resolveAlert('HIGH_MEMORY_USAGE');
    }
  }

  _checkWebSocketSpikeAlert() {
    const total = this.connections.websocket.totalConnects;
    if (total < 10) return;

    const recentAvg = total / Math.max(1, (Date.now() - this.startTime) / 60000);
    const baseline = this.connections.websocket.totalConnects / Math.max(1, (Date.now() - this.startTime) / 60000);

    if (recentAvg > baseline * ALERT_THRESHOLDS.WEBSOCKET_SPIKE_MULTIPLIER) {
      this._addAlert(
        'WEBSOCKET_SPIKE',
        `WebSocket connection rate spike detected`,
        'warning'
      );
    } else {
      this._resolveAlert('WEBSOCKET_SPIKE');
    }
  }

  _checkCacheHitRatioAlert() {
    const totalGets = this.cacheMetrics.gets.hits + this.cacheMetrics.gets.misses;
    if (totalGets < 20) return;

    if (this.cacheMetrics.hitRatio < ALERT_THRESHOLDS.CACHE_HIT_RATIO_PERCENT) {
      this._addAlert(
        'LOW_CACHE_HIT_RATIO',
        `Cache hit ratio ${this.cacheMetrics.hitRatio.toFixed(1)}% below ${ALERT_THRESHOLDS.CACHE_HIT_RATIO_PERCENT}% threshold`,
        'warning'
      );
    } else {
      this._resolveAlert('LOW_CACHE_HIT_RATIO');
    }
  }

  _addAlert(type, message, severity = 'warning') {
    const existing = this.alerts.active.find((a) => a.type === type);
    if (existing) return;

    const alert = {
      type,
      message,
      severity,
      timestamp: new Date().toISOString(),
      id: `alert-${type}-${Date.now()}`,
    };

    this.alerts.active.push(alert);
    this.alerts.history.push({ ...alert, action: 'fired' });

    if (this.alerts.history.length > 200) this.alerts.history.shift();

    console.log(`[Metrics Alert] ${severity.toUpperCase()}: ${message}`);
  }

  _resolveAlert(type) {
    const idx = this.alerts.active.findIndex((a) => a.type === type);
    if (idx === -1) return;

    const resolved = this.alerts.active.splice(idx, 1)[0];
    this.alerts.history.push({
      ...resolved,
      action: 'resolved',
      resolvedAt: new Date().toISOString(),
    });

    console.log(`[Metrics Alert] RESOLVED: ${resolved.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  _calculateThroughput() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return elapsed > 0 ? parseFloat((this.requestMetrics.total / elapsed).toFixed(2)) : 0;
  }

  _bytesToMB(bytes) {
    return parseFloat((bytes / (1024 * 1024)).toFixed(2));
  }

  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m ${seconds % 60}s`;
  }

  // ── Reset (for testing) ────────────────────────────────────────────────────

  reset() {
    this.requestMetrics = {
      total: 0,
      success: 0,
      clientError: 0,
      serverError: 0,
      responseTimes: [],
      byEndpoint: new Map(),
      byMethod: new Map(),
    };
    this.connections = {
      websocket: { current: 0, totalConnects: 0, totalDisconnects: 0 },
      mqtt: { current: 0, totalConnects: 0, totalDisconnects: 0, reconnects: 0 },
      database: { current: 0, totalConnects: 0, totalDisconnects: 0 },
    };
    this.cacheMetrics = {
      gets: { hits: 0, misses: 0 },
      sets: { success: 0, failure: 0 },
      deletes: { success: 0, failure: 0 },
      hitRatio: 0,
    };
    this.databaseMetrics = {
      queries: { total: 0, success: 0, failure: 0 },
      avgQueryTime: 0,
      slowQueries: 0,
      queryTimes: [],
    };
    this.businessMetrics = {
      vehiclesOnline: 0,
      totalVehicles: 0,
      incidents: { active: 0, total: 0 },
      alerts: { active: 0, total: 0 },
    };
    this.alerts = { active: [], history: [], lastChecked: null };
    Object.values(this.history).forEach((buf) => buf.clear());
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Export singleton instance
// ──────────────────────────────────────────────────────────────────────────────

const metricsService = new MetricsService();
export default metricsService;
export { MetricsService, CircularBuffer, CircuitBreaker };
