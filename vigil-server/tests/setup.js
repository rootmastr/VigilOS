// Test setup file for VigilOS

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'vigil_test';
process.env.REDIS_URL = 'redis://localhost:6379';

// Global test timeout
jest.setTimeout(10000);

// Suppress console logs during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    keys: jest.fn(),
    pipeline: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn(),
    on: jest.fn()
  }));
});

// Mock InfluxDB
jest.mock('@influxdata/influxdb-client', () => ({
  InfluxDB: jest.fn().mockImplementation(() => ({
    getWriteApi: jest.fn(),
    getQueryApi: jest.fn()
  })),
  Point: jest.fn().mockImplementation(() => ({
    tag: jest.fn().mockReturnThis(),
    floatField: jest.fn().mockReturnThis(),
    intField: jest.fn().mockReturnThis(),
    stringField: jest.fn().mockReturnThis(),
    timestamp: jest.fn().mockReturnThis()
  }))
}));
