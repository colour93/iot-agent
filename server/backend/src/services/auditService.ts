import { DataSource } from 'typeorm';
import { AuditLog } from '../entities/index.js';
import { logger } from '../logger.js';

export type AuditResult = 'allow' | 'deny' | 'success' | 'error';

type AuditRequestLike = {
  auth?: {
    userId?: string;
    role?: string;
  };
  method?: string;
  originalUrl?: string;
  ip?: string;
};

export type AuditLogInput = {
  req: AuditRequestLike;
  action: string;
  target?: string;
  homeId?: string;
  result?: AuditResult;
  meta?: Record<string, unknown>;
};

export async function writeAuditLog(dataSource: DataSource, input: AuditLogInput) {
  const repo = dataSource.getRepository(AuditLog);
  const payload: Record<string, unknown> = {
    action: input.action,
    target: input.target,
    meta: {
      ...(input.meta ?? {}),
      homeId: input.homeId ?? null,
      result: input.result ?? null,
      request: {
        method: input.req.method ?? null,
        path: input.req.originalUrl ?? null,
        ip: input.req.ip ?? null,
      },
      actor: {
        userId: input.req.auth?.userId ?? null,
        role: input.req.auth?.role ?? null,
      },
    },
  };

  if (input.req.auth?.userId) {
    payload.user = { id: input.req.auth.userId } as any;
  }

  try {
    const log = repo.create(payload as any);
    await repo.save(log);
  } catch (err) {
    logger.warn({ err, action: input.action, target: input.target }, 'write audit log failed');
  }
}
