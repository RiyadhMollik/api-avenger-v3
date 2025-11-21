const express = require('express');
const { Sequelize, Op } = require('sequelize');
const winston = require('winston');
const { Kafka } = require('kafkajs');
const promClient = require('prom-client');
const cors = require('cors');
const createCampaignModel = require('./models/Campaign');

const app = express();
const PORT = process.env.PORT || 4002;

app.use(cors());
app.use(express.json());

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'campaign-service' },
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const campaignCounter = new promClient.Counter({
  name: 'campaigns_total',
  help: 'Total campaigns',
  labelNames: ['status'],
  registers: [register],
});

const sequelize = new Sequelize(
  process.env.DB_NAME || 'careforall_campaigns',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || 'rootpass123',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
  }
);

const Campaign = createCampaignModel(sequelize);

const kafka = new Kafka({
  clientId: 'campaign-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});
const producer = kafka.producer();
let producerConnected = false;

async function publishEvent(eventType, data) {
  if (!producerConnected) return;
  
  try {
    await producer.send({
      topic: 'campaign-events',
      messages: [{
        key: data.campaignId || data.id,
        value: JSON.stringify(data),
        headers: { 'event-type': eventType },
      }],
    });
    logger.info('Event published', { eventType });
  } catch (error) {
    logger.error('Failed to publish event', error);
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'campaign-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.post('/api/campaigns', async (req, res, next) => {
  try {
    const { title, description, goalAmount, organizerId, startDate, endDate, status, category, imageUrl } = req.body;
    
    const campaign = await Campaign.create({
      title,
      description,
      goalAmount,
      organizerId,
      startDate,
      endDate,
      status: status || 'DRAFT',
      category,
      imageUrl,
    });

    campaignCounter.inc({ status: campaign.status });
    await publishEvent('CampaignCreated', campaign.toJSON());

    res.status(201).json(campaign);
  } catch (error) {
    next(error);
  }
});

app.get('/api/campaigns', async (req, res, next) => {
  try {
    const { status, category, limit = 50, offset = 0 } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const campaigns = await Campaign.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
    });

    res.json(campaigns);
  } catch (error) {
    next(error);
  }
});

app.get('/api/campaigns/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

app.put('/api/campaigns/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await campaign.update(req.body);
    await publishEvent('CampaignUpdated', campaign.toJSON());

    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/campaigns/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await campaign.destroy();
    await publishEvent('CampaignDeleted', { campaignId: campaign.id });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  logger.error('Request error', err);
  res.status(500).json({ error: { message: err.message } });
});

async function startServer() {
  try {
    await sequelize.authenticate();
    logger.info('Database connected');

    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    logger.info('Database synchronized');

    await producer.connect();
    producerConnected = true;
    logger.info('Kafka producer connected');

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Campaign Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
