import { DataSource } from 'typeorm';
import { Automation, AutomationRun, Command } from '../entities/index.js';
import { logger } from '../logger.js';
import { Action, AutomationRule, Condition } from '../types/automation.js';
import { sendCommand } from './mqttService.js';
import mqtt from 'mqtt';
import crypto from 'crypto';

function evalCondition(cond: Condition, ctx: Record<string, unknown>): boolean {
  if (cond.kind === 'event') {
    return ctx['eventType'] === cond.eventType && ctx['deviceId'] === cond.deviceId;
  }
  if (cond.kind === 'attr') {
    const value = (ctx[`${cond.deviceId}.${cond.path}`] ??
      ctx[cond.path]) as number | string | boolean | undefined;
    if (value === undefined) return false;
    switch (cond.op) {
      case 'gt':
        return (value as number) > (cond.value as number);
      case 'gte':
        return (value as number) >= (cond.value as number);
      case 'lt':
        return (value as number) < (cond.value as number);
      case 'lte':
        return (value as number) <= (cond.value as number);
      case 'eq':
        return value === cond.value;
      default:
        return false;
    }
  }
  if (cond.kind === 'time') {
    // cron 预留：MVP 直接返回 true 交由调度层保证
    return true;
  }
  if (cond.kind === 'external') {
    const val = ctx[`external.${cond.source}.${cond.key}`];
    switch (cond.op) {
      case 'gt':
        return (val as number) > (cond.value as number);
      case 'gte':
        return (val as number) >= (cond.value as number);
      case 'lt':
        return (val as number) < (cond.value as number);
      case 'lte':
        return (val as number) <= (cond.value as number);
      case 'eq':
        return val === cond.value;
      default:
        return false;
    }
  }
  return false;
}

async function runAction(
  action: Action,
  ctx: { mqttClient: mqtt.MqttClient; homeId: string; roomId?: string },
  dataSource: DataSource,
) {
  if (action.kind === 'command') {
    const cmdRepo = dataSource.getRepository(Command);
    const cmd = cmdRepo.create({
      cmdId: action.params['cmdId']?.toString() ?? crypto.randomUUID(),
      method: action.method,
      params: action.params,
      status: 'sent',
      device: { deviceId: action.deviceId } as any,
      homeId: ctx.homeId,
      roomId: ctx.roomId,
      sentAt: new Date(),
    });
    await cmdRepo.save(cmd);
    await sendCommand(ctx.mqttClient, action.deviceId, {
      cmdId: cmd.cmdId,
      method: action.method,
      params: action.params,
      timeout: 5000,
    });
  } else if (action.kind === 'notify') {
    logger.info({ message: action.message }, '[AUTO][notify]');
  } else if (action.kind === 'llm') {
    logger.info({ prompt: action.prompt }, '[AUTO][llm prompt]');
  }
}

export async function evaluateAutomation(
  dataSource: DataSource,
  mqttClient: mqtt.MqttClient,
  homeId: string,
  triggerContext: Record<string, unknown>,
) {
  const automationRepo = dataSource.getRepository(Automation);
  const runRepo = dataSource.getRepository(AutomationRun);
  const list = await automationRepo.find({ where: { home: { id: homeId }, enabled: true } });
  for (const automation of list) {
    const rule = automation.definition as unknown as AutomationRule;
    if (!rule?.conditions?.length) continue;
    const hit = rule.conditions.every((c) => evalCondition(c, triggerContext));
    if (!hit) continue;
    const run = runRepo.create({
      automation,
      status: 'running',
      input: triggerContext,
      executedAt: new Date(),
    });
    await runRepo.save(run);
    try {
      for (const action of rule.actions) {
        await runAction(action, { mqttClient, homeId, roomId: automation.scope || triggerContext['roomId'] as string }, dataSource);
      }
      run.status = 'succeeded';
    } catch (err) {
      logger.error({ err }, 'Automation run failed');
      run.status = 'failed';
      run.output = { error: String(err) };
    }
    await runRepo.save(run);
  }
}

