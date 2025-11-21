const express = require('express');
const { Sequelize } = require('sequelize');
const winston = require('winston');
const promClient = require('prom-client');
const createPaymentModel = require('./models/Payment');
const createWebhookLogModel = require('./models/WebhookLog');
const PaymentService = require('./services/paymentService');
const SSLCommerzService = require('./services/sslcommerzService');
const sslcommerzConfig = require('./config/sslcommerz');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 4004;

app.use(express.json());

// Logger with Logstash support
const { createLogger } = require('./shared/logger');
const logger = createLogger('payment-service');

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const paymentCounter = new promClient.Counter({
  name: 'payments_total',
  help: 'Total number of payments',
  labelNames: ['status'],
  registers: [register],
});

const webhookCounter = new promClient.Counter({
  name: 'webhooks_total',
  help: 'Total number of webhooks received',
  labelNames: ['event_type', 'is_duplicate'],
  registers: [register],
});

// Database
const sequelize = new Sequelize(
  process.env.DB_NAME || 'careforall_payments',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || 'rootpass123',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
  }
);

const Payment = createPaymentModel(sequelize);
const WebhookLog = createWebhookLogModel(sequelize);
const paymentService = new PaymentService(sequelize, Payment, WebhookLog, logger);
const sslcommerzService = new SSLCommerzService(logger);

// Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - start,
    });
  });
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'payment-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Create payment
app.post('/api/payments', async (req, res, next) => {
  try {
    const { pledgeId, campaignId, amount } = req.body;
    logger.info('Payment request received', { pledgeId, campaignId, amount });
    const idempotencyKey = req.headers['idempotency-key'] || `payment-${pledgeId}-${Date.now()}`;

    const payment = await paymentService.createPayment({
      pledgeId,
      campaignId,
      amount,
      idempotencyKey,
    });

    paymentCounter.inc({ status: 'created' });
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});

// Webhook handler - CRITICAL: Idempotency
app.post('/api/payments/webhook', async (req, res, next) => {
  try {
    const webhookData = req.body;
    const idempotencyKey = req.headers['idempotency-key'] || 
                          `webhook-${webhookData.gatewayTransactionId}-${webhookData.eventType}`;

    const result = await paymentService.handleWebhook(webhookData, idempotencyKey);

    webhookCounter.inc({ 
      event_type: webhookData.eventType,
      is_duplicate: result.wasDuplicate ? 'true' : 'false',
    });

    if (result.wasDuplicate) {
      logger.warn('Duplicate webhook - returning cached result', { idempotencyKey });
    }

    res.json({
      success: true,
      payment: result.payment,
      wasDuplicate: result.wasDuplicate,
    });
  } catch (error) {
    next(error);
  }
});

// Get payment
app.get('/api/payments/:id', async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentById(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

// Get payment by pledge
app.get('/api/pledges/:pledgeId/payment', async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentByPledge(req.params.pledgeId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

// SSLCommerz Payment Initiation
app.post('/api/payments/sslcommerz/init', async (req, res, next) => {
  try {
    const { pledgeId, campaignId, amount, customerName, customerEmail, customerPhone } = req.body;
    
    // Generate unique transaction ID
    const transactionId = `TXN-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    logger.info('Initiating SSLCommerz payment', { pledgeId, campaignId, amount, transactionId });
    
    // Create payment record with PENDING status
    const payment = await paymentService.createPayment({
      pledgeId,
      campaignId,
      amount,
      idempotencyKey: transactionId,
    });
    
    // Initiate payment with SSLCommerz
    const sslResponse = await sslcommerzService.initiatePayment({
      transactionId,
      amount,
      pledgeId,
      campaignId,
      customerName,
      customerEmail,
      customerPhone,
    });
    
    if (sslResponse.success) {
      // Update payment with SSLCommerz transaction ID
      await payment.update({
        gatewayTransactionId: transactionId, // Use our transaction ID that we sent to SSLCommerz
        metadata: {
          sessionKey: sslResponse.sessionKey,
          gatewayUrl: sslResponse.gatewayUrl,
        },
      });
      
      logger.info('SSLCommerz payment session created', { 
        paymentId: payment.id, 
        transactionId 
      });
      
      res.status(200).json({
        success: true,
        paymentId: payment.id,
        gatewayUrl: sslResponse.gatewayUrl,
        transactionId,
      });
    } else {
      // Update payment status to FAILED
      await payment.update({ status: 'FAILED' });
      
      res.status(400).json({
        success: false,
        message: sslResponse.message || 'Payment initiation failed',
      });
    }
  } catch (error) {
    next(error);
  }
});

// SSLCommerz Success Callback (handles both GET and POST)
app.all('/api/payments/sslcommerz/success', async (req, res, next) => {
  try {
    const sslData = req.method === 'GET' ? req.query : req.body;
    const { tran_id, val_id, amount, status, tran_type, value_a: pledgeId, value_b: campaignId } = sslData;
    
    logger.info('SSLCommerz success callback', { tran_id, val_id, status, tran_type, pledgeId, allParams: sslData });
    
    // In sandbox mode, if SSLCommerz indicates success via tran_type, trust that
    const isSandbox = sslcommerzConfig.is_live === false;
    let isValid = false;
    let validationData = null;
    
    // Check both status and tran_type for success indicators
    if (status === 'VALID' || status === 'VALIDATED' || tran_type === 'success') {
      if (isSandbox) {
        // In sandbox, trust SSLCommerz's status from the redirect
        logger.info('Sandbox mode: Trusting SSLCommerz success indicator', { status, tran_type });
        isValid = true;
        validationData = sslData;
      } else {
        // In production, always validate with SSLCommerz API
        const validation = await sslcommerzService.validatePayment(val_id, tran_id);
        isValid = validation.isValid;
        validationData = validation.data;
      }
    }
    
    if (isValid) {
      // Find payment by gateway transaction ID
      const payment = await Payment.findOne({ 
        where: { gatewayTransactionId: tran_id } 
      });
      
      if (payment) {
        // First authorize the payment
        await paymentService.updatePaymentStatus(
          payment.id,
          'AUTHORIZED',
          tran_id,
          { sslcommerz: validationData }
        );
        
        // Then capture it
        await paymentService.updatePaymentStatus(
          payment.id,
          'CAPTURED',
          tran_id,
          { sslcommerz: validationData }
        );
        
        logger.info('Payment captured successfully', { paymentId: payment.id, tran_id });
        
        // Redirect to frontend success page
        res.redirect(`http://localhost:3002/payment-success?transaction=${tran_id}&amount=${amount}`);
      } else {
        logger.error('Payment not found for transaction', { tran_id });
        res.redirect(`http://localhost:3002/payment-failed?reason=payment_not_found&transaction=${tran_id}`);
      }
    } else {
      logger.warn('Payment validation failed', { tran_id, val_id, status, tran_type });
      res.redirect(`http://localhost:3002/payment-failed?reason=validation_failed&transaction=${tran_id}`);
    }
  } catch (error) {
    logger.error('Success callback error', error);
    res.redirect(`http://localhost:3002/payment-failed?reason=error`);
  }
});

// SSLCommerz Fail Callback (handles both GET and POST)
app.all('/api/payments/sslcommerz/fail', async (req, res, next) => {
  try {
    const sslData = req.method === 'GET' ? req.query : req.body;
    const { tran_id, status, error: errorMsg } = sslData;
    
    logger.warn('SSLCommerz fail callback', { tran_id, status, error: errorMsg });
    
    // Find and update payment status
    const payment = await Payment.findOne({ 
      where: { gatewayTransactionId: tran_id } 
    });
    
    if (payment) {
      await payment.update({ 
        status: 'FAILED',
        metadata: { ...payment.metadata, failureReason: errorMsg, sslStatus: status },
      });
      
      logger.info('Payment marked as failed', { paymentId: payment.id, tran_id });
    }
    
    res.redirect(`http://localhost:3002/payment-failed?transaction=${tran_id}&reason=${encodeURIComponent(errorMsg || 'payment_failed')}`);
  } catch (error) {
    logger.error('Fail callback error', error);
    res.redirect(`http://localhost:3002/payment-failed?reason=error`);
  }
});

// SSLCommerz Cancel Callback (handles both GET and POST)
app.all('/api/payments/sslcommerz/cancel', async (req, res, next) => {
  try {
    const sslData = req.method === 'GET' ? req.query : req.body;
    const { tran_id, status } = sslData;
    
    logger.info('SSLCommerz cancel callback', { tran_id, status });
    
    // Find and update payment status
    const payment = await Payment.findOne({ 
      where: { gatewayTransactionId: tran_id } 
    });
    
    if (payment) {
      await payment.update({ 
        status: 'CANCELLED',
        metadata: { ...payment.metadata, sslStatus: status },
      });
      
      logger.info('Payment cancelled', { paymentId: payment.id, tran_id });
    }
    
    res.redirect(`http://localhost:3002/payment-cancelled?transaction=${tran_id}`);
  } catch (error) {
    logger.error('Cancel callback error', error);
    res.redirect(`http://localhost:3002/payment-failed?reason=error`);
  }
});

// SSLCommerz IPN (Instant Payment Notification)
app.post('/api/payments/sslcommerz/ipn', async (req, res, next) => {
  try {
    const ipnData = req.body;
    const { tran_id, val_id, amount, status } = ipnData;
    
    logger.info('SSLCommerz IPN received', { tran_id, val_id, status });
    
    // Process and validate IPN
    const ipnResult = await sslcommerzService.processIPN(ipnData);
    
    if (ipnResult.success) {
      const payment = await Payment.findOne({ 
        where: { gatewayTransactionId: tran_id } 
      });
      
      if (payment && payment.status === 'PENDING') {
        // Process via webhook system
        const webhookData = {
          eventType: 'PAYMENT_CAPTURED',
          gatewayTransactionId: tran_id,
          amount: parseFloat(amount),
          pledgeId: payment.pledgeId,
          campaignId: payment.campaignId,
          status: 'CAPTURED',
          metadata: ipnResult.data,
        };
        
        await paymentService.handleWebhook(webhookData, `ssl-ipn-${tran_id}-${Date.now()}`);
        
        logger.info('IPN processed successfully', { paymentId: payment.id, tran_id });
      }
      
      res.status(200).send('IPN Processed');
    } else {
      logger.warn('IPN validation failed', { tran_id });
      res.status(400).send('IPN Validation Failed');
    }
  } catch (error) {
    logger.error('IPN processing error', error);
    res.status(500).send('IPN Error');
  }
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Request error', err);
  res.status(err.statusCode || 500).json({
    error: { message: err.message },
  });
});

async function startServer() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established');

    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    logger.info('Database synchronized');

    await paymentService.init();

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Payment Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
