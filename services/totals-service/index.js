const express = require('express');
const { Sequelize } = require('sequelize');
const winston = require('winston');
const { Kafka } = require('kafkajs');
const promClient = require('prom-client');
const createCampaignTotalsModel = require('./models/CampaignTotals');

const app = express();
const PORT = process.env.PORT || 4005;

app.use(express.json());

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'totals-service' },
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

// Metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const totalsUpdatedCounter = new promClient.Counter({
  name: 'totals_updated_total',
  help: 'Total number of totals updates',
  registers: [register],
});

// Database
const sequelize = new Sequelize(
  process.env.DB_NAME || 'careforall_totals',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || 'rootpass123',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
  }
);

const CampaignTotals = createCampaignTotalsModel(sequelize);

// Kafka Consumer
const kafka = new Kafka({
  clientId: 'totals-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});
const consumer = kafka.consumer({ groupId: 'totals-service-group' });

async function startKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topics: ['pledge-events', 'payment-events'], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const eventData = JSON.parse(message.value.toString());
      const eventType = message.headers['event-type']?.toString();

      logger.info('Event received', { topic, eventType, campaignId: eventData.campaignId });

      try {
        if (eventType === 'PledgeCreated') {
          await handlePledgeCreated(eventData);
        } else if (eventType === 'PledgeCompleted') {
          await handlePledgeCompleted(eventData);
        } else if (eventType === 'PaymentCaptured') {
          await handlePaymentCaptured(eventData);
        }
      } catch (error) {
        logger.error('Error processing event', error);
      }
    },
  });

  logger.info('Kafka consumer started');
}

async function handlePledgeCreated(eventData) {
  const { campaignId, amount } = eventData;
  
  const [totals, created] = await CampaignTotals.findOrCreate({
    where: { campaignId },
    defaults: { campaignId, totalAmount: 0, totalPledges: 0, completedPledges: 0 },
  });

  await totals.increment('totalPledges');
  await totals.update({ lastUpdated: new Date() });
  
  totalsUpdatedCounter.inc();
  logger.info('Totals updated for PledgeCreated', { campaignId });
}

async function handlePledgeCompleted(eventData) {
  const { campaignId, amount } = eventData;
  
  const totals = await CampaignTotals.findOne({ where: { campaignId } });
  
  if (totals) {
    await totals.increment('totalAmount', { by: parseFloat(amount) });
    await totals.increment('completedPledges');
    await totals.update({ lastUpdated: new Date() });
    
    totalsUpdatedCounter.inc();
    logger.info('Totals updated for PledgeCompleted', { campaignId, amount });
  }
}

async function handlePaymentCaptured(eventData) {
  const { campaignId, amount } = eventData;
  
  if (!campaignId) {
    logger.warn('PaymentCaptured event missing campaignId', { eventData });
    return;
  }
  
  const totals = await CampaignTotals.findOne({ where: { campaignId } });
  
  if (totals) {
    await totals.increment('totalAmount', { by: parseFloat(amount) });
    await totals.increment('completedPledges');
    await totals.update({ lastUpdated: new Date() });
    
    totalsUpdatedCounter.inc();
    logger.info('Totals updated for PaymentCaptured', { campaignId, amount });
  }
}

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'totals-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/api/campaigns/:campaignId/totals', async (req, res, next) => {
  try {
    const totals = await CampaignTotals.findByPk(req.params.campaignId);
    
    if (!totals) {
      return res.json({
        campaignId: req.params.campaignId,
        totalAmount: 0,
        totalPledges: 0,
        completedPledges: 0,
      });
    }

    res.json(totals);
  } catch (error) {
    next(error);
  }
});

app.get('/api/totals', async (req, res, next) => {
  try {
    const allTotals = await CampaignTotals.findAll();
    res.json(allTotals);
  } catch (error) {
    next(error);
  }
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Request error', err);
  res.status(500).json({ error: { message: err.message } });
});

async function startServer() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established');

    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    logger.info('Database synchronized');

    await startKafkaConsumer();

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Totals Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await consumer.disconnect();
  await sequelize.close();
  process.exit(0);
});

startServer();

module.exports = app;
