import { Router } from 'express';
import { callLLM, chatWithTools, streamChatWithTools } from '../services/llmService.js';
import { DataSource } from 'typeorm';
import { MqttClient } from 'mqtt';
import { Home } from '../entities/index.js';
import { logger } from '../logger.js';
import {
  createChatSession,
  deleteChatSession,
  getChatSessionWithMessages,
  listChatSessions,
  replaceChatSessionMessages,
  updateChatSessionTitle,
} from '../services/chatHistoryService.js';

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

  router.get('/homes/:homeId/llm/chat/sessions', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    const sessions = await listChatSessions(dataSource, req.params.homeId);
    res.json({ sessions });
  });

  router.post('/homes/:homeId/llm/chat/sessions', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    const session = await createChatSession(dataSource, {
      homeId: req.params.homeId,
      title: typeof req.body?.title === 'string' ? req.body.title : undefined,
    });
    res.status(201).json(session);
  });

  router.get('/homes/:homeId/llm/chat/sessions/:sessionId', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    const detail = await getChatSessionWithMessages(
      dataSource,
      req.params.homeId,
      req.params.sessionId,
    );
    if (!detail) {
      return res.status(404).json({ code: 404, msg: 'session not found' });
    }

    res.json(detail);
  });

  router.put('/homes/:homeId/llm/chat/sessions/:sessionId/messages', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    if (!Array.isArray(req.body?.messages)) {
      return res.status(400).json({ code: 400, msg: 'messages must be array' });
    }

    try {
      const detail = await replaceChatSessionMessages(dataSource, {
        homeId: req.params.homeId,
        sessionId: req.params.sessionId,
        messages: req.body.messages,
      });
      if (!detail) {
        return res.status(404).json({ code: 404, msg: 'session not found' });
      }
      return res.json(detail);
    } catch (err) {
      if (err instanceof Error && err.message === 'invalid_ui_messages') {
        return res.status(400).json({ code: 400, msg: 'messages_invalid' });
      }
      throw err;
    }
  });

  router.patch('/homes/:homeId/llm/chat/sessions/:sessionId', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    if (typeof req.body?.title !== 'string') {
      return res.status(400).json({ code: 400, msg: 'title required' });
    }

    try {
      const session = await updateChatSessionTitle(dataSource, {
        homeId: req.params.homeId,
        sessionId: req.params.sessionId,
        title: req.body.title,
      });
      if (!session) {
        return res.status(404).json({ code: 404, msg: 'session not found' });
      }
      return res.json(session);
    } catch (err) {
      if (err instanceof Error && err.message === 'invalid_title') {
        return res.status(400).json({ code: 400, msg: 'invalid_title' });
      }
      throw err;
    }
  });

  router.delete('/homes/:homeId/llm/chat/sessions/:sessionId', async (req, res) => {
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    const deleted = await deleteChatSession(dataSource, req.params.homeId, req.params.sessionId);
    if (!deleted) {
      return res.status(404).json({ code: 404, msg: 'session not found' });
    }

    res.json({ status: 'ok', sessionId: req.params.sessionId });
  });

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

    const { messages = [], id } = req.body ?? {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ code: 400, msg: 'messages must be array' });
    }
    const sessionId = typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;

    try {
      await streamChatWithTools(dataSource, mqttClient, req.params.homeId, messages, res, {
        sessionId,
      });
    } catch (err) {
      logger.error({ err, homeId: req.params.homeId }, 'llm stream route failed');
      if (!res.headersSent) {
        res.status(500).json({ code: 500, msg: 'stream_failed' });
      }
    }
  });

  return router;
}
