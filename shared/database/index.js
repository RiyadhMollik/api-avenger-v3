const { Sequelize } = require('sequelize');
const Logger = require('../logger');

class Database {
  constructor(config) {
    this.logger = new Logger('Database');
    this.config = config;
    this.sequelize = null;
  }

  async connect() {
    try {
      this.sequelize = new Sequelize(
        this.config.database,
        this.config.username,
        this.config.password,
        {
          host: this.config.host,
          port: this.config.port || 3306,
          dialect: 'mysql',
          logging: (msg) => this.logger.debug(msg),
          pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000,
          },
          retry: {
            max: 10,
            timeout: 3000,
          },
        }
      );

      await this.sequelize.authenticate();
      this.logger.info('Database connection established', {
        database: this.config.database,
        host: this.config.host,
      });

      return this.sequelize;
    } catch (error) {
      this.logger.error('Unable to connect to database', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.sequelize) {
      await this.sequelize.close();
      this.logger.info('Database connection closed');
    }
  }

  async sync(options = {}) {
    try {
      await this.sequelize.sync(options);
      this.logger.info('Database synchronized');
    } catch (error) {
      this.logger.error('Database sync failed', error);
      throw error;
    }
  }

  getSequelize() {
    return this.sequelize;
  }
}

module.exports = Database;
