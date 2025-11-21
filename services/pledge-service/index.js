const express = require('express');
const { Sequelize } = require('sequelize');
const winston = require('winston');
const promClient = require('prom-client');
const cors = require('cors');
const createPledgeModel = require('./models/Pledge');
const createOutboxModel = require('./models/Outbox');
const PledgeService = require('./services/pledgeService');
const OutboxWorker = require('./workers/outboxWorker');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 4003;

// Middleware
app.use(cors());
app.use(express.json());

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'pledge-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const pledgeCounter = new promClient.Counter({
  name: 'pledges_total',
  help: 'Total number of pledges created',
  labelNames: ['status'],
  registers: [register],
});

const pledgeAmountGauge = new promClient.Gauge({
  name: 'pledge_amount_total',
  help: 'Total pledge amount',
  registers: [register],
});

// Database setup
const sequelize = new Sequelize(
  process.env.DB_NAME || 'careforall_pledges',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || 'rootpass123',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
  }
);

// Initialize models
const Pledge = createPledgeModel(sequelize);
const Outbox = createOutboxModel(sequelize);

// Initialize service
const pledgeService = new PledgeService(sequelize, logger);

// Initialize outbox worker
const outboxWorker = new OutboxWorker(sequelize, Outbox, logger);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    });
  });
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Request error', err);
  res.status(err.statusCode || 500).json({
    error: {
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
});

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'pledge-service' });
});

// Metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Create pledge
app.post('/api/pledges', async (req, res, next) => {
  try {
    const { campaignId, userId, amount, metadata } = req.body;
    
    // Idempotency key from header or generate
    const idempotencyKey = req.headers['idempotency-key'] || `${userId}-${campaignId}-${Date.now()}`;

    // Check user balance before creating pledge
    const authResponse = await fetch(`${process.env.AUTH_SERVICE_URL || 'http://localhost:4001'}/api/users/${userId}/balance`);
    
    if (!authResponse.ok) {
      return res.status(400).json({ error: 'Unable to verify user balance' });
    }

    const { balance } = await authResponse.json();
    
    if (parseFloat(balance) < parseFloat(amount)) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        currentBalance: balance,
        required: amount,
      });
    }

    // Deduct balance from user account
    const deductResponse = await fetch(`${process.env.AUTH_SERVICE_URL || 'http://localhost:4001'}/api/users/${userId}/balance/deduct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });

    if (!deductResponse.ok) {
      const error = await deductResponse.json();
      return res.status(400).json({ error: error.error || 'Failed to deduct balance' });
    }

    const { balance: newBalance } = await deductResponse.json();

    const pledge = await pledgeService.createPledge({
      campaignId,
      userId,
      amount,
      idempotencyKey,
      metadata,
    });

    pledgeCounter.inc({ status: 'created' });
    pledgeAmountGauge.inc(parseFloat(amount));

    res.status(201).json({
      ...pledge.toJSON(),
      userBalance: newBalance,
    });
  } catch (error) {
    next(error);
  }
});

// Get pledge by ID
app.get('/api/pledges/:id', async (req, res, next) => {
  try {
    const pledge = await pledgeService.getPledgeById(req.params.id);
    
    if (!pledge) {
      return res.status(404).json({ error: 'Pledge not found' });
    }

    res.json(pledge);
  } catch (error) {
    next(error);
  }
});

// Process pledge payment (trigger payment service)
app.post('/api/pledges/:id/process', async (req, res, next) => {
  try {
    const pledge = await pledgeService.getPledgeById(req.params.id);
    
    if (!pledge) {
      return res.status(404).json({ error: 'Pledge not found' });
    }

    // Call payment service to create payment
    const paymentResponse = await fetch(`${process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004'}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pledgeId: pledge.id,
        campaignId: pledge.campaignId,
        amount: pledge.amount,
        userId: pledge.userId,
        idempotencyKey: `payment-${pledge.id}`,
      }),
    });

    const payment = await paymentResponse.json();
    
    // Auto-authorize for demo
    if (payment.id) {
      await fetch(`${process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004'}/api/payments/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gatewayTransactionId: `tx-${Date.now()}`,
          paymentId: payment.id,
          eventType: 'AUTHORIZED',
          status: 'AUTHORIZED',
          amount: pledge.amount,
        }),
      });

      // Auto-capture for demo
      await fetch(`${process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004'}/api/payments/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gatewayTransactionId: `tx-${Date.now()}-capture`,
          paymentId: payment.id,
          eventType: 'CAPTURED',
          status: 'CAPTURED',
          amount: pledge.amount,
        }),
      });
    }

    res.json({ success: true, pledge, payment });
  } catch (error) {
    logger.error('Error processing pledge payment', error);
    next(error);
  }
});

// Update pledge status
app.patch('/api/pledges/:id/status', async (req, res, next) => {
  try {
    const { status, metadata } = req.body;
    
    const pledge = await pledgeService.updatePledgeStatus(
      req.params.id,
      status,
      metadata
    );

    pledgeCounter.inc({ status: status.toLowerCase() });

    res.json(pledge);
  } catch (error) {
    next(error);
  }
});

// Get pledges by campaign
app.get('/api/campaigns/:campaignId/pledges', async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    
    const result = await pledgeService.getPledgesByCampaign(
      req.params.campaignId,
      { limit: parseInt(limit) || 50, offset: parseInt(offset) || 0 }
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get donation history for user
app.get('/api/users/:userId/donations', async (req, res, next) => {
  try {
    const donations = await pledgeService.getDonationHistory(req.params.userId);
    res.json(donations);
  } catch (error) {
    next(error);
  }
});

// Get outbox status (for monitoring)
app.get('/api/outbox/status', async (req, res, next) => {
  try {
    const unpublished = await Outbox.count({ where: { published: false } });
    const failedRetries = await Outbox.count({
      where: {
        published: false,
        retryCount: { [Sequelize.Op.gte]: 5 },
      },
    });

    res.json({
      unpublishedEvents: unpublished,
      failedRetries,
      workerRunning: outboxWorker.isRunning,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// SERVER STARTUP
// ============================================

async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Sync database (create tables)
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    logger.info('Database synchronized');

    // Start outbox worker
    await outboxWorker.start();

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Pledge Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await outboxWorker.stop();
  await sequelize.close();
  process.exit(0);
});

startServer();

module.exports = app;
