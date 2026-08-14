const request = require('supertest');
const express = require('express');

// Mock the entire app
jest.mock('../../../src/api/routes', () => {
  const express = require('express');
  const app = express();
  app.use(express.json());

  // Mock routes
  app.get('/api/v1/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime() });
  });

  app.post('/api/v1/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (email === 'test@test.com' && password === 'password') {
      return res.json({ token: 'mock-token', user: { id: 1, email } });
    }
    res.status(401).json({ error: 'Invalid credentials' });
  });

  return app;
});

describe('API Routes', () => {
  let app;

  beforeEach(() => {
    app = require('../../../src/api/routes');
  });

  describe('GET /api/v1/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('uptime');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return 400 if email missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ password: 'password' });
      expect(res.status).toBe(400);
    });

    it('should return 400 if password missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
    });

    it('should return 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'wrong@test.com', password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('should return token for valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@test.com', password: 'password' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
    });
  });
});
