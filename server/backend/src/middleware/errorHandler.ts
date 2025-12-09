import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  logger.error(err);
  const message = err instanceof Error ? err.message : 'internal error';
  res.status(500).json({ code: 500, msg: message });
}

