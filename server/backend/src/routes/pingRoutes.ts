import { Router } from 'express';
import { redis } from '../services/redisClient.js';

export function createPingRoutes() {
  const router = Router();
  router.get('/ping', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));
  router.get('/ping/redis', async (_req, res) => {
    try {
      await redis.ping();
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ status: 'error', error: String(err) });
    }
  });
  return router;
}

