const express = require('express');
const { Sequelize } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const promClient = require('prom-client');
const cors = require('cors');
const createUserModel = require('./models/User');

const app = express();
const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

app.use(cors());
app.use(express.json());

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'auth-service' },
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const authCounter = new promClient.Counter({
  name: 'auth_operations_total',
  help: 'Total auth operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

const sequelize = new Sequelize(
  process.env.DB_NAME || 'careforall_auth',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || 'rootpass123',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
  }
);

const User = createUserModel(sequelize);

function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      isGuest: user.isGuest,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'auth-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
      authCounter.inc({ operation: 'register', status: 'failed' });
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      authCounter.inc({ operation: 'register', status: 'failed' });
      return res.status(409).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      name,
      role: role || 'USER',
      isGuest: false,
    });

    const token = generateToken(user);
    authCounter.inc({ operation: 'register', status: 'success' });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        balance: user.balance,
      },
      token,
    });
  } catch (error) {
    authCounter.inc({ operation: 'register', status: 'error' });
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      authCounter.inc({ operation: 'login', status: 'failed' });
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      authCounter.inc({ operation: 'login', status: 'failed' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      authCounter.inc({ operation: 'login', status: 'failed' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await user.update({ lastLogin: new Date() });

    const token = generateToken(user);
    authCounter.inc({ operation: 'login', status: 'success' });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        balance: user.balance,
      },
      token,
    });
  } catch (error) {
    authCounter.inc({ operation: 'login', status: 'error' });
    next(error);
  }
});

app.post('/api/auth/guest-login', async (req, res, next) => {
  try {
    const { name } = req.body;

    const user = await User.create({
      name: name || `Guest-${Date.now()}`,
      role: 'USER',
      isGuest: true,
    });

    const token = generateToken(user);
    authCounter.inc({ operation: 'guest-login', status: 'success' });

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        isGuest: true,
      },
      token,
    });
  } catch (error) {
    authCounter.inc({ operation: 'guest-login', status: 'error' });
    next(error);
  }
});

app.post('/api/auth/verify', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isGuest: user.isGuest,
      },
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/users/:id', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Add balance to user account
app.post('/api/users/:id/balance/add', async (req, res, next) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newBalance = parseFloat(user.balance) + parseFloat(amount);
    await user.update({ balance: newBalance });

    logger.info('Balance added', { userId: user.id, amount, newBalance });

    res.json({
      userId: user.id,
      balance: newBalance,
      amountAdded: amount,
    });
  } catch (error) {
    next(error);
  }
});

// Deduct balance from user account
app.post('/api/users/:id/balance/deduct', async (req, res, next) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentBalance = parseFloat(user.balance);
    if (currentBalance < parseFloat(amount)) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        currentBalance,
        required: amount,
      });
    }

    const newBalance = currentBalance - parseFloat(amount);
    await user.update({ balance: newBalance });

    logger.info('Balance deducted', { userId: user.id, amount, newBalance });

    res.json({
      userId: user.id,
      balance: newBalance,
      amountDeducted: amount,
    });
  } catch (error) {
    next(error);
  }
});

// Get user balance
app.get('/api/users/:id/balance', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId: user.id,
      balance: user.balance,
    });
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

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Auth Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
