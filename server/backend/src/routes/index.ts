import { Express } from 'express';
import { DataSource } from 'typeorm';
import { createHomeRoutes } from './homeRoutes.js';
import { createDeviceRoutes } from './deviceRoutes.js';
import { createAutomationRoutes } from './automationRoutes.js';
import { createLlmRoutes } from './llmRoutes.js';
import { MqttClient } from 'mqtt';
import { createAuthRoutes } from './authRoutes.js';
import { authMiddleware } from '../middleware/auth.js';
import { createMetricsRoutes } from './metricsRoutes.js';
import { createPingRoutes } from './pingRoutes.js';

export function registerRoutes(app: Express, dataSource: DataSource, mqttClient: MqttClient) {
  app.use('/api', createPingRoutes());
  app.use('/api', createAuthRoutes(dataSource));
  // 之后的路由均需要 JWT
  app.use('/api', authMiddleware);
  app.use('/api', createHomeRoutes(dataSource));
  app.use('/api', createDeviceRoutes(dataSource, mqttClient));
  app.use('/api', createAutomationRoutes(dataSource, mqttClient));
  app.use('/api', createLlmRoutes(dataSource, mqttClient));
  app.use('/api', createMetricsRoutes(dataSource));
}

