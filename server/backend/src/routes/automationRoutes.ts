import { Router } from 'express';
import { DataSource } from 'typeorm';
import { Automation } from '../entities/index.js';
import { evaluateAutomation } from '../services/automationEngine.js';

export function createAutomationRoutes(
  dataSource: DataSource,
  mqttClient: import('mqtt').MqttClient,
) {
  const router = Router();

  router.get('/homes/:homeId/automations', async (req, res) => {
    const list = await dataSource.getRepository(Automation).find({
      where: { home: { id: req.params.homeId } },
    });
    res.json(list);
  });

  router.post('/homes/:homeId/automations', async (req, res) => {
    const repo = dataSource.getRepository(Automation);
    const auto = repo.create({
      home: { id: req.params.homeId } as any,
      name: req.body.name,
      enabled: req.body.enabled ?? true,
      source: req.body.source ?? 'json',
      definition: req.body.definition,
      scope: req.body.scope,
    });
    await repo.save(auto);
    res.json(auto);
  });

  router.patch('/automations/:id/toggle', async (req, res) => {
    const repo = dataSource.getRepository(Automation);
    const automation = await repo.findOne({ where: { id: req.params.id } });
    if (!automation) return res.status(404).json({ error: 'not found' });
    automation.enabled = req.body.enabled;
    await repo.save(automation);
    res.json(automation);
  });

  // 手动触发一次，用于测试
  router.post('/automations/:id/run', async (req, res) => {
    const automation = await dataSource
      .getRepository(Automation)
      .findOne({ where: { id: req.params.id } });
    if (!automation) return res.status(404).json({ error: 'not found' });
    await evaluateAutomation(
      dataSource,
      mqttClient,
      automation.home.id,
      req.body.triggerContext || {},
    );
    res.json({ status: 'triggered' });
  });

  return router;
}

