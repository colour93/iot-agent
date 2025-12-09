import { Router } from 'express';
import { callLLM, chatWithTools } from '../services/llmService.js';
import { DataSource } from 'typeorm';
import { MqttClient } from 'mqtt';

export function createLlmRoutes(dataSource: DataSource, mqttClient: MqttClient) {
  const router = Router();

  router.post('/homes/:homeId/llm/front', async (req, res) => {
    const { prompt, context } = req.body;
    const text = await callLLM(dataSource, req.params.homeId, 'front', prompt, context);
    res.json({ text });
  });

  router.post('/homes/:homeId/llm/back', async (req, res) => {
    const { prompt, context } = req.body;
    const text = await callLLM(dataSource, req.params.homeId, 'back', prompt, context);
    res.json({ text });
  });

  router.post('/homes/:homeId/llm/chat', async (req, res) => {
    const { messages = [] } = req.body;
    const result = await chatWithTools(dataSource, mqttClient, req.params.homeId, messages);
    res.json(result);
  });

  return router;
}

