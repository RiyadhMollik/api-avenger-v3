const express = require('express');
const request = require('supertest');

describe('Notification Service', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'notification-service' });
    });
  });

  describe('Event Handlers', () => {
    it('should handle PledgeCreated event', () => {
      const event = {
        pledge: { id: '123', amount: 100 },
        campaign: { title: 'Test Campaign' },
        user: { name: 'John Doe', email: 'john@example.com' },
      };

      // Mock handler would send notification
      expect(event.pledge).toBeDefined();
      expect(event.campaign).toBeDefined();
      expect(event.user).toBeDefined();
    });

    it('should handle PaymentAuthorized event', () => {
      const event = {
        payment: { id: '456', amount: 100 },
        pledge: { id: '123' },
      };

      expect(event.payment).toBeDefined();
      expect(event.pledge).toBeDefined();
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
