import pino from 'pino';
import { config } from './config/env.js';

const isProd = process.env.NODE_ENV === 'production';
const transport = isProd
  ? undefined
  : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
    },
  };

export const logger = pino({
  level: process.env.NODE_ENV === 'development' ? 'debug' : config.logLevel || 'info',
  transport,
});

logger.info('Logger initialized, level: ' + (process.env.NODE_ENV === 'development' ? 'debug' : config.logLevel || 'info'));
logger.info('Current environment: ' + process.env.NODE_ENV);