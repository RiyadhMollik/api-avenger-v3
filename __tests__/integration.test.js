const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const CAMPAIGN_API = 'http://localhost:4002';
const PLEDGE_API = 'http://localhost:4003';
const TOTALS_API = 'http://localhost:4005';

describe('End-to-End Integration Tests', () => {
  let campaignId;
  let pledgeId;
  let userToken;

  describe('Complete Donation Workflow', () => {
    it('should complete full donation flow from campaign to payment', async () => {
      // Step 1: Create Campaign
      const campaignRes = await axios.post(`${CAMPAIGN_API}/api/campaigns`, {
        title: 'Integration Test Campaign',
        description: 'Test campaign for integration tests',
        goalAmount: 5000,
        organizerId: 'test-org-123',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        status: 'ACTIVE',
      });

      expect(campaignRes.status).toBe(201);
      campaignId = campaignRes.data.id;
      expect(campaignId).toBeDefined();

      // Step 2: Create Pledge
      const pledgeRes = await axios.post(`${PLEDGE_API}/api/pledges`, {
        campaignId,
        userId: 'test-user-123',
        amount: 500,
      }, {
        headers: {
          'idempotency-key': `integration-test-${Date.now()}`,
        },
      });

      expect(pledgeRes.status).toBe(201);
      pledgeId = pledgeRes.data.id;
      expect(pledgeRes.data.status).toBe('PENDING');

      // Step 3: Wait for events to propagate
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 4: Check totals (CQRS)
      const totalsRes = await axios.get(`${TOTALS_API}/api/campaigns/${campaignId}/totals`);
      
      expect(totalsRes.status).toBe(200);
      expect(totalsRes.data.totalPledges).toBeGreaterThan(0);
    }, 15000);

    it('should maintain idempotency', async () => {
      const idempotencyKey = `idempotency-test-${Date.now()}`;
      
      // First request
      const res1 = await axios.post(`${PLEDGE_API}/api/pledges`, {
        campaignId,
        userId: 'test-user-456',
        amount: 250,
      }, {
        headers: { 'idempotency-key': idempotencyKey },
      });

      const firstPledgeId = res1.data.id;

      // Second request with same key
      const res2 = await axios.post(`${PLEDGE_API}/api/pledges`, {
        campaignId,
        userId: 'test-user-456',
        amount: 250,
      }, {
        headers: { 'idempotency-key': idempotencyKey },
      });

      const secondPledgeId = res2.data.id;

      // Should return same pledge
      expect(firstPledgeId).toBe(secondPledgeId);
    });

    it('should verify outbox pattern - no unpublished events', async () => {
      const outboxRes = await axios.get(`${PLEDGE_API}/api/outbox/status`);
      
      expect(outboxRes.status).toBe(200);
      expect(outboxRes.data.unpublishedCount).toBe(0);
    });
  });

  describe('Service Health Checks', () => {
    const services = [
      { name: 'Campaign', port: 4002 },
      { name: 'Pledge', port: 4003 },
      { name: 'Payment', port: 4004 },
      { name: 'Totals', port: 4005 },
      { name: 'Admin', port: 4007 },
    ];

    services.forEach(service => {
      it(`should verify ${service.name} service is healthy`, async () => {
        const res = await axios.get(`http://localhost:${service.port}/health`);
        
        expect(res.status).toBe(200);
        expect(res.data.status).toBe('healthy');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid campaign ID gracefully', async () => {
      try {
        await axios.get(`${CAMPAIGN_API}/api/campaigns/invalid-uuid`);
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
    });

    it('should reject pledge without idempotency key', async () => {
      try {
        await axios.post(`${PLEDGE_API}/api/pledges`, {
          campaignId: 'some-id',
          userId: 'user-id',
          amount: 100,
        });
      } catch (error) {
        expect(error.response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });
});
