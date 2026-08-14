const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Generate test JWT token
const generateToken = (payload = {}) => {
  const defaultPayload = {
    userId: 'usr-test-001',
    tenantId: 'ws-semarang-01',
    role: 'DISPATCHER',
    email: 'test@semarang.go.id',
  };
  
  return jwt.sign({ ...defaultPayload, ...payload }, JWT_SECRET, {
    expiresIn: '1h',
  });
};

// Generate expired token
const generateExpiredToken = (payload = {}) => {
  const defaultPayload = {
    userId: 'usr-test-001',
    tenantId: 'ws-semarang-01',
    role: 'DISPATCHER',
  };
  
  return jwt.sign({ ...defaultPayload, ...payload }, JWT_SECRET, {
    expiresIn: '-1h', // Already expired
  });
};

// Mock user data
const mockUser = {
  id: 'usr-test-001',
  tenantId: 'ws-semarang-01',
  email: 'test@semarang.go.id',
  name: 'Test User',
  role: 'DISPATCHER',
  status: 'ACTIVE',
};

// Mock vehicle data
const mockVehicle = {
  id: 'veh-test-001',
  tenantId: 'ws-semarang-01',
  code: 'TS-101',
  name: 'Test Vehicle',
  type: 'BUS',
  lat: -6.9567,
  lng: 110.4383,
  heading: 45,
  speed: 32.5,
  status: 'ACTIVE',
};

// Mock incident data
const mockIncident = {
  id: 'inc-test-001',
  tenantId: 'ws-semarang-01',
  vehicleId: 'veh-test-001',
  officerId: 'usr-test-001',
  type: 'PANIC_BUTTON',
  severity: 'CRITICAL',
  lat: -6.9567,
  lng: 110.4383,
  description: 'Test incident',
  status: 'OPEN',
};

// Mock station data
const mockStation = {
  id: 'stn-test-001',
  name: 'Terminal Terboyo',
  lat: -6.9567,
  lng: 110.4383,
  routes: ['RUTE-001'],
};

// Create mock request
const mockRequest = (overrides = {}) => ({
  body: {},
  query: {},
  params: {},
  headers: {
    authorization: `Bearer ${generateToken()}`,
    'content-type': 'application/json',
  },
  user: mockUser,
  tenantId: 'ws-semarang-01',
  ...overrides,
});

// Create mock response
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

// Create mock next function
const mockNext = jest.fn();

// Wait for async operations
const waitFor = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Generate random coordinates within bounds
const randomCoordinates = (baseLat, baseLng, radiusKm = 1) => {
  const lat = baseLat + (Math.random() - 0.5) * (radiusKm / 111);
  const lng = baseLng + (Math.random() - 0.5) * (radiusKm / (111 * Math.cos(baseLat * Math.PI / 180)));
  return { lat, lng };
};

// Generate random vehicle code
const randomVehicleCode = (prefix = 'TS') => {
  const num = Math.floor(Math.random() * 1000);
  return `${prefix}-${num.toString().padStart(3, '0')}`;
};

module.exports = {
  generateToken,
  generateExpiredToken,
  mockUser,
  mockVehicle,
  mockIncident,
  mockStation,
  mockRequest,
  mockResponse,
  mockNext,
  waitFor,
  randomCoordinates,
  randomVehicleCode,
  JWT_SECRET,
};
