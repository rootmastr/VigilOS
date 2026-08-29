/**
 * VigilOS Enterprise Backend & IoT Data Pipeline Server
 * Express REST API Gateway + Socket.io WebSockets + MQTT Stream Processor
 * 
 * V3.0.0 — Multi-Tenant SaaS Platform
 */

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

import { postgresDB } from './database/postgresAdapter.js';
import { SpeedEvaluator } from './stream/speedEvaluator.js';
import { MQTTBrokerSimulator } from './mqtt/brokerSimulator.js';
import apiRouter from './api/routes/index.js';
import { setMqttBroker as setFleetMqttBroker } from './api/routes/fleet.js';
import { setMqttBroker as setTokenMqttBroker } from './api/routes/tokens.js';
import { setMqttBroker as setTelemetryMqttBroker } from './api/routes/telemetry.js';
import { redisClient } from './cache/redisClient.js';
import { cacheAllActiveTokens } from './cache/cacheService.js';
import { securityHeaders, sanitizeRequest, ddosProtection, auditLogger, flushAllDdosBlocks } from './security/securityMiddleware.js';
import { VigilWSServer } from './websocket/server.js';
import { db } from './services/databaseService.js';
import cronService from './cron/index.js';

const PORT = process.env.PORT || 4000;
const app = express();
const server = http.createServer(app);

// ═══════════════════════════════════════════════════════════════════════════════
// CORS — Must be loaded BEFORE security middleware so preflight OPTIONS works
// ═══════════════════════════════════════════════════════════════════════════════

const corsOriginEnv = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS;
const corsOrigin = corsOriginEnv
  ? corsOriginEnv.split(',').map(s => s.trim())
  : true;

const isDev = process.env.NODE_ENV !== 'production';

function isPrivateIP(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || !parts.every(p => /^\d{1,3}$/.test(p))) return true;
  const octets = parts.map(Number);
  if (octets.some(o => o < 0 || o > 255)) return true;
  const [a, b] = octets;
  if (a === 0 || a === 127 || a === 169 && b === 254) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (corsOrigin === true) return true;
  if (corsOrigin.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (!isPrivateIP(url.hostname)) return true;
  } catch {}
  return false;
}

