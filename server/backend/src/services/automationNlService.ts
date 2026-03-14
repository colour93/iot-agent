import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGateway, generateObject, type LanguageModel } from 'ai';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { config } from '../config/env.js';
import { Device } from '../entities/index.js';
import { logger } from '../logger.js';
import { automationDefinitionSchema, type AutomationRule } from '../types/automation.js';

const generatedAutomationSchema = z.object({
  name: z.string().min(1).max(80),
  scope: z.string().min(1).optional(),
  definition: automationDefinitionSchema,
});

type GeneratedAutomation = {
  name: string;
  scope?: string;
  definition: AutomationRule;
};

function normalizeProvider(value: string) {
  return value.trim().toLowerCase() === 'gateway' ? 'gateway' : 'openai';
}

function resolveModel(): LanguageModel | null {
  const apiKey = config.llm.apiKey.trim();
  if (!apiKey) return null;

  const provider = normalizeProvider(config.llm.provider);
  const rawModel = config.llm.model.trim();

  if (provider === 'openai') {
    const openaiCompatible = createOpenAICompatible({
      name: 'openai-compatible',
      apiKey,
      baseURL: config.llm.baseUrl || 'https://api.openai.com/v1',
    });
    const modelName = rawModel.startsWith('openai/')
      ? rawModel.slice('openai/'.length)
      : rawModel || 'gpt-4o-mini';
    return openaiCompatible(modelName);
  }

  const gateway = createGateway({
    apiKey,
    baseURL: config.llm.baseUrl || undefined,
  });
  return gateway((rawModel || 'openai/gpt-4o-mini') as any);
}

function buildFallbackRule(prompt: string, devices: Device[]): GeneratedAutomation {
  const normalizedPrompt = prompt.toLowerCase();
  const sourceDevice = devices.find((device) => device.category !== 'actuator') ?? devices[0];
  const targetDevice = devices.find((device) => device.category !== 'sensor') ?? devices[0];

  const valueMatch = normalizedPrompt.match(/-?\d+(\.\d+)?/);
  const numericValue = valueMatch ? Number(valueMatch[0]) : undefined;

  const path = normalizedPrompt.includes('湿度') || normalizedPrompt.includes('humidity')
    ? 'humidity'
    : normalizedPrompt.includes('光') || normalizedPrompt.includes('light')
      ? 'light'
      : 'temperature';
  const op =
    normalizedPrompt.includes('低于') ||
    normalizedPrompt.includes('小于') ||
    normalizedPrompt.includes('below') ||
    normalizedPrompt.includes('less')
      ? 'lt'
      : 'gt';
  const conditionValue =
    typeof numericValue === 'number' && Number.isFinite(numericValue)
      ? numericValue
      : path === 'humidity'
        ? 40
        : 28;

  let method = 'set_power';
  let params: Record<string, unknown> = { on: true };
  if (normalizedPrompt.includes('制冷') || normalizedPrompt.includes('cool')) {
    method = 'set_ac';
    params = { mode: 'cool', temp: 25 };
  } else if (normalizedPrompt.includes('加湿') || normalizedPrompt.includes('humid')) {
    method = 'set_humidifier';
    params = { on: true, level: 2 };
  } else if (normalizedPrompt.includes('灯') || normalizedPrompt.includes('light')) {
    method = 'set_led';
    params = { on: true };
  }

  const name = prompt.trim().slice(0, 32) || '自然语言自动化';

  return {
    name,
    definition: {
      conditions: [
        {
          kind: 'attr',
          deviceId: sourceDevice.deviceId,
          path,
          op,
          value: conditionValue,
        },
      ],
      actions: [
        {
          kind: 'command',
          deviceId: targetDevice.deviceId,
          method,
          params,
        },
      ],
    },
  };
}

export async function generateAutomationFromPrompt(
  dataSource: DataSource,
  homeId: string,
  prompt: string,
): Promise<GeneratedAutomation> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error('prompt_required');
  }

  const devices = await dataSource.getRepository(Device).find({
    where: {
      room: {
        home: {
          id: homeId,
        },
      },
    } as any,
    relations: {
      room: true,
      capabilities: true,
    } as any,
    order: {
      createdAt: 'ASC',
    },
  });

  if (devices.length === 0) {
    throw new Error('no_devices_found');
  }

  const model = resolveModel();
  if (!model) {
    return buildFallbackRule(trimmedPrompt, devices);
  }

  const deviceContext = devices.map((device) => ({
    deviceId: device.deviceId,
    name: device.name,
    category: device.category,
    type: device.type ?? null,
    roomId: device.room?.id ?? null,
    roomName: device.room?.name ?? null,
    capabilities:
      device.capabilities?.map((capability) => ({
        kind: capability.kind,
        name: capability.name,
      })) ?? [],
  }));

  try {
    const { object } = await generateObject({
      model,
      schema: generatedAutomationSchema,
      schemaName: 'home_automation_rule',
      temperature: 0.1,
      prompt: [
        '你是智能家居自动化规则生成器。',
        `当前家庭 homeId=${homeId}。`,
        '请根据用户需求输出可执行的确定性 JSON 自动化规则。',
        '规则必须只使用已有设备 deviceId；conditions/actions 必须至少各 1 条。',
        '如果用户没有明确数值，使用合理默认值（温度 28、湿度 40）。',
        '保持规则简洁，不要添加解释文本。',
        '',
        `家庭设备清单：${JSON.stringify(deviceContext)}`,
        `用户需求：${trimmedPrompt}`,
      ].join('\n'),
    });

    return {
      name: object.name.trim(),
      scope: object.scope?.trim(),
      definition: object.definition,
    };
  } catch (err) {
    logger.warn({ err, homeId }, 'generate automation by nl failed, fallback to heuristic');
    return buildFallbackRule(trimmedPrompt, devices);
  }
}
