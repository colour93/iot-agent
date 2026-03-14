import { Router } from 'express';
import { DataSource } from 'typeorm';
import { AutomationRun, AuditLog, Command, Device, Home, LLMInvocation } from '../entities/index.js';
import { mqttState } from '../state/mqttState.js';
import { config } from '../config/env.js';
import { writeAuditLog } from '../services/auditService.js';

type MetricsSummary = {
  onlineDevices: number;
  totalCommands: number;
  ackedCommands: number;
  failedCommands: number;
  timeoutCommands: number;
  commandSuccessRate: number;
  totalAutomationRuns: number;
  succeededAutomationRuns: number;
  failedAutomationRuns: number;
  automationSuccessRate: number;
  totalLlmInvocations: number;
  failedLlmInvocations: number;
  llmFailureRate: number;
};

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

async function ensureHomeAccess(
  dataSource: DataSource,
  req: any,
  res: any,
  action: string,
) {
  const homeId = req.params.homeId;
  const allowed = await canAccessHome(dataSource, req, homeId);
  await writeAuditLog(dataSource, {
    req,
    action,
    target: `home:${homeId}`,
    homeId,
    result: allowed ? 'allow' : 'deny',
  });
  if (!allowed) {
    res.status(403).json({ code: 403, msg: 'forbidden' });
    return false;
  }
  return true;
}

async function countLlmFailures(dataSource: DataSource, homeId?: string) {
  const qb = dataSource
    .getRepository(LLMInvocation)
    .createQueryBuilder('invocation')
    .where(`invocation.output ->> 'error' IS NOT NULL`);
  if (homeId) {
    qb.andWhere('invocation.homeId = :homeId', { homeId });
  }
  return qb.getCount();
}

async function buildSummary(dataSource: DataSource, homeId?: string): Promise<MetricsSummary> {
  const deviceRepo = dataSource.getRepository(Device);
  const cmdRepo = dataSource.getRepository(Command);
  const automationRunRepo = dataSource.getRepository(AutomationRun);
  const llmRepo = dataSource.getRepository(LLMInvocation);

  const deviceWhere = homeId
    ? ({ status: 'online', room: { home: { id: homeId } } } as any)
    : ({ status: 'online' } as any);
  const commandBaseWhere = homeId ? ({ homeId } as any) : ({} as any);
  const automationWhere = homeId ? ({ automation: { home: { id: homeId } } } as any) : ({} as any);
  const llmWhere = homeId ? ({ home: { id: homeId } } as any) : ({} as any);

  const [
    online,
    commands,
    ackedCommands,
    failedCommands,
    timeoutCommands,
    automationRuns,
    automationSucceeded,
    automationFailed,
    llmInvocations,
    llmFailed,
  ] = await Promise.all([
    deviceRepo.count({ where: deviceWhere }),
    cmdRepo.count({ where: commandBaseWhere }),
    cmdRepo.count({ where: { ...commandBaseWhere, status: 'acked' } }),
    cmdRepo.count({ where: { ...commandBaseWhere, status: 'failed' } }),
    cmdRepo.count({ where: { ...commandBaseWhere, status: 'timeout' } }),
    automationRunRepo.count({ where: automationWhere }),
    automationRunRepo.count({ where: { ...automationWhere, status: 'succeeded' } }),
    automationRunRepo.count({ where: { ...automationWhere, status: 'failed' } }),
    llmRepo.count({ where: llmWhere }),
    countLlmFailures(dataSource, homeId),
  ]);

  const commandTerminalCount = ackedCommands + failedCommands + timeoutCommands;
  const commandSuccessRate =
    commandTerminalCount > 0 ? Number((ackedCommands / commandTerminalCount).toFixed(4)) : 0;
  const automationSuccessRate =
    automationRuns > 0 ? Number((automationSucceeded / automationRuns).toFixed(4)) : 0;
  const llmFailureRate = llmInvocations > 0 ? Number((llmFailed / llmInvocations).toFixed(4)) : 0;

  return {
    onlineDevices: online,
    totalCommands: commands,
    ackedCommands,
    failedCommands,
    timeoutCommands,
    commandSuccessRate,
    totalAutomationRuns: automationRuns,
    succeededAutomationRuns: automationSucceeded,
    failedAutomationRuns: automationFailed,
    automationSuccessRate,
    totalLlmInvocations: llmInvocations,
    failedLlmInvocations: llmFailed,
    llmFailureRate,
  };
}

