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
import { startAutomationScheduler } from './services/automationScheduler.js';
import { refreshAllHomeExternalData } from './services/externalDataService.js';

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

  // 自动化时间调度（按分钟 tick）
  startAutomationScheduler(dataSource, mqttClient);

  // 外部数据（天气/季节）定时刷新
  setInterval(() => {
    refreshAllHomeExternalData(dataSource).catch((err) => logger.error({ err }, 'refresh external data failed'));
  }, 15 * 60 * 1000);
  refreshAllHomeExternalData(dataSource).catch((err) =>
    logger.warn({ err }, 'initial external data refresh failed'),
  );
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});

