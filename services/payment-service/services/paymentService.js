const crypto = require('crypto');
const { Kafka } = require('kafkajs');
const PaymentStateMachine = require('../utils/stateMachine');

class PaymentService {
  constructor(sequelize, Payment, WebhookLog, logger) {
    this.sequelize = sequelize;
    this.Payment = Payment;
    this.WebhookLog = WebhookLog;
    this.logger = logger;

    // Initialize Kafka
    this.kafka = new Kafka({
      clientId: 'payment-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    });
    this.producer = this.kafka.producer();
    this.producerConnected = false;
  }

  async init() {
    try {
      await this.producer.connect();
      this.producerConnected = true;
      this.logger.info('Payment service initialized with Kafka');
    } catch (error) {
      this.logger.warn('Kafka not available, continuing without event publishing', error.message);
      this.producerConnected = false;
    }
  }

  async createPayment(paymentData) {
    const { pledgeId, campaignId, amount, idempotencyKey } = paymentData;

    // Check idempotency
    const existingPayment = await this.Payment.findOne({
      where: { idempotencyKey },
    });

    if (existingPayment) {
      this.logger.info('Duplicate payment request detected', { idempotencyKey });
      return existingPayment;
    }

    const payment = await this.Payment.create({
      pledgeId,
      campaignId,
      amount,
      idempotencyKey,
      status: 'PENDING',
    });

    this.logger.info('Payment created', {
      paymentId: payment.id,
      pledgeId,
      amount,
    });

    // Simulate payment gateway call
    // Disabled when using real payment gateway like SSLCommerz
    // await this.simulatePaymentGateway(payment);

    return payment;
  }

  async handleWebhook(webhookData, idempotencyKey) {
    const { eventType, paymentId, gatewayTransactionId, status, metadata = {} } = webhookData;

    // Log webhook for audit trail
    const webhookLog = await this.WebhookLog.create({
      paymentId,
      idempotencyKey,
      eventType,
      payload: webhookData,
      processed: false,
    });

    // Check for duplicate webhook using idempotency key
    const existingWebhook = await this.WebhookLog.findOne({
      where: {
        idempotencyKey,
        processed: true,
        id: { [this.sequelize.Sequelize.Op.ne]: webhookLog.id },
      },
    });

    if (existingWebhook) {
      this.logger.warn('Duplicate webhook detected', {
        idempotencyKey,
        eventType,
      });
      
      await webhookLog.update({ 
        isDuplicate: true, 
        processed: true,
        processedAt: new Date(),
      });

      // Return the original payment result (cached)
      const payment = await this.Payment.findByPk(paymentId);
      return { payment, wasDuplicate: true };
    }

    // Process webhook
    try {
      const payment = await this.updatePaymentStatus(
        paymentId,
        status,
        gatewayTransactionId,
        metadata
      );

      // Mark webhook as processed
      await webhookLog.update({ 
        processed: true,
        processedAt: new Date(),
      });

      this.logger.info('Webhook processed successfully', {
        webhookId: webhookLog.id,
        paymentId,
        eventType,
        status,
      });

      return { payment, wasDuplicate: false };
    } catch (error) {
      this.logger.error('Error processing webhook', error, {
        webhookId: webhookLog.id,
        eventType,
      });
      throw error;
    }
  }

  async updatePaymentStatus(paymentId, newStatus, gatewayTransactionId = null, metadata = {}) {
    const transaction = await this.sequelize.transaction();

    try {
      const payment = await this.Payment.findByPk(paymentId, { 
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Validate state transition
      PaymentStateMachine.validateTransition(payment.status, newStatus);

      const oldStatus = payment.status;
      
      // Only update if status actually changes
      if (oldStatus !== newStatus) {
        payment.status = newStatus;
        if (gatewayTransactionId) {
          payment.gatewayTransactionId = gatewayTransactionId;
        }
        payment.metadata = { ...payment.metadata, ...metadata };
        payment.webhookEvents = [
          ...payment.webhookEvents,
          {
            status: newStatus,
            timestamp: new Date(),
            gatewayTransactionId,
          },
        ];

        await payment.save({ transaction });

        // Publish event to Kafka
        if (this.producerConnected) {
          await this.publishPaymentEvent(payment, oldStatus, newStatus);
        }
      }

      await transaction.commit();

      this.logger.info('Payment status updated', {
        paymentId,
        oldStatus,
        newStatus,
      });

      return payment;
    } catch (error) {
      await transaction.rollback();
      this.logger.error('Failed to update payment status', error);
      throw error;
    }
  }

  async publishPaymentEvent(payment, oldStatus, newStatus) {
    const eventType = `Payment${newStatus.charAt(0) + newStatus.slice(1).toLowerCase()}`;
    
    await this.producer.send({
      topic: 'payment-events',
      messages: [{
        key: payment.id,
        value: JSON.stringify({
          paymentId: payment.id,
          pledgeId: payment.pledgeId,
          campaignId: payment.campaignId,
          amount: payment.amount,
          oldStatus,
          newStatus,
          gatewayTransactionId: payment.gatewayTransactionId,
          timestamp: new Date(),
        }),
        headers: {
          'event-type': eventType,
          'payment-id': payment.id,
        },
      }],
    });
  }

  async simulatePaymentGateway(payment) {
    // Simulate payment gateway authorization (async)
    setTimeout(async () => {
      try {
        // Simulate random success/failure
        const success = Math.random() > 0.1; // 90% success rate
        
        if (success) {
          const gatewayId = `txn_${crypto.randomBytes(16).toString('hex')}`;
          await this.updatePaymentStatus(payment.id, 'AUTHORIZED', gatewayId);
          
          // Auto-capture after authorization (simulated delay)
          setTimeout(async () => {
            await this.updatePaymentStatus(payment.id, 'CAPTURED', gatewayId);
          }, 2000);
        } else {
          await this.updatePaymentStatus(payment.id, 'FAILED', null, {
            reason: 'Simulated payment failure',
          });
        }
      } catch (error) {
        this.logger.error('Error in payment gateway simulation', error);
      }
    }, 1000);
  }

  async getPaymentById(paymentId) {
    return await this.Payment.findByPk(paymentId);
  }

  async getPaymentByPledge(pledgeId) {
    return await this.Payment.findOne({ where: { pledgeId } });
  }
}

module.exports = PaymentService;
