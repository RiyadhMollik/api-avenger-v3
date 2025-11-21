const express = require('express');
const axios = require('axios');
const winston = require('winston');
const promClient = require('prom-client');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 4007;

app.use(cors());
app.use(express.json());

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'admin-service' },
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const services = {
  campaign: process.env.CAMPAIGN_SERVICE_URL || 'http://localhost:4002',
  pledge: process.env.PLEDGE_SERVICE_URL || 'http://localhost:4003',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004',
  totals: process.env.TOTALS_SERVICE_URL || 'http://localhost:4005',
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
};

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'admin-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/api/admin/campaigns', async (req, res, next) => {
  try {
    const [campaigns, totalsData] = await Promise.all([
      axios.get(`${services.campaign}/api/campaigns`),
      Promise.resolve([]), // We'll fetch totals individually
    ]);

    const campaignsWithTotals = await Promise.all(
      campaigns.data.rows.map(async (campaign) => {
        try {
          const totals = await axios.get(`${services.totals}/api/campaigns/${campaign.id}/totals`);
          return { ...campaign, totals: totals.data };
        } catch (error) {
          return { ...campaign, totals: null };
        }
      })
    );

    res.json({
      count: campaigns.data.count,
      campaigns: campaignsWithTotals,
    });
  } catch (error) {
    logger.error('Error fetching campaigns', error);
    next(error);
  }
});

app.get('/api/admin/campaigns/:id', async (req, res, next) => {
  try {
    const [campaign, totals, pledges] = await Promise.all([
      axios.get(`${services.campaign}/api/campaigns/${req.params.id}`),
      axios.get(`${services.totals}/api/campaigns/${req.params.id}/totals`).catch(() => null),
      axios.get(`${services.pledge}/api/campaigns/${req.params.id}/pledges`).catch(() => ({ data: [] })),
    ]);

    res.json({
      ...campaign.data,
      totals: totals?.data || null,
      pledges: pledges.data,
    });
  } catch (error) {
    logger.error('Error fetching campaign details', error);
    next(error);
  }
});

app.get('/api/admin/analytics', async (req, res, next) => {
  try {
    const campaigns = await axios.get(`${services.campaign}/api/campaigns?limit=1000`);
    
    const stats = {
      totalCampaigns: campaigns.data.count,
      activeCampaigns: campaigns.data.rows.filter(c => c.status === 'ACTIVE').length,
      completedCampaigns: campaigns.data.rows.filter(c => c.status === 'COMPLETED').length,
      draftCampaigns: campaigns.data.rows.filter(c => c.status === 'DRAFT').length,
    };

    const totalsPromises = campaigns.data.rows.map(campaign =>
      axios.get(`${services.totals}/api/campaigns/${campaign.id}/totals`).catch(() => null)
    );
    
    const totalsResults = await Promise.all(totalsPromises);
    
    let totalPledges = 0;
    let totalAmount = 0;
    
    totalsResults.forEach(result => {
      if (result?.data) {
        totalPledges += result.data.totalPledges || 0;
        totalAmount += parseFloat(result.data.totalAmount || 0);
      }
    });

    stats.totalPledges = totalPledges;
    stats.totalAmountRaised = totalAmount.toFixed(2);
    stats.averagePledgeAmount = totalPledges > 0 ? (totalAmount / totalPledges).toFixed(2) : 0;

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching analytics', error);
    next(error);
  }
});

app.post('/api/admin/campaigns/:id/approve', async (req, res, next) => {
  try {
    const campaign = await axios.put(
      `${services.campaign}/api/campaigns/${req.params.id}`,
      { status: 'ACTIVE' }
    );

    logger.info('Campaign approved', { campaignId: req.params.id });
    res.json(campaign.data);
  } catch (error) {
    logger.error('Error approving campaign', error);
    next(error);
  }
});

app.post('/api/admin/campaigns/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    
    const campaign = await axios.put(
      `${services.campaign}/api/campaigns/${req.params.id}`,
      { status: 'CANCELLED' }
    );

    logger.info('Campaign rejected', { campaignId: req.params.id, reason });
    res.json(campaign.data);
  } catch (error) {
    logger.error('Error rejecting campaign', error);
    next(error);
  }
});

app.get('/api/admin/pledges', async (req, res, next) => {
  try {
    const { status, limit = 100 } = req.query;
    
    // This would need a dedicated endpoint in pledge service
    // For now, return a simple response
    res.json({
      message: 'Pledge listing endpoint - needs implementation in pledge service',
      params: { status, limit },
    });
  } catch (error) {
    logger.error('Error fetching pledges', error);
    next(error);
  }
});

