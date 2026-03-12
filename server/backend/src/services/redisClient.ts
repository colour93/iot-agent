import { createClient } from 'redis';
import { config } from '../config/env.js';
import { logger } from '../logger.js';

// 兼容带 ?password= 的 URL，避免 NOAUTH
const redisUrl = new URL(config.redis.url);
const redisPassword = redisUrl.password || redisUrl.searchParams.get('password') || undefined;

export const redis = createClient({
  url: redisUrl.toString(),
  password: redisPassword,
});

export async function initRedis() {
  if (redis.isOpen) return;
  try {
    logger.info('Connecting Redis...');
    await redis.connect();
    logger.info('Redis connected');
  } catch (err) {
    logger.error({ err }, 'Redis connection failed');
    throw err;
  }
}

