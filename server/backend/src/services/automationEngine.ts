import { DataSource } from 'typeorm';
import { Automation, AutomationRun, Command, Device } from '../entities/index.js';
import { logger } from '../logger.js';
import {
  Action,
  AutomationRule,
  Condition,
  automationDefinitionSchema,
} from '../types/automation.js';
import { sendCommand } from './mqttService.js';
import mqtt from 'mqtt';
import crypto from 'crypto';
import { callLLM } from './llmService.js';

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
  ctx: {
    mqttClient: mqtt.MqttClient;
    homeId: string;
    roomId?: string;
    triggerContext: Record<string, unknown>;
  },
  dataSource: DataSource,
) {
  if (action.kind === 'command') {
    const deviceRepo = dataSource.getRepository(Device);
    const device = await deviceRepo.findOne({
      where: {
        deviceId: action.deviceId,
        room: {
          home: {
            id: ctx.homeId,
          },
        },
      } as any,
      relations: {
        room: true,
      } as any,
    });
    if (!device) {
      throw new Error(`automation target device not found: ${action.deviceId}`);
    }

    const cmdRepo = dataSource.getRepository(Command);
    const cmd = cmdRepo.create({
      cmdId: action.params['cmdId']?.toString() ?? crypto.randomUUID(),
      method: action.method,
      params: action.params,
      status: 'sent',
      device,
      homeId: ctx.homeId,
      roomId: device.room?.id ?? ctx.roomId,
      sentAt: new Date(),
    });
    await cmdRepo.save(cmd);
    await sendCommand(ctx.mqttClient, action.deviceId, {
      cmdId: cmd.cmdId,
      method: action.method,
      params: action.params,
      timeout: 5000,
    });
    return {
      kind: 'command',
      cmdId: cmd.cmdId,
      deviceId: action.deviceId,
      method: action.method,
      status: 'sent',
    };
  } else if (action.kind === 'notify') {
    logger.info({ message: action.message }, '[AUTO][notify]');
    return {
      kind: 'notify',
      channel: action.channel,
      message: action.message,
      status: 'logged',
    };
  } else if (action.kind === 'llm') {
    const text = await callLLM(
      dataSource,
      ctx.mqttClient,
      ctx.homeId,
      'back',
      action.prompt,
      ctx.triggerContext,
    );
    return {
      kind: 'llm',
      role: action.role,
      text,
    };
  }
}

export async function evaluateAutomation(
  dataSource: DataSource,
  mqttClient: mqtt.MqttClient,
  homeId: string,
  triggerContext: Record<string, unknown>,
  options: { automationId?: string } = {},
) {
  const automationRepo = dataSource.getRepository(Automation);
  const runRepo = dataSource.getRepository(AutomationRun);
  const where = options.automationId
    ? ({ id: options.automationId, home: { id: homeId }, enabled: true } as any)
    : ({ home: { id: homeId }, enabled: true } as any);
  const list = await automationRepo.find({ where });

  for (const automation of list) {
    const parsedDefinition = automationDefinitionSchema.safeParse(automation.definition);
    if (!parsedDefinition.success) {
      logger.warn(
        { automationId: automation.id, issues: parsedDefinition.error.issues },
        'Skip invalid automation definition',
      );
      continue;
    }

    const rule = parsedDefinition.data as AutomationRule;
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
      const actionResults: Array<Record<string, unknown> | undefined> = [];
      for (const action of rule.actions) {
        const result = await runAction(
          action,
          {
            mqttClient,
            homeId,
            roomId: (triggerContext['roomId'] as string | undefined) ?? automation.scope,
            triggerContext,
          },
          dataSource,
        );
        actionResults.push(result);
      }
      run.status = 'succeeded';
      run.output = { matched: true, actionResults };
    } catch (err) {
      logger.error({ err }, 'Automation run failed');
      run.status = 'failed';
      run.output = { error: String(err) };
    }
    await runRepo.save(run);
  }
}
