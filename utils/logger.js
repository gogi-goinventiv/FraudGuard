const { createLogger, format, transports } = require('winston');
require('winston-mongodb');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fraudguard';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'fraudguard-app' },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    new transports.MongoDB({
      level: 'info',
      db: mongoUri,
      options: { useUnifiedTopology: true },
      collection: 'logs',
      tryReconnect: true,
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      metaKey: 'meta',
    })
  ],
  exceptionHandlers: [
    new transports.Console(),
    new transports.MongoDB({
      db: mongoUri,
      options: { useUnifiedTopology: true },
      collection: 'logs',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      metaKey: 'meta',
    })
  ]
});

/**
 * Usage:
 * logger.info('message', { category: 'webhook-order-create', ...otherMeta })
 * logger.error('error message', { category: 'api-capture', ... })
 * This will help segregate logs by module/route/type in MongoDB.
 */
module.exports = logger; 