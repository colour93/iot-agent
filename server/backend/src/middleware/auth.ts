import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export interface AuthPayload {
  userId: string;
  role: 'user' | 'admin';
  homeIds?: string[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}

export function homeGuard(param: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const homeId = req.params[param];
    if (!req.auth?.homeIds || !req.auth.homeIds.includes(homeId)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

export function issueToken(payload: AuthPayload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: '7d' });
}

