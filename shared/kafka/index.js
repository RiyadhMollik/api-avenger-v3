const { Kafka } = require('kafkajs');
const Logger = require('../logger');

class KafkaProducer {
  constructor(clientId) {
    this.logger = new Logger('KafkaProducer');
    this.clientId = clientId;
    this.kafka = new Kafka({
      clientId,
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    });
    this.producer = this.kafka.producer();
    this.connected = false;
  }

  async connect() {
    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.info('Kafka producer connected');
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer', error);
      throw error;
    }
  }

  async sendEvent(topic, event) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const result = await this.producer.send({
        topic,
        messages: [{
          key: event.aggregateId,
          value: JSON.stringify(event),
          headers: {
            'event-type': event.eventType,
            'timestamp': new Date().toISOString(),
          },
        }],
      });
      
      this.logger.info('Event published', { topic, eventType: event.eventType, aggregateId: event.aggregateId });
      return result;
    } catch (error) {
      this.logger.error('Failed to publish event', error, { topic, event });
      throw error;
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
      this.logger.info('Kafka producer disconnected');
    }
  }
}

class KafkaConsumer {
  constructor(groupId, topics, handlers) {
    this.logger = new Logger('KafkaConsumer');
    this.groupId = groupId;
    this.topics = Array.isArray(topics) ? topics : [topics];
    this.handlers = handlers; // Map of eventType -> handler function
    
    this.kafka = new Kafka({
      clientId: groupId,
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    });
    
    this.consumer = this.kafka.consumer({ groupId });
  }

  async connect() {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topics: this.topics, fromBeginning: false });
      this.logger.info('Kafka consumer connected', { groupId: this.groupId, topics: this.topics });
    } catch (error) {
      this.logger.error('Failed to connect Kafka consumer', error);
      throw error;
    }
  }

  async start() {
    await this.connect();

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const event = JSON.parse(message.value.toString());
        const eventType = message.headers['event-type']?.toString();

        this.logger.debug('Message received', { topic, eventType, aggregateId: event.aggregateId });

        const handler = this.handlers[eventType];
        if (handler) {
          try {
            await handler(event, { topic, partition, offset: message.offset });
            this.logger.info('Event handled successfully', { eventType, aggregateId: event.aggregateId });
          } catch (error) {
            this.logger.error('Error handling event', error, { eventType, event });
            // Implement DLQ or retry logic here
          }
        } else {
          this.logger.warn('No handler found for event type', { eventType });
        }
      },
    });
  }

  async disconnect() {
    await this.consumer.disconnect();
    this.logger.info('Kafka consumer disconnected');
  }
}

module.exports = { KafkaProducer, KafkaConsumer };
