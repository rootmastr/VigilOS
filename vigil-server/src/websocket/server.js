/**
 * VigilOS Production WebSocket Server
 * Full-featured WebSocket layer with connection management, message queuing,
 * channel-based pub/sub, auth, compression, and monitoring.
 *
 * Compatible with the existing ws + ioredis + JWT stack.
 */

import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import zlib from 'zlib';

import { redisClient } from '../cache/redisClient.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vigilos-secret-key-2024';

// ── Configuration ────────────────────────────────────────────────────────────
const CONFIG = {
  // Connection
  MAX_CONNECTIONS_PER_TENANT: parseInt(process.env.WS_MAX_CONN_PER_TENANT) || 100,
  MAX_TOTAL_CONNECTIONS: parseInt(process.env.WS_MAX_TOTAL_CONN) || 5000,

  // Heartbeat
  HEARTBEAT_INTERVAL_MS: 30_000,
  HEARTBEAT_TIMEOUT_MS: 10_000,

  // Message queue
  MAX_QUEUED_MESSAGES: 200,
  MESSAGE_REPLAY_LIMIT: 100,

  // Rate limiting
  RATE_LIMIT_MAX_MESSAGES: 60,
  RATE_LIMIT_WINDOW_MS: 60_000,

  // Compression
  LARGE_MESSAGE_THRESHOLD: 1024, // bytes – compress above this

  // Deduplication
  DEDUP_TTL_MS: 30_000,

  // IP whitelist (empty = disabled)
  IP_WHITELIST: (process.env.WS_IP_WHITELIST || '').split(',').filter(Boolean),
};

// ── Priority Levels ──────────────────────────────────────────────────────────
const PRIORITY = { ALERT: 0, EVENT: 1, TELEMETRY: 2 };
const PRIORITY_LABELS = ['alert', 'event', 'telemetry'];

// ── Role-based channel access ────────────────────────────────────────────────
const CHANNEL_PERMISSIONS = {
  'telemetry:*':     ['SUPER_ADMIN', 'TENANT_ADMIN', 'DISPATCHER', 'VIEWER'],
  'vehicle:*':       ['SUPER_ADMIN', 'TENANT_ADMIN', 'DISPATCHER', 'VIEWER'],
  'incident:*':      ['SUPER_ADMIN', 'TENANT_ADMIN', 'DISPATCHER'],
  'emergency:*':     ['SUPER_ADMIN', 'TENANT_ADMIN', 'DISPATCHER', 'VIEWER'],
  'admin:*':         ['SUPER_ADMIN', 'TENANT_ADMIN'],
  'system:*':        ['SUPER_ADMIN'],
  'presence:*':      ['SUPER_ADMIN', 'TENANT_ADMIN', 'DISPATCHER', 'VIEWER'],
};

// ── Internal Helpers ─────────────────────────────────────────────────────────
const generateId = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();

function compressPayload(data) {
  try {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    const buf = Buffer.byteLength(json, 'utf-8');
    if (buf < CONFIG.LARGE_MESSAGE_THRESHOLD) return null;
    const deflated = zlib.deflateSync(Buffer.from(json, 'utf-8'));
    return { compressed: true, data: deflated.toString('base64'), originalSize: buf };
  } catch {
    return null;
  }
}