function buildAlerts(summary: MetricsSummary) {
  const alerts: Array<{
    id: string;
    severity: 'info' | 'warn' | 'critical';
    metric: string;
    value: number | boolean;
    threshold: number | boolean;
    message: string;
  }> = [];

  if (summary.totalCommands > 0) {
    const min = config.observability.alertThresholds.commandSuccessRateMin;
    if (summary.commandSuccessRate < min) {
      alerts.push({
        id: 'command_success_rate',
        severity: 'warn',
        metric: 'commandSuccessRate',
        value: summary.commandSuccessRate,
        threshold: min,
        message: '命令成功率低于阈值',
      });
    }
  }

  if (summary.totalAutomationRuns > 0) {
    const failedRate = Number(
      (summary.failedAutomationRuns / summary.totalAutomationRuns).toFixed(4),
    );
    const max = config.observability.alertThresholds.automationFailureRateMax;
    if (failedRate > max) {
      alerts.push({
        id: 'automation_failure_rate',
        severity: 'warn',
        metric: 'automationFailureRate',
        value: failedRate,
        threshold: max,
        message: '自动化失败率高于阈值',
      });
    }
  }

  if (summary.totalLlmInvocations > 0) {
    const max = config.observability.alertThresholds.llmFailureRateMax;
    if (summary.llmFailureRate > max) {
      alerts.push({
        id: 'llm_failure_rate',
        severity: 'warn',
        metric: 'llmFailureRate',
        value: summary.llmFailureRate,
        threshold: max,
        message: 'LLM 失败率高于阈值',
      });
    }
  }

  if (config.observability.alertThresholds.requireMqttConnected && !mqttState.connected) {
    alerts.push({
      id: 'mqtt_disconnected',
      severity: 'critical',
      metric: 'mqtt.connected',
      value: false,
      threshold: true,
      message: 'MQTT 当前未连接',
    });
  }

  return alerts;
}

function getQueryString(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0].trim() : '';
  return typeof value === 'string' ? value.trim() : '';
}

export function createMetricsRoutes(dataSource: DataSource) {
  const router = Router();

  router.get('/metrics/summary', async (_req, res) => {
    const summary = await buildSummary(dataSource);
    res.json(summary);
  });

  router.get('/metrics/alerts', async (_req, res) => {
    const summary = await buildSummary(dataSource);
    res.json({
      alerts: buildAlerts(summary),
      generatedAt: new Date().toISOString(),
    });
  });

  router.get('/homes/:homeId/metrics/summary', async (req, res) => {
    if (!(await ensureHomeAccess(dataSource, req, res, 'metrics.summary.home'))) return;
    const summary = await buildSummary(dataSource, req.params.homeId);
    res.json(summary);
  });

  router.get('/homes/:homeId/metrics/alerts', async (req, res) => {
    if (!(await ensureHomeAccess(dataSource, req, res, 'metrics.alerts.home'))) return;
    const summary = await buildSummary(dataSource, req.params.homeId);
    res.json({
      alerts: buildAlerts(summary),
      generatedAt: new Date().toISOString(),
    });
  });

  router.get('/homes/:homeId/audit-logs', async (req, res) => {
    if (!(await ensureHomeAccess(dataSource, req, res, 'audit.logs.home.list'))) return;

    const limitRaw = Number(getQueryString(req.query.limit) || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 50;
    const action = getQueryString(req.query.action);
    const result = getQueryString(req.query.result);

    const repo = dataSource.getRepository(AuditLog);
    const qb = repo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .where(`log.meta ->> 'homeId' = :homeId`, { homeId: req.params.homeId })
      .orderBy('log.createdAt', 'DESC')
      .take(limit);
    if (action) {
      qb.andWhere('log.action = :action', { action });
    }
    if (result) {
      qb.andWhere(`log.meta ->> 'result' = :result`, { result });
    }
    const logs = await qb.getMany();

    res.json({
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        target: log.target ?? null,
        meta: log.meta ?? {},
        userId: log.user?.id ?? null,
        userEmail: log.user?.email ?? null,
        createdAt: log.createdAt.toISOString(),
      })),
      limit,
    });
  });

  router.get('/metrics/mqtt', (_req, res) => {
    res.json({
      connected: mqttState.connected,
      lastError: mqttState.lastError,
    });
  });

  return router;
}
