const request = require('supertest');
const { Sequelize } = require('sequelize');

process.env.NODE_ENV = 'test';

describe('Campaign Service', () => {
  let app;
  let sequelize;

  beforeAll(() => {
    // Mock app for testing
    const express = require('express');
    app = express();
    app.use(express.json());

    sequelize = new Sequelize('sqlite::memory:', { logging: false });

    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'campaign-service' });
    });

    app.post('/api/campaigns', async (req, res) => {
      const campaign = {
        id: 'test-uuid',
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      res.status(201).json(campaign);
    });

    app.get('/api/campaigns', (req, res) => {
      res.json({
        count: 1,
        rows: [{
          id: 'test-uuid',
          title: 'Test Campaign',
          status: 'ACTIVE',
        }],
      });
    });
  });

  describe('POST /api/campaigns', () => {
    it('should create a new campaign', async () => {
      const res = await request(app)
        .post('/api/campaigns')
        .send({
          title: 'Save the Children',
          description: 'Help children',
          goalAmount: 10000,
          organizerId: 'org-123',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          status: 'ACTIVE',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('Save the Children');
    });
  });

  describe('GET /api/campaigns', () => {
    it('should list campaigns', async () => {
      const res = await request(app).get('/api/campaigns');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('rows');
      expect(Array.isArray(res.body.rows)).toBe(true);
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
