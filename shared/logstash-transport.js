const winston = require('winston');
const net = require('net');

/**
 * Winston transport for Logstash
 * Sends logs to Logstash via TCP
 */
class LogstashTransport extends winston.Transport {
  constructor(options = {}) {
    super(options);
    
    this.name = 'logstash';
    this.host = options.host || 'localhost';
    this.port = options.port || 5000;
    this.serviceName = options.serviceName || 'unknown-service';
    this.client = null;
    this.connected = false;
    this.reconnecting = false;
    
    this.connect();
  }

  connect() {
    if (this.reconnecting) return;
    
    this.reconnecting = true;
    this.client = new net.Socket();
    
    this.client.connect(this.port, this.host, () => {
      this.connected = true;
      this.reconnecting = false;
      console.log(`[Logstash] Connected to ${this.host}:${this.port}`);
    });
    
    this.client.on('error', (err) => {
      this.connected = false;
      console.error(`[Logstash] Connection error: ${err.message}`);
      this.reconnect();
    });
    
    this.client.on('close', () => {
      this.connected = false;
      console.log('[Logstash] Connection closed');
      this.reconnect();
    });
  }

  reconnect() {
    if (this.reconnecting) return;
    
    setTimeout(() => {
      console.log('[Logstash] Attempting to reconnect...');
      this.connect();
    }, 5000);
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    if (!this.connected) {
      return callback(null, true);
    }

    const logEntry = {
      '@timestamp': new Date().toISOString(),
      message: info.message,
      level: info.level,
      service: this.serviceName,
      ...info,
    };

    try {
      const logString = JSON.stringify(logEntry) + '\n';
      this.client.write(logString, (err) => {
        if (err) {
          console.error(`[Logstash] Write error: ${err.message}`);
        }
      });
    } catch (err) {
      console.error(`[Logstash] Serialization error: ${err.message}`);
    }

    callback(null, true);
  }

  close() {
    if (this.client) {
      this.client.destroy();
    }
  }
}

module.exports = LogstashTransport;
