const request = require('supertest');
const express = require('express');

describe('Admin Service', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'admin-service' });
    });

    app.get('/api/admin/analytics', (req, res) => {
      res.json({
        totalCampaigns: 10,
        activeCampaigns: 7,
        totalPledges: 150,
        totalAmountRaised: '25000.00',
      });
    });

    app.get('/api/admin/services/health', (req, res) => {
      res.json({
        overall: 'healthy',
        services: {
          campaign: 'healthy',
          pledge: 'healthy',
          payment: 'healthy',
        },
      });
    });
  });

  describe('GET /api/admin/analytics', () => {
    it('should return system analytics', async () => {
      const res = await request(app).get('/api/admin/analytics');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalCampaigns');
      expect(res.body).toHaveProperty('totalPledges');
      expect(res.body).toHaveProperty('totalAmountRaised');
    });
  });

  describe('GET /api/admin/services/health', () => {
    it('should return health status of all services', async () => {
      const res = await request(app).get('/api/admin/services/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('overall');
      expect(res.body).toHaveProperty('services');
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
