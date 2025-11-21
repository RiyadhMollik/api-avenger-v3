const request = require('supertest');
const { Sequelize } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock environment
process.env.DB_NAME = 'test_auth';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const app = require('../index');

describe('Auth Service', () => {
  let sequelize;
  let User;

  beforeAll(async () => {
    // Use in-memory SQLite for tests
    sequelize = new Sequelize('sqlite::memory:', { logging: false });
    
    User = sequelize.define('User', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      email: Sequelize.STRING,
      password: Sequelize.STRING,
      name: Sequelize.STRING,
      role: {
        type: Sequelize.ENUM('USER', 'ADMIN', 'ORGANIZER'),
        defaultValue: 'USER',
      },
      isGuest: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
    });

    await sequelize.sync();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await User.destroy({ truncate: true });
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.user.name).toBe('Test User');
    });

    it('should reject registration with missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password456',
          name: 'Another User',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      await User.create({
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
      });
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe('test@example.com');
    });

    it('should reject invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
    });

    it('should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/guest-login', () => {
    it('should create guest user without credentials', async () => {
      const res = await request(app)
        .post('/api/auth/guest-login')
        .send({
          name: 'Guest User',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.isGuest).toBe(true);
      expect(res.body.user.name).toBe('Guest User');
    });

    it('should create guest with auto-generated name if not provided', async () => {
      const res = await request(app)
        .post('/api/auth/guest-login')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.user.name).toMatch(/^Guest-/);
    });
  });

  describe('POST /api/auth/verify', () => {
    let validToken;

    beforeEach(async () => {
      const user = await User.create({
        email: 'test@example.com',
        name: 'Test User',
      });

      validToken = jwt.sign(
        { id: user.id, email: user.email, role: 'USER' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
    });

    it('should verify valid token', async () => {
      const res = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toHaveProperty('id');
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .post('/api/auth/verify');

      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('auth-service');
    });
  });
});