app.use(cors({
  origin: isDev
    ? true
    : (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Tenant-ID'],
}));

// Handle OPTIONS preflight explicitly before any security middleware
app.options('*', cors({
  origin: isDev
    ? true
    : (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
  credentials: true,
}));

app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE STACK
// ═══════════════════════════════════════════════════════════════════════════════

app.use(securityHeaders);
app.use(sanitizeRequest);
app.use(ddosProtection);
app.use(auditLogger);

// ═══════════════════════════════════════════════════════════════════════════════
// WEBSOCKET SERVERS
// ═══════════════════════════════════════════════════════════════════════════════

// Socket.io Real-time WebSocket Server (legacy)
const io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Production WebSocket Server (ws-based, channel pub/sub, per-tenant isolation)
const wsServer = new VigilWSServer(server);

// Helper to broadcast socket events to all connected command center clients
const socketBroadcast = (event, data) => {
  // Socket.io (legacy)
  io.emit(event, data);

  // Production WS: publish to appropriate channel
  const channelMap = {
    telemetry_update: 'telemetry:*',
    emergency_alert: 'emergency:*',
    emergency_queue_update: 'emergency:*',
    incident_acknowledged: 'incident:*',
    incident_resolved: 'incident:*',
    vehicle_status_changed: 'vehicle:*',
    vehicle_added: 'vehicle:*',
    vehicle_updated: 'vehicle:*',
    vehicle_deleted: 'vehicle:*',
    officer_status_changed: 'presence:*',
    security_event: 'admin:security',
    control_signal: 'system:control',
    token_updated: 'admin:tokens',
    driver_added: 'system:drivers',
    driver_updated: 'system:drivers',
    driver_deleted: 'system:drivers',
  };

  const channel = channelMap[event] || 'system:broadcast';
  wsServer.broadcast(event, data, {
    channel,
    priority: event === 'emergency_alert' ? 'alert' : 'event',
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZE SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

// Initialize Speed Anomaly Stream Processor
const speedEvaluator = new SpeedEvaluator((controlSignal) => {
  mqttBroker.publishControlCommand(controlSignal);
});

// Initialize MQTT Broker & Telemetry Ingestion Simulator
const mqttBroker = new MQTTBrokerSimulator(speedEvaluator, socketBroadcast);

// Inject broker into route modules
setFleetMqttBroker(mqttBroker);
setTokenMqttBroker(mqttBroker);
setTelemetryMqttBroker(mqttBroker);

// ═══════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Mount API router
app.use('/api/v1', apiRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// SOCKET.IO EVENT HANDLERS (Legacy)
// ═══════════════════════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`[Socket.io] Command Center Client connected: ${socket.id}`);

  // Send initial state snapshot on connection — read from PostgreSQL (persistent)
  const emitInitialState = async () => {
    try {
      const [vehicles, drivers, officers, securityEvents, incidents] = await Promise.all([
        db.listVehicles({ take: 200 }),
        db.listDrivers({ take: 200 }),
        db.listOfficers({ take: 200 }),
        db.listSecurityEvents({ take: 200 }),
        db.listIncidents({ take: 200 }),
      ]);
      const deviceTokens = await postgresDB.getDeviceTokens();
      socket.emit('initial_state', {
        vehicles, drivers, officers, deviceTokens, securityEvents, incidents,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Socket.io] Failed to load initial state from DB:', err.message);
      socket.emit('initial_state', {
        vehicles: [],
        drivers: [],
        officers: [],
        deviceTokens: [],
        securityEvents: [],
        incidents: [],
        timestamp: new Date().toISOString(),
      });
    }
  };
  emitInitialState();

  // Client-triggered actions
  socket.on('acknowledge_incident', async (data) => {
    const updated = await postgresDB.acknowledgeIncident(data.incidentId, data.operatorId);
    if (updated) {
      io.emit('incident_acknowledged', updated);
    }
  });

  socket.on('resolve_incident', async (data) => {
    const updated = await postgresDB.resolveIncident(data.incidentId, data.operatorId, data.fieldReport);
    if (updated) {
      io.emit('incident_resolved', updated);
      const vehicle = await postgresDB.getVehicleById(updated.vehicleId);
      io.emit('vehicle_status_changed', vehicle);
    }
  });

  socket.on('update_officer_status', async (data) => {
    const updated = await postgresDB.updateOfficerDutyStatus(data.officerId, data.dutyStatus);
    if (updated) {
      io.emit('officer_status_changed', updated);
    }
  });

  socket.on('trigger_panic_button', (data) => {
    mqttBroker.handleEmergencyPublish(data.vehicleId || 'BUS-101', data.details);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════════

// Initialize Prisma database connection and start pipeline
db.connect().then(async () => {
  // Start Ingestion Pipeline
  mqttBroker.startIngestionPipeline();

  // Redis Startup Sequence
  redisClient.connect().then(async () => {
    // Flush any stale DDoS blocks from previous sessions
    await flushAllDdosBlocks().catch(() => {});
    await cacheAllActiveTokens();

    // Periodic presence check: mark vehicles idle after 30s of no telemetry
    setInterval(async () => {
      try {
        const onlineIds = await redisClient.scanKeys('device:presence:*');
        const onlineSet = new Set(onlineIds.map(k => k.replace('device:presence:', '')));
        const vehicles = await postgresDB.getVehicles();
        for (const v of vehicles) {
          const wasOnline = v.status === 'online';
          const isNowOnline = onlineSet.has(v.id);
          if (wasOnline && !isNowOnline) {
            await postgresDB.updateVehicleStatus(v.id, 'idle', v.heartBeatIntervalSec || 10);
            socketBroadcast('vehicle_status_changed', { ...v, status: 'idle' });
          }
        }
      } catch (_) {}
    }, 15000);
  });

  // Initialize Cron Jobs
  cronService.initCronJobs();
}).catch(err => {
  console.error('[DB] Prisma connection failed:', err.message);
  // Start without DB — in-memory only
  mqttBroker.startIngestionPipeline();
});

// Start HTTP Server
server.listen(PORT, () => {
  console.log(`
===============================================================
 🚀 VigilOS Enterprise Backend & IoT Pipeline Server Running!
 🌐 HTTP API Gateway: http://localhost:${PORT}/api/v1
 📡 WebSocket Server: ws://localhost:${PORT}/ws
 📡 Socket.io Server (legacy): ws://localhost:${PORT}
 🛰️  MQTT Broker Ingestion: fleet/{device_id}/telemetry & emergency
 🔴 Redis Cache: device:token | device:presence | device:state | ratelimit
 🗄️  PostgreSQL: Multi-tenant with row-level security
===============================================================
  `);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════════════════════

const shutdown = async () => {
  console.log('\n[Server] Shutting down...');

  mqttBroker.stop();
  wsServer.close();

  try {
    await redisClient.quit();
  } catch (_) {}

  try {
    await db.disconnect();
  } catch (_) {}

  server.closeAllConnections();
  server.close(() => {
    console.log('[Server] Closed.');
    process.exit(0);
  });

  // Force exit after 3s if still hanging
  setTimeout(() => process.exit(1), 3000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
