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
import { securityHeaders, sanitizeRequest, ddosProtection, auditLogger } from './security/securityMiddleware.js';
import { VigilWSServer } from './websocket/server.js';
import { db } from './services/databaseService.js';
import cronService from './cron/index.js';

const PORT = process.env.PORT || 4000;
const app = express();
const server = http.createServer(app);

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE STACK
// ═══════════════════════════════════════════════════════════════════════════════

app.use(securityHeaders);
app.use(sanitizeRequest);
app.use(ddosProtection);
app.use(auditLogger);

// ═══════════════════════════════════════════════════════════════════════════════
// CORE MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

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

  // Send initial state snapshot on connection — read from in-memory store (has live coordinates)
  const emitInitialState = async () => {
    try {
      const [drivers, officers, securityEvents, incidents] = await Promise.all([
        db.listDrivers({ take: 200 }),
        db.listOfficers({ take: 200 }),
        db.listSecurityEvents({ take: 200 }),
        db.listIncidents({ take: 200 }),
      ]);
      // Use in-memory postgresDB for vehicles (has live telemetry coordinates)
      // and deviceTokens (tokens generated via API are stored here)
      const vehicles = postgresDB.getVehicles();
      const deviceTokens = postgresDB.getDeviceTokens();
      socket.emit('initial_state', {
        vehicles, drivers, officers, deviceTokens, securityEvents, incidents,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Socket.io] Failed to load initial state from DB:', err.message);
      // Fallback to in-memory store
      socket.emit('initial_state', {
        vehicles: postgresDB.getVehicles(),
        drivers: postgresDB.getDrivers(),
        officers: postgresDB.getOfficers(),
        deviceTokens: postgresDB.getDeviceTokens(),
        securityEvents: postgresDB.getSecurityEvents(),
        incidents: postgresDB.getIncidents(),
        timestamp: new Date().toISOString(),
      });
    }
  };
  emitInitialState();

  // Client-triggered actions
  socket.on('acknowledge_incident', (data) => {
    const updated = postgresDB.acknowledgeIncident(data.incidentId, data.operatorId);
    if (updated) {
      io.emit('incident_acknowledged', updated);
    }
  });

  socket.on('resolve_incident', (data) => {
    const updated = postgresDB.resolveIncident(data.incidentId, data.operatorId, data.fieldReport);
    if (updated) {
      io.emit('incident_resolved', updated);
      io.emit('vehicle_status_changed', postgresDB.getVehicleById(updated.vehicleId));
    }
  });

  socket.on('update_officer_status', (data) => {
    const updated = postgresDB.updateOfficerDutyStatus(data.officerId, data.dutyStatus);
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

// Initialize Prisma database connection, then sync to in-memory store and start pipeline
db.connect().then(async () => {
  // Load vehicles from Prisma into in-memory store for MQTT simulator
  try {
    const vehicles = await db.listVehicles({ take: 200 });
    postgresDB.vehicles = vehicles;
    console.log(`[DB] Synced ${vehicles.length} vehicles from PostgreSQL to in-memory store`);
  } catch (err) {
    console.error('[DB] Failed to sync vehicles:', err.message);
  }

  // Load device tokens from Prisma into in-memory store
  try {
    const tokens = await db.listDeviceTokens({ take: 500 });
    postgresDB.deviceTokens = tokens.map(t => ({
      id: t.id,
      token: t.tokenHash,
      deviceId: t.deviceId,
      tenantId: t.tenantId,
      status: t.status,
      createdAt: t.createdAt?.toISOString?.() || t.createdAt,
      expiresAt: t.expiresAt?.toISOString?.() || t.expiresAt,
      lastUsedAt: t.lastUsedAt?.toISOString?.() || t.lastUsedAt,
    }));
    console.log(`[DB] Synced ${tokens.length} device tokens from PostgreSQL to in-memory store`);
  } catch (err) {
    console.error('[DB] Failed to sync device tokens:', err.message);
  }

  // Start Ingestion Pipeline (reads from in-memory store)
  mqttBroker.startIngestionPipeline();

  // Redis Startup Sequence
  redisClient.connect().then(async () => {
    await cacheAllActiveTokens();
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
