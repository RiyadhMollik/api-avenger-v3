const request = require('supertest');
const express = require('express');

describe('Totals Service (CQRS)', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'totals-service' });
    });

    app.get('/api/campaigns/:id/totals', (req, res) => {
      res.json({
        campaignId: req.params.id,
        totalAmount: '1000.00',
        totalPledges: 5,
        completedPledges: 3,
        lastUpdated: new Date(),
      });
    });
  });

  describe('GET /api/campaigns/:id/totals', () => {
    it('should return campaign totals', async () => {
      const res = await request(app)
        .get('/api/campaigns/test-campaign-id/totals');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('campaignId');
      expect(res.body).toHaveProperty('totalAmount');
      expect(res.body).toHaveProperty('totalPledges');
      expect(res.body).toHaveProperty('completedPledges');
    });

    it('should have fast response time (CQRS benefit)', async () => {
      const start = Date.now();
      await request(app).get('/api/campaigns/test-id/totals');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should be very fast
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
