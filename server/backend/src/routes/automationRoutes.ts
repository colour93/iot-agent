import { Router } from 'express';
import { DataSource } from 'typeorm';
import { Automation, Home } from '../entities/index.js';
import { evaluateAutomation } from '../services/automationEngine.js';
import { generateAutomationFromPrompt } from '../services/automationNlService.js';
import { automationDefinitionSchema } from '../types/automation.js';

async function canAccessHome(dataSource: DataSource, req: any, homeId: string) {
  if (req.auth?.role === 'admin') return true;
  if (req.auth?.homeIds?.includes(homeId)) return true;

  const home = await dataSource.getRepository(Home).findOne({
    where: {
      id: homeId,
      owner: { id: req.auth?.userId },
    } as any,
  });
  return !!home;
}

async function findAutomationForRequest(dataSource: DataSource, req: any, automationId: string) {
  const automation = await dataSource.getRepository(Automation).findOne({
    where: { id: automationId },
    relations: {
      home: {
        owner: true,
      },
    } as any,
  });
  if (!automation) return null;

  if (req.auth?.role === 'admin') return automation;
  if (req.auth?.homeIds?.includes(automation.home.id)) return automation;
  if (automation.home.owner?.id === req.auth?.userId) return automation;
  return null;
}

export function createAutomationRoutes(
  dataSource: DataSource,
  mqttClient: import('mqtt').MqttClient,
) {
  const router = Router();

  router.get('/homes/:homeId/automations', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }
    const list = await dataSource.getRepository(Automation).find({
      where: { home: { id: req.params.homeId } },
    });
    res.json(list);
  });

  router.post('/homes/:homeId/automations', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    if (typeof req.body?.name !== 'string' || !req.body.name.trim()) {
      return res.status(400).json({ code: 400, msg: 'name required' });
    }

    const parsedDefinition = automationDefinitionSchema.safeParse(req.body?.definition);
    if (!parsedDefinition.success) {
      return res.status(400).json({
        code: 400,
        msg: 'invalid automation definition',
        details: parsedDefinition.error.issues,
      });
    }

    const source = req.body?.source;
    if (source && source !== 'json' && source !== 'preset' && source !== 'nl') {
      return res.status(400).json({ code: 400, msg: 'invalid automation source' });
    }

    const repo = dataSource.getRepository(Automation);
    const auto = repo.create({
      home: { id: req.params.homeId } as any,
      name: req.body.name.trim(),
      enabled: req.body.enabled ?? true,
      source: source ?? 'json',
      definition: parsedDefinition.data,
      scope: req.body.scope,
    });
    await repo.save(auto);
    res.json(auto);
  });

  router.post('/homes/:homeId/automations/nl', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    if (typeof req.body?.prompt !== 'string' || !req.body.prompt.trim()) {
      return res.status(400).json({ code: 400, msg: 'prompt required' });
    }

    try {
      const generated = await generateAutomationFromPrompt(
        dataSource,
        req.params.homeId,
        req.body.prompt,
      );
      const automation = dataSource.getRepository(Automation).create({
        home: { id: req.params.homeId } as any,
        name: generated.name,
        enabled: req.body.enabled ?? true,
        source: 'nl',
        definition: generated.definition,
        scope: generated.scope,
      });
      await dataSource.getRepository(Automation).save(automation);

      return res.status(201).json({
        status: 'ok',
        automation,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'no_devices_found') {
        return res.status(400).json({ code: 400, msg: 'no devices found in home' });
      }
      throw err;
    }
  });

  router.patch('/automations/:id/toggle', async (req, res) => {
    const automation = await findAutomationForRequest(dataSource, req, req.params.id);
    if (!automation) return res.status(404).json({ error: 'not found' });
    automation.enabled = req.body.enabled;
    await dataSource.getRepository(Automation).save(automation);
    res.json(automation);
  });

  // 手动触发一次，用于测试
  router.post('/automations/:id/run', async (req, res) => {
    const automation = await findAutomationForRequest(dataSource, req, req.params.id);
    if (!automation) return res.status(404).json({ error: 'not found' });

    await evaluateAutomation(
      dataSource,
      mqttClient,
      automation.home.id,
      req.body.triggerContext || {},
      { automationId: automation.id },
    );
    res.json({ status: 'triggered' });
  });

  return router;
}
