const winston = require('winston');
const { ElasticsearchTransport } = require('winston-elasticsearch');

class Logger {
  constructor(serviceName) {
    this.serviceName = serviceName;
    
    const transports = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${serviceName}] ${level}: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
            }`;
          })
        ),
      }),
    ];

    // Add Elasticsearch transport if configured
    if (process.env.ELASTICSEARCH_HOST) {
      transports.push(
        new ElasticsearchTransport({
          level: 'info',
          clientOpts: {
            node: process.env.ELASTICSEARCH_HOST,
            auth: {
              username: process.env.ELASTICSEARCH_USER || 'elastic',
              password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
            },
          },
          index: `logs-${serviceName}`,
        })
      );
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { 
        service: serviceName,
        environment: process.env.NODE_ENV || 'development',
      },
      transports,
    });
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  error(message, error = null, meta = {}) {
    this.logger.error(message, {
      ...meta,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : undefined,
    });
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  // For correlation IDs and tracing
  child(meta) {
    return {
      info: (message, extraMeta = {}) => this.info(message, { ...meta, ...extraMeta }),
      error: (message, error = null, extraMeta = {}) => this.error(message, error, { ...meta, ...extraMeta }),
      warn: (message, extraMeta = {}) => this.warn(message, { ...meta, ...extraMeta }),
      debug: (message, extraMeta = {}) => this.debug(message, { ...meta, ...extraMeta }),
    };
  }
}

module.exports = Logger;
