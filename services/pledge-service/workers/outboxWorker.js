const { Kafka } = require('kafkajs');

class OutboxWorker {
  constructor(sequelize, Outbox, logger) {
    this.sequelize = sequelize;
    this.Outbox = Outbox;
    this.logger = logger;
    this.isRunning = false;
    this.pollInterval = 5000; // 5 seconds
    this.batchSize = 100;
    this.maxRetries = 10;

    // Initialize Kafka producer
    this.kafka = new Kafka({
      clientId: 'pledge-service-outbox',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    });
    this.producer = this.kafka.producer();
  }

  async start() {
    await this.producer.connect();
    this.logger.info('Outbox worker started');
    this.isRunning = true;
    this.poll();
  }

  async stop() {
    this.isRunning = false;
    await this.producer.disconnect();
    this.logger.info('Outbox worker stopped');
  }

  async poll() {
    if (!this.isRunning) return;

    try {
      await this.processUnpublishedEvents();
    } catch (error) {
      this.logger.error('Error in outbox worker poll', error);
    }

    // Schedule next poll
    setTimeout(() => this.poll(), this.pollInterval);
  }

  async processUnpublishedEvents() {
    const unpublishedEvents = await this.Outbox.findAll({
      where: {
        published: false,
        retryCount: {
          [this.sequelize.Sequelize.Op.lt]: this.maxRetries,
        },
      },
      limit: this.batchSize,
      order: [['createdAt', 'ASC']],
    });

    if (unpublishedEvents.length === 0) {
      return;
    }

    this.logger.info(`Processing ${unpublishedEvents.length} unpublished events`);

    for (const event of unpublishedEvents) {
      try {
        await this.publishEvent(event);
        
        // Mark as published
        await event.update({
          published: true,
          publishedAt: new Date(),
        });

        this.logger.info('Event published successfully', {
          eventId: event.id,
          eventType: event.eventType,
          aggregateId: event.aggregateId,
        });
      } catch (error) {
        // Increment retry count
        await event.increment('retryCount');
        await event.update({
          lastError: error.message,
        });

        this.logger.error('Failed to publish event', error, {
          eventId: event.id,
          eventType: event.eventType,
          retryCount: event.retryCount + 1,
        });

        // If max retries reached, log for manual intervention
        if (event.retryCount + 1 >= this.maxRetries) {
          this.logger.error('Event reached max retries - requires manual intervention', {
            eventId: event.id,
            eventType: event.eventType,
            aggregateId: event.aggregateId,
          });
        }
      }
    }
  }

  async publishEvent(event) {
    const topic = this.getTopicForEventType(event.eventType);
    
    await this.producer.send({
      topic,
      messages: [{
        key: event.aggregateId,
        value: JSON.stringify(event.payload),
        headers: {
          'event-type': event.eventType,
          'aggregate-type': event.aggregateType,
          'aggregate-id': event.aggregateId,
          'event-id': event.id,
          'timestamp': event.createdAt.toISOString(),
        },
      }],
    });
  }

  getTopicForEventType(eventType) {
    // Map event types to Kafka topics
    const topicMap = {
      'PledgeCreated': 'pledge-events',
      'PledgeStatusChanged': 'pledge-events',
      'PledgeCompleted': 'pledge-events',
      'PledgeFailed': 'pledge-events',
    };

    return topicMap[eventType] || 'pledge-events';
  }
}

module.exports = OutboxWorker;
