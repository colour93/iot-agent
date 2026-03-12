import 'reflect-metadata';
import express from 'express';
import { initDataSource } from './db/data-source.js';
import { logger } from './logger.js';
import { config } from './config/env.js';
import { startMqttService } from './services/mqttService.js';
import { registerRoutes } from './routes/index.js';
import cors from 'cors';
import { initRedis } from './services/redisClient.js';
import { sweepCommandTimeouts, retryTimeouts } from './services/commandService.js';
import { errorHandler } from './middleware/errorHandler.js';

async function bootstrap() {
  const dataSource = await initDataSource();
  await initRedis();
  const mqttClient = startMqttService(dataSource);

  const app = express();
  app.use(
    cors({
      origin: config.cors?.origins ?? '*',
    }),
  );
  app.use(express.json());

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  registerRoutes(app, dataSource, mqttClient);

  app.use(errorHandler);

  app.listen(config.port, () => {
    logger.info(`Backend listening on ${config.port}`);
  });

  // 命令超时扫描
  setInterval(() => {
    sweepCommandTimeouts(dataSource, 5000).catch((err) => logger.error(err));
  }, 5000);
  setInterval(() => {
    retryTimeouts(dataSource, mqttClient, 5000, 2).catch((err) => logger.error(err));
  }, 10000);
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});

