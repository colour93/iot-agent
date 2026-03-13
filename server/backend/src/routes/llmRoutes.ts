import { Router } from 'express';
import { callLLM, chatWithTools, streamChatWithTools } from '../services/llmService.js';
import { DataSource } from 'typeorm';
import { MqttClient } from 'mqtt';
import { Home } from '../entities/index.js';
import { logger } from '../logger.js';

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

export function createLlmRoutes(dataSource: DataSource, mqttClient: MqttClient) {
  const router = Router();

  router.post('/homes/:homeId/llm/front', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    const { prompt, context } = req.body;
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ code: 400, msg: 'prompt required' });
    }

    const text = await callLLM(dataSource, mqttClient, req.params.homeId, 'front', prompt, context);
    res.json({ text });
  });

  router.post('/homes/:homeId/llm/back', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    const { prompt, context } = req.body;
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ code: 400, msg: 'prompt required' });
    }

    const text = await callLLM(dataSource, mqttClient, req.params.homeId, 'back', prompt, context);
    res.json({ text });
  });

  router.post('/homes/:homeId/llm/chat', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    const { messages = [] } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ code: 400, msg: 'messages must be array' });
    }
    const result = await chatWithTools(dataSource, mqttClient, req.params.homeId, messages);
    res.json(result);
  });

  router.post('/homes/:homeId/llm/chat/stream', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    const { messages = [] } = req.body ?? {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ code: 400, msg: 'messages must be array' });
    }

    try {
      await streamChatWithTools(dataSource, mqttClient, req.params.homeId, messages, res);
    } catch (err) {
      logger.error({ err, homeId: req.params.homeId }, 'llm stream route failed');
      if (!res.headersSent) {
        res.status(500).json({ code: 500, msg: 'stream_failed' });
      }
    }
  });

  return router;
}