function decompressPayload(msg) {
  if (!msg.compressed) return msg;
  try {
    const buf = Buffer.from(msg.data, 'base64');
    const json = zlib.inflateSync(buf).toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ── Rate Limiter (per connection) — Redis only ────────────────────────────────
class ConnectionRateLimiter {
  constructor() {
    this.window = CONFIG.RATE_LIMIT_WINDOW_MS;
    this.max = CONFIG.RATE_LIMIT_MAX_MESSAGES;
  }

  async check(id) {
    if (!redisClient.isAvailable) return { allowed: true, count: 0, remaining: this.max };
    const key = `ws:ratelimit:${id}`;
    const now = Date.now();
    const windowStart = now - this.window;

    try {
      const pipe = redisClient.client.pipeline();
      pipe.zremrangebyscore(key, 0, windowStart);
      pipe.zadd(key, now, `${now}-${crypto.randomBytes(4).toString('hex')}`);
      pipe.zcard(key);
      pipe.expire(key, Math.ceil(this.window / 1000));
      const [, , countResult] = await pipe.exec();
      const count = countResult?.[1] ?? 0;
      return { allowed: count <= this.max, count, remaining: Math.max(0, this.max - count) };
    } catch {
      return { allowed: true, count: 0, remaining: this.max };
    }
  }

  async reset(id) {
    if (!redisClient.isAvailable) return;
    try { await redisClient.del(`ws:ratelimit:${id}`); } catch {}
  }
}

// ── Message Deduplication — Redis only ────────────────────────────────────────
class MessageDeduplicator {
  async isDuplicate(messageId) {
    if (!messageId) return false;
    if (!redisClient.isAvailable) return false;
    const key = `ws:dedup:${messageId}`;
    try {
      const exists = await redisClient.exists(key);
      if (exists) return true;
      await redisClient.setex(key, Math.ceil(CONFIG.DEDUP_TTL_MS / 1000), '1');
      return false;
    } catch {
      return false;
    }
  }
}

// ── Main WebSocket Server ────────────────────────────────────────────────────
export class VigilWSServer {
  constructor(httpServer) {
    this.httpServer = httpServer;
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: 1024 * 1024,
      perMessageDeflate: false,
    });

    this.httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname === '/ws') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
    });

    // Connection stores
    this.connections = new Map();        // ws → connection metadata
    this.connectionsByTenant = new Map(); // tenantId → Set<ws>
    this.channelSubscribers = new Map(); // channelName → Set<ws>
    this.channelWildcardMatchers = [];   // [{pattern, regex, channel, subscribers: Set<ws>}]

    // Utilities
    this.rateLimiter = new ConnectionRateLimiter();
    this.deduplicator = new MessageDeduplicator();
    this.metrics = new WSMetrics();

    // Timers
    this._heartbeatTimer = null;
    this._metricsTimer = null;

    this._init();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  _init() {
    this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));
    this._startHeartbeat();
    this._startMetricsBroadcast();
    this._publishMetrics = this._publishMetrics.bind(this);

    console.log('[WS] Server initialised on path /ws');
  }

  close() {
    clearInterval(this._heartbeatTimer);
    clearInterval(this._metricsTimer);
    for (const ws of this.connections.keys()) {
      ws.close(1001, 'Server shutting down');
    }
    this.wss.close();
    console.log('[WS] Server closed');
  }

  // ── Connection Management ────────────────────────────────────────────────

  async _handleConnection(ws, req) {
    const connectionId = generateId();
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // IP whitelist check
    if (CONFIG.IP_WHITELIST.length > 0 && !CONFIG.IP_WHITELIST.includes(clientIP)) {
      ws.close(4003, 'IP not whitelisted');
      this.metrics.recordRejection('ip_not_whitelisted');
      return;
    }

    // Total connection cap
    if (this.connections.size >= CONFIG.MAX_TOTAL_CONNECTIONS) {
      ws.close(4001, 'Server connection limit reached');
      this.metrics.recordRejection('total_limit');
      return;
    }

    // Token validation
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || req.headers['authorization']?.replace(/^Bearer\s+/, '');

    let user;
    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch {
      ws.close(4001, 'Invalid or missing token');
      this.metrics.recordRejection('auth_failed');
      return;
    }

    // Tenant connection cap
    const tenantId = user.tenantId;
    if (!this._checkTenantConnectionLimit(tenantId, ws)) return;

    // Store connection metadata
    const meta = {
      connectionId,
      userId: user.id,
      userName: user.name,
      role: user.role,
      tenantId,
      ip: clientIP,
      userAgent,
      connectedAt: nowISO(),
      lastMessageAt: null,
      lastPongAt: nowISO(),
      isAlive: true,
      pendingAck: new Set(),
    };
    this.connections.set(ws, meta);
    this._addTenantConnection(tenantId, ws);

    // Assign reconnect token for session resumption
    const reconnectToken = this._generateReconnectToken(meta);

    this.metrics.recordConnection(tenantId);

    // Send welcome + reconnect token
    this._send(ws, {
      type: 'connected',
      connectionId,
      reconnectToken,
      heartbeatInterval: CONFIG.HEARTBEAT_INTERVAL_MS,
      serverTime: nowISO(),
    });

    // Replay queued messages if any
    await this._replayQueuedMessages(ws, meta);

    // Message handler
    ws.on('message', (raw) => this._handleMessage(ws, raw));

    // Close handler
    ws.on('close', (code, reason) => this._handleDisconnect(ws, code, reason));

    // Error handler
    ws.on('error', (err) => this._handleError(ws, err));

    // Pong handler for heartbeat
    ws.on('pong', () => {
      meta.isAlive = true;
      meta.lastPongAt = nowISO();
    });

    console.log(`[WS] Client connected: ${connectionId} (user=${user.id}, tenant=${tenantId}, ip=${clientIP})`);
  }

  _checkTenantConnectionLimit(tenantId, ws) {
    const existing = this.connectionsByTenant.get(tenantId);
    if (existing && existing.size >= CONFIG.MAX_CONNECTIONS_PER_TENANT) {
      ws.close(4002, `Tenant connection limit reached (${CONFIG.MAX_CONNECTIONS_PER_TENANT})`);
      this.metrics.recordRejection('tenant_limit');
      return false;
    }
    return true;
  }

  _addTenantConnection(tenantId, ws) {
    if (!this.connectionsByTenant.has(tenantId)) {
      this.connectionsByTenant.set(tenantId, new Set());
    }
    this.connectionsByTenant.get(tenantId).add(ws);
  }

  _removeTenantConnection(tenantId, ws) {
    const set = this.connectionsByTenant.get(tenantId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.connectionsByTenant.delete(tenantId);
    }
  }

  _handleDisconnect(ws, code, reason) {
    const meta = this.connections.get(ws);
    if (!meta) return;

    // Remove from all channels
    for (const [channel, subs] of this.channelSubscribers) {
      subs.delete(ws);
      if (subs.size === 0) this.channelSubscribers.delete(channel);
    }
    this.channelWildcardMatchers.forEach(m => m.subscribers.delete(ws));

    // Remove from tenant tracking
    this._removeTenantConnection(meta.tenantId, ws);
    this.connections.delete(ws);
    this.rateLimiter.reset(meta.connectionId);
    this.metrics.recordDisconnection(meta.tenantId);

    console.log(`[WS] Client disconnected: ${meta.connectionId} (code=${code}, reason=${reason || 'N/A'})`);
  }

  _handleError(ws, err) {
    const meta = this.connections.get(ws);
    const id = meta?.connectionId || 'unknown';
    console.error(`[WS] Error on connection ${id}:`, err.message);
    this.metrics.recordError('connection_error');
    // Let the close event handle cleanup
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      for (const [ws, meta] of this.connections) {
        if (!meta.isAlive) {
          // Missed pong – terminate
          console.log(`[WS] Terminating unresponsive connection: ${meta.connectionId}`);
          ws.terminate();
          continue;
        }
        meta.isAlive = false;
        try { ws.ping(); } catch { /* already dead */ }
      }
    }, CONFIG.HEARTBEAT_INTERVAL_MS);
  }

  // ── Message Handling ─────────────────────────────────────────────────────

  async _handleMessage(ws, raw) {
    const meta = this.connections.get(ws);
    if (!meta) return;

    meta.lastMessageAt = nowISO();
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      this._send(ws, { type: 'error', message: 'Invalid JSON payload' });
      this.metrics.recordError('parse_error');
      return;
    }

    // Decompress if needed
    if (msg.compressed) {
      msg = decompressPayload(msg);
      if (!msg) {
        this._send(ws, { type: 'error', message: 'Failed to decompress payload' });
        this.metrics.recordError('decompress_error');
        return;
      }
    }

    // Deduplication
    if (msg.id && await this.deduplicator.isDuplicate(msg.id)) {
      return; // silently ignore duplicate
    }

    // Rate limiting
    const rateResult = await this.rateLimiter.check(meta.connectionId);
    if (!rateResult.allowed) {
      this._send(ws, {
        type: 'error',
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Max ${CONFIG.RATE_LIMIT_MAX_MESSAGES} msgs/${CONFIG.RATE_LIMIT_WINDOW_MS / 1000}s.`,
      });
      this.metrics.recordError('rate_limited');
      return;
    }

    // Route by message type
    const { type } = msg;
    switch (type) {
      case 'subscribe':     await this._handleSubscribe(ws, meta, msg); break;
      case 'unsubscribe':   await this._handleUnsubscribe(ws, meta, msg); break;
      case 'publish':       await this._handlePublish(ws, meta, msg); break;
      case 'ack':           await this._handleAck(ws, meta, msg); break;
      case 'reconnect':     await this._handleReconnect(ws, meta, msg); break;
      case 'presence_request': await this._handlePresenceRequest(ws, meta, msg); break;
      case 'request_history':  await this._handleHistoryRequest(ws, meta, msg); break;
      default:
        this._send(ws, { type: 'error', message: `Unknown message type: ${type}` });
    }
  }

  // ── Channel Management ───────────────────────────────────────────────────

  async _handleSubscribe(ws, meta, msg) {
    const { channel } = msg;
    if (!channel || typeof channel !== 'string') {
      this._send(ws, { type: 'error', message: 'Channel name required' });
      return;
    }

    // Permission check
    if (!this._hasChannelPermission(channel, meta.role)) {
      this._send(ws, { type: 'error', code: 'FORBIDDEN', message: `No access to channel: ${channel}` });
      return;
    }

    if (channel.includes('*')) {
      // Wildcard subscription
      this._addWildcardSubscription(channel, ws);
    } else {
      this._addSubscription(channel, ws);
    }

    this._send(ws, { type: 'subscribed', channel, timestamp: nowISO() });

    // Send presence list for the channel
    const present = this.getChannelPresence(channel);
    this._send(ws, { type: 'presence', channel, subscribers: present });
  }

  async _handleUnsubscribe(ws, meta, msg) {
    const { channel } = msg;
    if (!channel) return;

    const subs = this.channelSubscribers.get(channel);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) this.channelSubscribers.delete(channel);
    }
    this.channelWildcardMatchers.forEach(m => {
      if (m.pattern === channel) m.subscribers.delete(ws);
    });

    this._send(ws, { type: 'unsubscribed', channel, timestamp: nowISO() });
  }

  _addSubscription(channel, ws) {
    if (!this.channelSubscribers.has(channel)) {
      this.channelSubscribers.set(channel, new Set());
    }
    this.channelSubscribers.get(channel).add(ws);
  }

  _addWildcardSubscription(pattern, ws) {
    // Compile glob to regex: vehicle:* → vehicle:([^/]+)
    const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '([^/]+)') + '$';
    const existing = this.channelWildcardMatchers.find(m => m.pattern === pattern);
    if (existing) {
      existing.subscribers.add(ws);
      return;
    }
    this.channelWildcardMatchers.push({
      pattern,
      regex: new RegExp(regexStr),
      subscribers: new Set([ws]),
    });
  }

  _getMatchingSubscribers(channel) {
    const result = new Set();
    // Direct match
    const direct = this.channelSubscribers.get(channel);
    if (direct) direct.forEach(ws => result.add(ws));
    // Wildcard match
    for (const m of this.channelWildcardMatchers) {
      if (m.regex.test(channel)) m.subscribers.forEach(ws => result.add(ws));
    }
    return result;
  }

  getChannelPresence(channel) {
    const subscribers = this._getMatchingSubscribers(channel);
    return Array.from(subscribers).map(ws => {
      const meta = this.connections.get(ws);
      return meta ? { userId: meta.userId, userName: meta.userName, role: meta.role } : null;
    }).filter(Boolean);
  }

  _hasChannelPermission(channel, role) {
    for (const [pattern, allowed] of Object.entries(CHANNEL_PERMISSIONS)) {
      if (channel.startsWith(pattern.replace('*', ''))) {
        return allowed.includes(role);
      }
    }
    return true; // default allow if no rule
  }

  // ── Publishing ───────────────────────────────────────────────────────────

  async _handlePublish(ws, meta, msg) {
    const { channel, data, priority = 'telemetry', requiresAck = false, messageId } = msg;

    if (!channel || data === undefined) {
      this._send(ws, { type: 'error', message: 'Channel and data required' });
      return;
    }

    // Permission check
    if (!this._hasChannelPermission(channel, meta.role)) {
      this._send(ws, { type: 'error', code: 'FORBIDDEN', message: `No publish access to channel: ${channel}` });
      return;
    }

    const pubMsg = {
      id: messageId || generateId(),
      channel,
      data,
      priority: PRIORITY_LABELS.indexOf(priority) >= 0 ? priority : 'telemetry',
      priorityLevel: PRIORITY_LABELS.indexOf(priority) >= 0 ? PRIORITY_LABELS.indexOf(priority) : 2,
      publisher: { userId: meta.userId, userName: meta.userName },
      timestamp: nowISO(),
      requiresAck,
    };

    await this._broadcastToChannel(channel, pubMsg);

    // Persist to channel history
    this._addToChannelHistory(channel, pubMsg);

    // Ack request
    if (requiresAck) {
      this._send(ws, { type: 'publish_ack', messageId: pubMsg.id, timestamp: pubMsg.timestamp });
    }

    this.metrics.recordMessage('outbound', channel);
  }

  async _broadcastToChannel(channel, msg) {
    // Dedup
    if (msg.id && await this.deduplicator.isDuplicate(msg.id)) return;

    const subscribers = this._getMatchingSubscribers(channel);

    // Compress if large
    const payload = compressPayload(msg);
    const data = payload
      ? JSON.stringify({ compressed: true, data: payload.data, originalSize: payload.originalSize })
      : JSON.stringify(msg);

    for (const ws of subscribers) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      try {
        ws.send(data);
        this.metrics.recordMessage('delivered');
      } catch {
        // Message delivery failed – don't kill connection
        this.metrics.recordError('delivery_failed');
      }
    }
  }

  // ── Message Queue & Replay ──────────────────────────────────────────────

  queueMessage(clientId, channel, data, priority = 'telemetry') {
    // No-op: in-memory message queuing removed
  }

  async _replayQueuedMessages(ws, meta) {
    // No-op: in-memory message queuing removed
  }

  _addToChannelHistory(channel, msg) {
    // No-op: in-memory message history removed
  }

  // ── Message Acknowledgment ──────────────────────────────────────────────

  async _handleAck(ws, meta, msg) {
    const { messageId } = msg;
    if (!messageId) return;
    meta.pendingAck.delete(messageId);
    this.metrics.recordAck(messageId);
  }

  // ── Reconnection ────────────────────────────────────────────────────────

  async _handleReconnect(ws, meta, msg) {
    const { reconnectToken } = msg;
    if (!reconnectToken) {
      this._send(ws, { type: 'error', message: 'reconnectToken required' });
      return;
    }

    const payload = this._verifyReconnectToken(reconnectToken);
    if (!payload || payload.userId !== meta.userId) {
      this._send(ws, { type: 'error', code: 'INVALID_RECONNECT', message: 'Invalid reconnect token' });
      return;
    }

    // Restore channel subscriptions from token
    if (payload.channels) {
      for (const ch of payload.channels) {
        if (this._hasChannelPermission(ch, meta.role)) {
          this._addSubscription(ch, ws);
        }
      }
    }

    this._send(ws, { type: 'reconnected', timestamp: nowISO() });
    console.log(`[WS] Client reconnected: ${meta.connectionId}`);
  }

  _generateReconnectToken(meta) {
    const payload = {
      userId: meta.userId,
      tenantId: meta.tenantId,
      role: meta.role,
      connectionId: meta.connectionId,
      ts: Date.now(),
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  }

  _verifyReconnectToken(token) {
    try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
  }

  // ── Presence ────────────────────────────────────────────────────────────

  async _handlePresenceRequest(ws, meta, msg) {
    const { channel } = msg;
    if (!channel) {
      // Return all channels user is subscribed to
      const subscribedChannels = [];
      for (const [ch, subs] of this.channelSubscribers) {
        if (subs.has(ws)) subscribedChannels.push(ch);
      }
      this._send(ws, { type: 'presence_list', channels: subscribedChannels, timestamp: nowISO() });
      return;
    }
    const present = this.getChannelPresence(channel);
    this._send(ws, { type: 'presence', channel, subscribers: present, timestamp: nowISO() });
  }

  // ── History ─────────────────────────────────────────────────────────────

  async _handleHistoryRequest(ws, meta, msg) {
    const { channel } = msg;
    if (!channel) return;

    if (!this._hasChannelPermission(channel, meta.role)) {
      this._send(ws, { type: 'error', code: 'FORBIDDEN', message: `No access to channel: ${channel}` });
      return;
    }

    this._send(ws, { type: 'history', channel, messages: [], timestamp: nowISO() });
  }

  // ── Metrics ─────────────────────────────────────────────────────────────

  _startMetricsBroadcast() {
    this._metricsTimer = setInterval(() => this._publishMetrics(), 10_000);
  }

  _publishMetrics() {
    const snapshot = this.metrics.snapshot(
      this.connections.size,
      this.connectionsByTenant,
      this.channelSubscribers,
      this.channelWildcardMatchers
    );
    // Publish to monitoring channel
    const monitorChannel = 'system:metrics';
    this._addToChannelHistory(monitorChannel, { type: 'metrics', ...snapshot });
    this.metrics.resetWindow();
  }

  // ── Broadcast API (for external callers like MQTTBrokerSimulator) ───────

  broadcast(event, data, opts = {}) {
    const { tenantId, channel, priority = 'event', targetChannel } = opts;
    const target = targetChannel || channel || 'system:broadcast';

    const msg = {
      id: generateId(),
      type: 'broadcast',
      event,
      data,
      priority,
      priorityLevel: PRIORITY_LABELS.indexOf(priority) >= 0 ? PRIORITY_LABELS.indexOf(priority) : 1,
      timestamp: nowISO(),
    };

    if (tenantId) {
      // Tenant-scoped broadcast
      const tenantWs = this.connectionsByTenant.get(tenantId);
      if (!tenantWs) return;
      const payload = compressPayload(msg);
      const raw = payload
        ? JSON.stringify({ compressed: true, data: payload.data })
        : JSON.stringify(msg);
      for (const ws of tenantWs) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(raw); } catch {}
        }
      }
    } else {
      // Global broadcast to all matching subscribers
      this._broadcastToChannel(target, msg);
    }

    this._addToChannelHistory(target, msg);
    this.metrics.recordMessage('broadcast', target);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getConnectionCount() { return this.connections.size; }

  getTenantConnectionCount(tenantId) { return this.connectionsByTenant.get(tenantId)?.size || 0; }

  getChannelSubscribers(channel) {
    return Array.from(this._getMatchingSubscribers(channel)).map(ws => this.connections.get(ws)).filter(Boolean);
  }

  getSubscribedChannels() {
    return Array.from(this.channelSubscribers.keys());
  }

  // ── Internal Send ───────────────────────────────────────────────────────

  _send(ws, data) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(data));
    } catch {}
  }
}

// ── Metrics Collector ────────────────────────────────────────────────────────
class WSMetrics {
  constructor() {
    this.windowStart = Date.now();
    this._reset();
  }

  _reset() {
    this.connectionsCreated = 0;
    this.connectionsClosed = 0;
    this.messagesSent = 0;
    this.messagesDelivered = 0;
    this.messagesBroadcast = 0;
    this.errors = new Map();
    this.rejections = new Map();
    this.acks = 0;
    this.perTenant = new Map();
    this.perChannel = new Map();
  }

  resetWindow() {
    this._reset();
    this.windowStart = Date.now();
  }

  recordConnection(tenantId) {
    this.connectionsCreated++;
    this.perTenant.set(tenantId, (this.perTenant.get(tenantId) || 0) + 1);
  }

  recordDisconnection(tenantId) {
    this.connectionsClosed++;
  }

  recordMessage(kind, channel) {
    this.messagesSent++;
    if (kind === 'delivered') this.messagesDelivered++;
    if (kind === 'broadcast') this.messagesBroadcast++;
    if (channel) this.perChannel.set(channel, (this.perChannel.get(channel) || 0) + 1);
  }

  recordError(type) {
    this.errors.set(type, (this.errors.get(type) || 0) + 1);
  }

  recordRejection(type) {
    this.rejections.set(type, (this.rejections.get(type) || 0) + 1);
  }

  recordAck(messageId) { this.acks++; }

  snapshot(totalConnections, connectionsByTenant, channelSubscribers, wildcardMatchers) {
    const channelPresence = {};
    for (const [ch, subs] of channelSubscribers) {
      channelPresence[ch] = subs.size;
    }
    for (const wm of wildcardMatchers) {
      channelPresence[wm.pattern + ' (wildcard)'] = wm.subscribers.size;
    }

    return {
      timestamp: nowISO(),
      windowMs: Date.now() - this.windowStart,
      connections: {
        total: totalConnections,
        created: this.connectionsCreated,
        closed: this.connectionsClosed,
      },
      tenants: Object.fromEntries(connectionsByTenant instanceof Map
        ? Array.from(connectionsByTenant.entries()).map(([k, v]) => [k, v.size])
        : []
      ),
      messages: {
        sent: this.messagesSent,
        delivered: this.messagesDelivered,
        broadcast: this.messagesBroadcast,
        acks: this.acks,
      },
      channels: channelPresence,
      errors: Object.fromEntries(this.errors),
      rejections: Object.fromEntries(this.rejections),
      messageQueueSize: 0,
    };
  }
}

export { CONFIG, PRIORITY, CHANNEL_PERMISSIONS };
export default VigilWSServer;
