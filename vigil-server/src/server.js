/**
 * VigilOS Enterprise Backend & IoT Data Pipeline Server
 * Express REST API Gateway + Socket.io WebSockets + MQTT Stream Processor
 */

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

import { postgresDB } from './database/postgresAdapter.js';
import { SpeedEvaluator } from './stream/speedEvaluator.js';
import { MQTTBrokerSimulator } from './mqtt/brokerSimulator.js';
import { createAPIRouter } from './api/routes.js';
import { redisClient } from './cache/redisClient.js';
import { cacheAllActiveTokens } from './cache/cacheService.js';
import { securityStack, securityHeaders, sanitizeRequest, ddosProtection, auditLogger } from './security/securityMiddleware.js';
import { VigilWSServer } from './websocket/server.js';

const PORT = process.env.PORT || 4000;
const app = express();
const server = http.createServer(app);

// Security Middleware Stack
app.use(securityHeaders);
app.use(sanitizeRequest);
app.use(ddosProtection);
app.use(auditLogger);

// Core Middleware
app.use(cors());
app.use(express.json());

// Socket.io Real-time WebSocket Server setup (legacy)
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
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
  wsServer.broadcast(event, data, { channel, priority: event === 'emergency_alert' ? 'alert' : 'event' });
};

// Initialize Speed Anomaly Stream Processor
const speedEvaluator = new SpeedEvaluator((controlSignal) => {
  mqttBroker.publishControlCommand(controlSignal);
});

// Initialize MQTT Broker & Telemetry Ingestion Simulator
const mqttBroker = new MQTTBrokerSimulator(speedEvaluator, socketBroadcast);

// API Gateway Router
app.use('/api/v1', createAPIRouter(mqttBroker));

// Socket.io Connection & Event Handling
io.on('connection', (socket) => {
  console.log(`[Socket.io] Command Center Client connected: ${socket.id}`);

  // Send initial state snapshot on connection
  socket.emit('initial_state', {
    vehicles: postgresDB.getVehicles(),
    drivers: postgresDB.getDrivers(),
    officers: postgresDB.getOfficers(),
    deviceTokens: postgresDB.getDeviceTokens(),
    securityEvents: postgresDB.getSecurityEvents(),
    incidents: postgresDB.getIncidents(),
    timestamp: new Date().toISOString()
  });

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

// Start Ingestion Pipeline
mqttBroker.startIngestionPipeline();

// ── Redis Startup Sequence ─────────────────────────────────────────────────
// Connect to Redis then seed the device token cache.
// If Redis is unavailable the server continues in degraded mode
// (all cache operations fall back to Postgres automatically).
redisClient.connect().then(async () => {
  await cacheAllActiveTokens();
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
===============================================================
  `);
});

// ── Graceful Shutdown ──────────────────────────────────────────────────────
const shutdown = async () => {
  console.log('\n[Server] Shutting down...');
  mqttBroker.stop();
  wsServer.close();
  try { await redisClient.quit(); } catch (_) {}
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
