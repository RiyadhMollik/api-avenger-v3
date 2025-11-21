const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

describe('API Gateway', () => {
  let app;
  const JWT_SECRET = 'test-secret';

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock auth middleware
    const authMiddleware = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }
      try {
        const token = authHeader.replace('Bearer ', '');
        req.user = jwt.verify(token, JWT_SECRET);
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    };

    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'api-gateway' });
    });

    app.get('/api/campaigns', (req, res) => {
      res.json({ count: 0, rows: [] });
    });

    app.post('/api/pledges', authMiddleware, (req, res) => {
      res.status(201).json({ id: 'test-pledge', ...req.body });
    });
  });

  describe('Authentication Middleware', () => {
    it('should reject requests without token', async () => {
      const res = await request(app)
        .post('/api/pledges')
        .send({ amount: 100 });

      expect(res.status).toBe(401);
    });

    it('should accept requests with valid token', async () => {
      const token = jwt.sign({ id: 'user-123', role: 'USER' }, JWT_SECRET);
      
      const res = await request(app)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100 });

      expect(res.status).toBe(201);
    });

    it('should reject requests with invalid token', async () => {
      const res = await request(app)
        .post('/api/pledges')
        .set('Authorization', 'Bearer invalid-token')
        .send({ amount: 100 });

      expect(res.status).toBe(401);
    });
  });

  describe('Public Routes', () => {
    it('should allow access to campaigns without auth', async () => {
      const res = await request(app).get('/api/campaigns');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });
});
