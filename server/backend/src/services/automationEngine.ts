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
import { buildExternalContext } from './externalDataService.js';

const CRON_FIELD_RANGES = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 },
} as const;

function resolveContextDate(ctx: Record<string, unknown>) {
  const ts = ctx['ts'];
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    const millis = ts > 1_000_000_000_000 ? ts : ts * 1000;
    return new Date(millis);
  }
  const now = ctx['now'];
  if (typeof now === 'string' && now.trim()) {
    const parsed = new Date(now);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function parseCronPart(part: string) {
  const value = part.trim();
  if (!value) return null;
  return value.split(',').map((segment) => segment.trim()).filter(Boolean);
}

function matchNumericSegment(segment: string, current: number, min: number, max: number) {
  const slashIndex = segment.indexOf('/');
  let rangePart = segment;
  let step = 1;
  if (slashIndex > -1) {
    rangePart = segment.slice(0, slashIndex);
    step = Number(segment.slice(slashIndex + 1));
    if (!Number.isInteger(step) || step <= 0) return false;
  }

  if (rangePart === '*') {
    return (current - min) % step === 0;
  }

  const dashIndex = rangePart.indexOf('-');
  if (dashIndex > -1) {
    const start = Number(rangePart.slice(0, dashIndex));
    const end = Number(rangePart.slice(dashIndex + 1));
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
    if (start < min || end > max || start > end) return false;
    if (current < start || current > end) return false;
    return (current - start) % step === 0;
  }

  const exact = Number(rangePart);
  if (!Number.isInteger(exact) || exact < min || exact > max) return false;
  if (current !== exact) return false;
  return true;
}

function matchCronField(field: string, current: number, min: number, max: number) {
  const parts = parseCronPart(field);
  if (!parts || parts.length === 0) return false;
  return parts.some((segment) => matchNumericSegment(segment, current, min, max));
}

function matchesCronExpression(cron: string, date: Date) {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return (
    matchCronField(
      minute,
      date.getMinutes(),
      CRON_FIELD_RANGES.minute.min,
      CRON_FIELD_RANGES.minute.max,
    ) &&
    matchCronField(
      hour,
      date.getHours(),
      CRON_FIELD_RANGES.hour.min,
      CRON_FIELD_RANGES.hour.max,
    ) &&
    matchCronField(
      dayOfMonth,
      date.getDate(),
      CRON_FIELD_RANGES.dayOfMonth.min,
      CRON_FIELD_RANGES.dayOfMonth.max,
    ) &&
    matchCronField(
      month,
      date.getMonth() + 1,
      CRON_FIELD_RANGES.month.min,
      CRON_FIELD_RANGES.month.max,
    ) &&
    matchCronField(
      dayOfWeek,
      date.getDay(),
      CRON_FIELD_RANGES.dayOfWeek.min,
      CRON_FIELD_RANGES.dayOfWeek.max,
    )
  );
}

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
    return matchesCronExpression(cond.cron, resolveContextDate(ctx));
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

async function hydrateAttrsContext(
  dataSource: DataSource,
  homeId: string,
  context: Record<string, unknown>,
) {
  const deviceRepo = dataSource.getRepository(Device);
  const devices = await deviceRepo.find({
    where: {
      room: {
        home: {
          id: homeId,
        },
      },
    } as any,
    relations: {
      snapshot: true,
    } as any,
  });

  for (const device of devices) {
    const attrs = device.snapshot?.attrs ?? {};
    for (const [key, value] of Object.entries(attrs)) {
      const deviceScopedKey = `${device.deviceId}.${key}`;
      if (!(key in context)) {
        context[key] = value;
      }
      if (!(deviceScopedKey in context)) {
        context[deviceScopedKey] = value;
      }
    }
  }
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
    await sendCommand(
      ctx.mqttClient,
      {
        deviceId: action.deviceId,
        homeId: ctx.homeId,
        roomId: device.room?.id ?? ctx.roomId,
      },
      {
        cmdId: cmd.cmdId,
        method: action.method,
        params: action.params,
        timeout: 5000,
      },
    );
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
  const evaluationContext: Record<string, unknown> = {
    ...triggerContext,
  };
  try {
    const externalContext = await buildExternalContext(dataSource, homeId);
    Object.assign(evaluationContext, externalContext);
  } catch (err) {
    logger.warn({ err, homeId }, 'hydrate external context failed');
  }
  await hydrateAttrsContext(dataSource, homeId, evaluationContext);

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
    const hit = rule.conditions.every((c) => evalCondition(c, evaluationContext));
    if (!hit) continue;

    const run = runRepo.create({
      automation,
      status: 'running',
      input: evaluationContext,
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
            roomId: (evaluationContext['roomId'] as string | undefined) ?? automation.scope,
            triggerContext: evaluationContext,
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
