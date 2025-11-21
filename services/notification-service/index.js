const express = require('express');
const { Kafka } = require('kafkajs');
const winston = require('winston');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 4006;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'notification-service' },
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const notificationCounter = new promClient.Counter({
  name: 'notifications_sent_total',
  help: 'Total notifications sent',
  labelNames: ['type', 'event'],
  registers: [register],
});

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const consumer = kafka.consumer({ groupId: 'notification-service-group' });

async function sendEmail(to, subject, body) {
  // Simulate email sending
  logger.info('📧 EMAIL SENT', { to, subject, body: body.substring(0, 100) });
  notificationCounter.inc({ type: 'email', event: subject });
}

async function sendSMS(to, message) {
  // Simulate SMS sending
  logger.info('📱 SMS SENT', { to, message: message.substring(0, 100) });
  notificationCounter.inc({ type: 'sms', event: 'sms' });
}

const eventHandlers = {
  async PledgeCreated(event) {
    const { pledge, campaign, user } = event;
    
    await sendEmail(
      user.email || 'guest@example.com',
      '🎉 Thank you for your pledge!',
      `Hi ${user.name},\n\nThank you for pledging $${pledge.amount} to "${campaign.title}"!\n\nYour pledge ID: ${pledge.id}\nStatus: ${pledge.status}\n\nWe'll notify you when payment is processed.`
    );

    if (campaign.organizerEmail) {
      await sendEmail(
        campaign.organizerEmail,
        '💰 New Pledge Received!',
        `Good news! Someone pledged $${pledge.amount} to your campaign "${campaign.title}".\n\nPledge ID: ${pledge.id}`
      );
    }
  },

  async PledgeCompleted(event) {
    const { pledge, user } = event;
    
    await sendEmail(
      user.email || 'guest@example.com',
      '✅ Your pledge is complete!',
      `Hi ${user.name},\n\nYour pledge of $${pledge.amount} has been successfully completed!\n\nPledge ID: ${pledge.id}\nThank you for your generosity.`
    );
  },

  async PaymentAuthorized(event) {
    const { payment, pledge } = event;
    
    logger.info('💳 Payment Authorized', { paymentId: payment.id, pledgeId: pledge.id, amount: payment.amount });
  },

  async PaymentCaptured(event) {
    const { payment, pledge } = event;
    
    logger.info('✅ Payment Captured', { paymentId: payment.id, pledgeId: pledge.id, amount: payment.amount });
  },

  async PaymentFailed(event) {
    const { payment, pledge, user } = event;
    
    await sendEmail(
      user.email || 'guest@example.com',
      '⚠️ Payment Issue',
      `Hi ${user.name},\n\nThere was an issue processing your payment for pledge ${pledge.id}.\n\nAmount: $${payment.amount}\nPlease contact support if you need assistance.`
    );
  },

  async CampaignCreated(event) {
    const { campaign } = event;
    
    logger.info('🎯 New Campaign Created', { campaignId: campaign.id, title: campaign.title, goal: campaign.goalAmount });
  },

  async CampaignCompleted(event) {
    const { campaign, totalRaised } = event;
    
    logger.info('🎊 Campaign Completed', { campaignId: campaign.id, title: campaign.title, totalRaised });
    
    if (campaign.organizerEmail) {
      await sendEmail(
        campaign.organizerEmail,
        '🎊 Campaign Completed!',
        `Congratulations! Your campaign "${campaign.title}" has been completed.\n\nTotal Raised: $${totalRaised}\nGoal: $${campaign.goalAmount}`
      );
    }
  },
};

async function startConsumer() {
  await consumer.connect();
  logger.info('Kafka consumer connected');

  await consumer.subscribe({ topics: ['pledge-events', 'payment-events', 'campaign-events'], fromBeginning: false });
  logger.info('Subscribed to topics: pledge-events, payment-events, campaign-events');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const eventType = message.headers['event-type']?.toString();
      const eventData = JSON.parse(message.value.toString());

      logger.info('Event received', { topic, eventType, key: message.key.toString() });

      const handler = eventHandlers[eventType];
      if (handler) {
        try {
          await handler(eventData);
        } catch (error) {
          logger.error('Error handling event', { eventType, error: error.message });
        }
      } else {
        logger.warn('No handler for event', { eventType });
      }
    },
  });
}

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'notification-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Notification Service running on port ${PORT}`);
});

startConsumer().catch((error) => {
  logger.error('Failed to start consumer', error);
  process.exit(1);
});

module.exports = app;