app.get('/api/admin/services/health', async (req, res, next) => {
  try {
    const healthChecks = await Promise.allSettled([
      axios.get(`${services.campaign}/health`),
      axios.get(`${services.pledge}/health`),
      axios.get(`${services.payment}/health`),
      axios.get(`${services.totals}/health`),
      axios.get(`${services.auth}/health`),
    ]);

    const status = {
      campaign: healthChecks[0].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      pledge: healthChecks[1].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      payment: healthChecks[2].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      totals: healthChecks[3].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      auth: healthChecks[4].status === 'fulfilled' ? 'healthy' : 'unhealthy',
    };

    const allHealthy = Object.values(status).every(s => s === 'healthy');

    res.status(allHealthy ? 200 : 503).json({
      overall: allHealthy ? 'healthy' : 'degraded',
      services: status,
    });
  } catch (error) {
    logger.error('Error checking service health', error);
    next(error);
  }
});

// ========== USER MANAGEMENT ENDPOINTS ==========

app.get('/api/admin/users', async (req, res, next) => {
  try {
    const { search, role, page = 1, limit = 10 } = req.query;
    
    const response = await axios.get(`${services.auth}/api/users`, {
      params: { search, role, page, limit }
    });

    logger.info('Fetched users', { count: response.data.count, page, limit });
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching users', error);
    next(error);
  }
});

app.get('/api/admin/users/:id', async (req, res, next) => {
  try {
    const response = await axios.get(`${services.auth}/api/users/${req.params.id}`);
    
    logger.info('Fetched user details', { userId: req.params.id });
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching user details', error);
    next(error);
  }
});

app.post('/api/admin/users', async (req, res, next) => {
  try {
    const response = await axios.post(`${services.auth}/api/admin/users`, req.body);
    
    logger.info('Created new user', { userId: response.data.id, email: response.data.email });
    res.status(201).json(response.data);
  } catch (error) {
    logger.error('Error creating user', error);
    next(error);
  }
});

app.put('/api/admin/users/:id', async (req, res, next) => {
  try {
    const response = await axios.put(`${services.auth}/api/admin/users/${req.params.id}`, req.body);
    
    logger.info('Updated user', { userId: req.params.id });
    res.json(response.data);
  } catch (error) {
    logger.error('Error updating user', error);
    next(error);
  }
});

app.delete('/api/admin/users/:id', async (req, res, next) => {
  try {
    await axios.delete(`${services.auth}/api/admin/users/${req.params.id}`);
    
    logger.info('Deleted user', { userId: req.params.id });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user', error);
    next(error);
  }
});

// ========== BALANCE MANAGEMENT ENDPOINTS ==========

app.post('/api/admin/balance/add', async (req, res, next) => {
  try {
    const { userId, amount, reason } = req.body;
    
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid userId or amount' });
    }

    const response = await axios.post(`${services.payment}/api/admin/balance/add`, {
      userId,
      amount,
      reason: reason || 'Admin credit',
    });

    logger.info('Added balance to user', { userId, amount, reason });
    res.json(response.data);
  } catch (error) {
    logger.error('Error adding balance', error);
    next(error);
  }
});

app.post('/api/admin/balance/deduct', async (req, res, next) => {
  try {
    const { userId, amount, reason } = req.body;
    
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid userId or amount' });
    }

    const response = await axios.post(`${services.payment}/api/admin/balance/deduct`, {
      userId,
      amount,
      reason: reason || 'Admin deduction',
    });

    logger.info('Deducted balance from user', { userId, amount, reason });
    res.json(response.data);
  } catch (error) {
    logger.error('Error deducting balance', error);
    next(error);
  }
});

app.get('/api/admin/balance/:userId', async (req, res, next) => {
  try {
    const response = await axios.get(`${services.payment}/api/admin/balance/${req.params.userId}`);
    
    logger.info('Fetched user balance', { userId: req.params.userId });
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching balance', error);
    next(error);
  }
});

app.get('/api/admin/balance/:userId/transactions', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const response = await axios.get(`${services.payment}/api/admin/balance/${req.params.userId}/transactions`, {
      params: { page, limit }
    });

    logger.info('Fetched user transactions', { userId: req.params.userId });
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching transactions', error);
    next(error);
  }
});

// ========== DASHBOARD STATS ENDPOINT ==========

