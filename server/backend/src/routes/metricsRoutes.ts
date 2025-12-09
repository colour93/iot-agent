import { Router } from 'express';
import { DataSource } from 'typeorm';
import { Command, Device } from '../entities/index.js';
import { mqttState } from '../state/mqttState.js';

export function createMetricsRoutes(dataSource: DataSource) {
  const router = Router();

  router.get('/metrics/summary', async (_req, res) => {
    const deviceRepo = dataSource.getRepository(Device);
    const cmdRepo = dataSource.getRepository(Command);
    const [online, commands] = await Promise.all([
      deviceRepo.count({ where: { status: 'online' } }),
      cmdRepo.count(),
    ]);
    res.json({ onlineDevices: online, totalCommands: commands });
  });

  router.get('/metrics/mqtt', (_req, res) => {
    res.json({
      connected: mqttState.connected,
      lastError: mqttState.lastError,
    });
  });

  return router;
}