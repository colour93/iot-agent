import { Router } from 'express';
import { DataSource } from 'typeorm';
import { AutomationRun, Command, Device, LLMInvocation } from '../entities/index.js';
import { mqttState } from '../state/mqttState.js';

export function createMetricsRoutes(dataSource: DataSource) {
  const router = Router();

  router.get('/metrics/summary', async (_req, res) => {
    const deviceRepo = dataSource.getRepository(Device);
    const cmdRepo = dataSource.getRepository(Command);
    const automationRunRepo = dataSource.getRepository(AutomationRun);
    const llmRepo = dataSource.getRepository(LLMInvocation);

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
      deviceRepo.count({ where: { status: 'online' } }),
      cmdRepo.count(),
      cmdRepo.count({ where: { status: 'acked' } }),
      cmdRepo.count({ where: { status: 'failed' } }),
      cmdRepo.count({ where: { status: 'timeout' } }),
      automationRunRepo.count(),
      automationRunRepo.count({ where: { status: 'succeeded' } }),
      automationRunRepo.count({ where: { status: 'failed' } }),
      llmRepo.count(),
      llmRepo
        .createQueryBuilder('invocation')
        .where(`invocation.output ->> 'error' IS NOT NULL`)
        .getCount(),
    ]);

    const commandTerminalCount = ackedCommands + failedCommands + timeoutCommands;
    const commandSuccessRate =
      commandTerminalCount > 0 ? Number((ackedCommands / commandTerminalCount).toFixed(4)) : 0;
    const automationSuccessRate =
      automationRuns > 0 ? Number((automationSucceeded / automationRuns).toFixed(4)) : 0;
    const llmFailureRate =
      llmInvocations > 0 ? Number((llmFailed / llmInvocations).toFixed(4)) : 0;

    res.json({
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