app.get('/api/admin/stats', async (req, res, next) => {
  try {
    const [usersResponse, campaignsResponse] = await Promise.allSettled([
      axios.get(`${services.auth}/api/admin/users/count`),
      axios.get(`${services.campaign}/api/campaigns?limit=1`),
    ]);

    const totalUsers = usersResponse.status === 'fulfilled' ? usersResponse.value.data.count : 0;
    const totalCampaigns = campaignsResponse.status === 'fulfilled' ? campaignsResponse.value.data.count : 0;

    // Get pending approvals count
    const pendingResponse = await axios.get(`${services.campaign}/api/campaigns?status=DRAFT&limit=1`).catch(() => ({ data: { count: 0 } }));
    const pendingApprovals = pendingResponse.data.count || 0;

    // Get total donations from payment service
    const donationsResponse = await axios.get(`${services.payment}/api/admin/stats/total-donations`).catch(() => ({ data: { total: 0 } }));
    const totalDonations = donationsResponse.data.total || 0;

    res.json({
      totalUsers,
      activeCampaigns: totalCampaigns,
      pendingApprovals,
      totalDonations: `$${parseFloat(totalDonations).toFixed(2)}`,
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats', error);
    next(error);
  }
});

// ========== CHAT ENDPOINTS ==========

app.get('/api/admin/chat/conversations', async (req, res, next) => {
  try {
    const response = await axios.get(`${services.chat || 'http://localhost:4008'}/api/admin/conversations`);
    
    logger.info('Fetched chat conversations');
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching conversations', error);
    // Return empty array if chat service is not available
    res.json({ conversations: [] });
  }
});

app.get('/api/admin/chat/:userId/messages', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    const response = await axios.get(`${services.chat || 'http://localhost:4008'}/api/admin/chat/${req.params.userId}/messages`, {
      params: { page, limit }
    });

    logger.info('Fetched chat messages', { userId: req.params.userId });
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching chat messages', error);
    res.json({ messages: [] });
  }
});

app.post('/api/admin/chat/:userId/messages', async (req, res, next) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await axios.post(`${services.chat || 'http://localhost:4008'}/api/admin/chat/${req.params.userId}/messages`, {
      message,
      sender: 'admin',
    });

    // Emit socket event to notify user
    io.to(`user-${req.params.userId}`).emit('new-message', {
      id: response.data.id,
      message,
      sender: 'admin',
      timestamp: new Date().toISOString(),
    });

    logger.info('Sent admin message', { userId: req.params.userId });
    res.json(response.data);
  } catch (error) {
    logger.error('Error sending message', error);
    next(error);
  }
});

// ========== SOCKET.IO CHAT HANDLING ==========

const chatUsers = new Map(); // Store active chat connections

io.on('connection', (socket) => {
  logger.info('Socket connected', { socketId: socket.id });

  socket.on('admin-join', (data) => {
    socket.join('admin-room');
    logger.info('Admin joined chat', { socketId: socket.id });
  });

  socket.on('join-user-chat', (data) => {
    const { userId } = data;
    socket.join(`user-${userId}`);
    chatUsers.set(socket.id, userId);
    logger.info('Admin joined user chat', { userId });
  });

  socket.on('leave-user-chat', (data) => {
    const { userId } = data;
    socket.leave(`user-${userId}`);
    logger.info('Admin left user chat', { userId });
  });

  socket.on('send-admin-message', async (data) => {
    const { userId, message } = data;
    
    try {
      // Save message to database via chat service
      await axios.post(`${services.chat || 'http://localhost:4008'}/api/admin/chat/${userId}/messages`, {
        message,
        sender: 'admin',
      });

      // Emit to user room
      io.to(`user-${userId}`).emit('new-message', {
        message,
        sender: 'admin',
        timestamp: new Date().toISOString(),
      });

      // Confirm to admin
      socket.emit('message-sent', { success: true });
      
      logger.info('Admin message sent via socket', { userId });
    } catch (error) {
      logger.error('Error sending socket message', error);
      socket.emit('message-error', { error: error.message });
    }
  });

  socket.on('typing', (data) => {
    const { userId } = data;
    io.to(`user-${userId}`).emit('admin-typing', { typing: true });
  });

  socket.on('stop-typing', (data) => {
    const { userId } = data;
    io.to(`user-${userId}`).emit('admin-typing', { typing: false });
  });

  socket.on('disconnect', () => {
    const userId = chatUsers.get(socket.id);
    if (userId) {
      chatUsers.delete(socket.id);
      logger.info('Socket disconnected', { socketId: socket.id, userId });
    }
  });
});

app.use((err, req, res, next) => {
  logger.error('Request error', err);
  
  if (err.response) {
    return res.status(err.response.status).json({ error: err.response.data });
  }
  
  res.status(500).json({ error: { message: err.message } });
});

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Admin Service running on port ${PORT}`);
  logger.info(`Socket.IO server ready for admin chat`);
});

module.exports = { app, server, io };
