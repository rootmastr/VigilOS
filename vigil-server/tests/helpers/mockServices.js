// Mock Redis
const createMockRedis = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  pipeline: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn(),
  on: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
});

// Mock InfluxDB
const createMockInfluxDB = () => ({
  getWriteApi: jest.fn().mockReturnValue({
    writePoint: jest.fn(),
    writePoints: jest.fn(),
    flush: jest.fn(),
    close: jest.fn(),
  }),
  getQueryApi: jest.fn().mockReturnValue({
    queryRows: jest.fn().mockResolvedValue([]),
  }),
});

// Mock MQTT Client
const createMockMQTTClient = () => ({
  publish: jest.fn().mockImplementation((topic, message, opts, callback) => {
    if (callback) callback();
  }),
  subscribe: jest.fn().mockImplementation((topic, opts, callback) => {
    if (callback) callback(null);
  }),
  unsubscribe: jest.fn().mockImplementation((topic, callback) => {
    if (callback) callback(null);
  }),
  end: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  connected: true,
});

// Mock WebSocket Server
const createMockWSServer = () => ({
  on: jest.fn(),
  clients: new Set(),
  broadcast: jest.fn(),
  broadcastToTenant: jest.fn(),
  sendToClient: jest.fn(),
  getConnectionCount: jest.fn().mockReturnValue(0),
  close: jest.fn(),
});

// Mock Notification Service
const createMockNotificationService = () => ({
  sendPushNotification: jest.fn().mockResolvedValue(true),
  sendEmail: jest.fn().mockResolvedValue(true),
  sendSMS: jest.fn().mockResolvedValue(true),
  sendBulkNotifications: jest.fn().mockResolvedValue([]),
});

// Mock Cache Service
const createMockCacheService = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
  invalidate: jest.fn().mockResolvedValue(true),
  invalidatePattern: jest.fn().mockResolvedValue(0),
  getOrSet: jest.fn().mockImplementation((key, fetchFn) => fetchFn()),
});

// Mock Metrics Service
const createMockMetricsService = () => ({
  trackRequest: jest.fn(),
  trackWebSocketConnection: jest.fn(),
  trackMqttConnection: jest.fn(),
  trackCacheOperation: jest.fn(),
  trackDatabaseQuery: jest.fn(),
  trackBusinessMetric: jest.fn(),
  getMetrics: jest.fn().mockReturnValue({
    requests: { total: 0, errors: 0 },
    websocket: { connections: 0 },
    cache: { hits: 0, misses: 0 },
  }),
  getHealthStatus: jest.fn().mockReturnValue({
    status: 'healthy',
    uptime: 1000,
    memory: { used: 100, total: 500 },
  }),
});

module.exports = {
  createMockRedis,
  createMockInfluxDB,
  createMockMQTTClient,
  createMockWSServer,
  createMockNotificationService,
  createMockCacheService,
  createMockMetricsService,
};
