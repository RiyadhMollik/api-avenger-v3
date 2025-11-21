const winston = require('winston');
const LogstashTransport = require('./logstash-transport');

/**
 * Create a logger with Logstash transport
 * @param {string} serviceName - Name of the service
 * @param {object} options - Additional options
 * @returns {winston.Logger}
 */
function createLogger(serviceName, options = {}) {
  const transports = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  ];

  // Add Logstash transport if configured
  const logstashHost = options.logstashHost || process.env.LOGSTASH_HOST;
  const logstashPort = options.logstashPort || process.env.LOGSTASH_PORT || 5000;

  if (logstashHost) {
    transports.push(new LogstashTransport({
      host: logstashHost,
      port: parseInt(logstashPort),
      serviceName,
    }));
  }

  return winston.createLogger({
    level: options.level || process.env.LOG_LEVEL || 'info',
    format: winston.format.json(),
    defaultMeta: { service: serviceName },
    transports,
  });
}

module.exports = { createLogger };
