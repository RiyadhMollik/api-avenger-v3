const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const promClient = require('prom-client');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

app.use(cors());
app.use(express.json());

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'api-gateway' },
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
});

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.replace('Bearer ', '');
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.replace('Bearer ', '');
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      // Continue without authentication
    }
  }
  next();
};

const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.labels(req.method, req.path, res.statusCode).observe(duration);
    logger.info('Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}s`,
      userId: req.user?.id,
    });
  });
  
  next();
};

app.use(requestLogger);

const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
  campaign: process.env.CAMPAIGN_SERVICE_URL || 'http://localhost:4002',
  pledge: process.env.PLEDGE_SERVICE_URL || 'http://localhost:4003',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004',
  totals: process.env.TOTALS_SERVICE_URL || 'http://localhost:4005',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4006',
  admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:4007',
};

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'api-gateway' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Auth routes - no auth required  
app.post('/api/auth/register', limiter, async (req, res) => {
  try {
    const response = await axios.post(`${services.auth}/api/auth/register`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('Register error', error);
    res.status(error.response?.status || 503).json(error.response?.data || { error: 'Auth service unavailable' });
  }
});

app.post('/api/auth/login', limiter, async (req, res) => {
  try {
    const response = await axios.post(`${services.auth}/api/auth/login`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('Login error', error);
    res.status(error.response?.status || 503).json(error.response?.data || { error: 'Auth service unavailable' });
  }
});

app.post('/api/auth/guest-login', limiter, async (req, res) => {
  try {
    const response = await axios.post(`${services.auth}/api/auth/guest-login`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('Guest login error', error);
    res.status(error.response?.status || 503).json(error.response?.data || { error: 'Auth service unavailable' });
  }
});

// User balance routes
app.post('/api/users/:id/balance/add', limiter, async (req, res) => {
  try {
    const response = await axios.post(`${services.auth}/api/users/${req.params.id}/balance/add`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('Add balance error', error);
    res.status(error.response?.status || 503).json(error.response?.data || { error: 'Auth service unavailable' });
  }
});

app.get('/api/users/:id/balance', limiter, async (req, res) => {
  try {
    const response = await axios.get(`${services.auth}/api/users/${req.params.id}/balance`);
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('Get balance error', error);
    res.status(error.response?.status || 503).json(error.response?.data || { error: 'Auth service unavailable' });
  }
});

app.use('/api/auth', limiter, createProxyMiddleware({
  target: services.auth,
  changeOrigin: true,
  pathRewrite: {
    '^/api/auth': '/api/auth',
  },
  onError: (err, req, res) => {
    logger.error('Auth service proxy error', err);
    res.status(503).json({ error: 'Auth service unavailable' });
  },
}));

// Campaign routes - with special handling for totals
app.use('/api/campaigns', limiter, optionalAuth, async (req, res, next) => {
  // Route /totals to totals service using axios
  if (req.path.includes('/totals')) {
    try {
      const url = `${services.totals}/api/campaigns${req.path}`;
      const response = await axios.get(url);
      return res.status(response.status).json(response.data);
    } catch (error) {
      logger.error('Totals service error', error);
      return res.status(503).json({ error: 'Totals service unavailable' });
    }
  }
  // Route everything else to campaign service via proxy
  next();
});

app.use('/api/campaigns', createProxyMiddleware({
  target: services.campaign,
  changeOrigin: true,
  pathRewrite: {
    '^/api/campaigns': '/api/campaigns',
  },
  onError: (err, req, res) => {
    logger.error('Campaign service proxy error', err);
    res.status(503).json({ error: 'Campaign service unavailable' });
  },
}));

// Pledge routes - optional auth (guests can donate)
app.post('/api/pledges', limiter, optionalAuth, async (req, res) => {
  try {
    const headers = {
      'idempotency-key': req.headers['idempotency-key'],
    };
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    
    const response = await axios.post(`${services.pledge}/api/pledges`, req.body, { headers });
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('Pledge creation error', error);
    res.status(error.response?.status || 503).json(error.response?.data || { error: 'Pledge service unavailable' });
  }
});

// Process pledge payment
app.post('/api/pledges/:id/process', limiter, optionalAuth, async (req, res) => {
  try {
    const headers = {};
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    
    const response = await axios.post(`${services.pledge}/api/pledges/${req.params.id}/process`, req.body, { headers });
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('Pledge processing error', error);
    res.status(error.response?.status || 503).json(error.response?.data || { error: 'Pledge service unavailable' });
  }
});

app.use('/api/pledges', limiter, optionalAuth, createProxyMiddleware({
  target: services.pledge,
  changeOrigin: true,
  pathRewrite: {
    '^/api/pledges': '/api/pledges',
  },
  onError: (err, req, res) => {
    logger.error('Pledge service proxy error', err);
    res.status(503).json({ error: 'Pledge service unavailable' });
  },
}));

// SSLCommerz payment initiation - MUST be before payment proxy
app.post('/api/payments/sslcommerz/init', limiter, optionalAuth, async (req, res) => {
  try {
    const response = await axios.post(`${services.payment}/api/payments/sslcommerz/init`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('SSLCommerz init error', error);
    res.status(error.response?.status || 503).json(error.response?.data || { error: 'Payment service unavailable' });
  }
});

// Payment routes - proxy to payment service (webhooks, callbacks)
app.use('/api/payments', limiter, createProxyMiddleware({
  target: services.payment,
  changeOrigin: true,
  pathRewrite: {
    '^/api/payments': '/api/payments',
  },
  onError: (err, req, res) => {
    logger.error('Payment service proxy error', err);
    res.status(503).json({ error: 'Payment service unavailable' });
  },
}));

// Totals routes - public
app.use('/api/totals', limiter, createProxyMiddleware({
  target: services.totals,
  changeOrigin: true,
  pathRewrite: {
    '^/api/totals': '/api/campaigns',
  },
  onError: (err, req, res) => {
    logger.error('Totals service proxy error', err);
    res.status(503).json({ error: 'Totals service unavailable' });
  },
}));

// Admin routes - admin auth required
app.use('/api/admin', limiter, authMiddleware, (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}, createProxyMiddleware({
  target: services.admin,
  changeOrigin: true,
  pathRewrite: {
    '^/api/admin': '/api/admin',
  },
  onError: (err, req, res) => {
    logger.error('Admin service proxy error', err);
    res.status(503).json({ error: 'Admin service unavailable' });
  },
}));

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  logger.error('Gateway error', err);
  res.status(500).json({ error: { message: err.message } });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info('Service endpoints:', services);
});

module.exports = app;
