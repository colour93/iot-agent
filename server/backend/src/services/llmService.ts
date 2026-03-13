import { DataSource } from 'typeorm';
import { config } from '../config/env.js';
import {
  LLMSession,
  LLMInvocation,
  Device,
  Room,
  Command,
} from '../entities/index.js';
import { logger } from '../logger.js';
import { createGateway, generateText, tool, type LanguageModel } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { sendCommand } from './mqttService.js';
import { redis } from './redisClient.js';
import crypto from 'crypto';

type Role = 'front' | 'back';
type SupportedProvider = 'openai' | 'gateway';

type ResolvedModel =
  | { canCall: false; reason: string }
  | {
      canCall: true;
      model: LanguageModel;
      modelName: string;
      providerName: SupportedProvider;
    };

function normalizeProvider(value: string): SupportedProvider {
  return value.trim().toLowerCase() === 'gateway' ? 'gateway' : 'openai';
}

function normalizeModelForOpenAI(rawModel: string) {
  return rawModel.startsWith('openai/') ? rawModel.slice('openai/'.length) : rawModel;
}

function resolveConfiguredModel(): ResolvedModel {
  const apiKey = config.llm.apiKey.trim();
  if (!apiKey) {
    return { canCall: false, reason: 'missing_api_key' };
  }

  const provider = normalizeProvider(config.llm.provider);
  const rawModel = config.llm.model.trim();

  if (provider === 'openai') {
    const openaiCompatible = createOpenAICompatible({
      name: 'openai-compatible',
      apiKey,
      baseURL: config.llm.baseUrl || 'https://api.openai.com/v1',
    });
    const modelName = normalizeModelForOpenAI(rawModel || 'gpt-4o-mini');
    return {
      canCall: true,
      model: openaiCompatible(modelName),
      modelName,
      providerName: 'openai',
    };
  }

  const gateway = createGateway({
    apiKey,
    baseURL: config.llm.baseUrl || undefined,
  });
  const modelName = rawModel || 'openai/gpt-4o-mini';
  return {
    canCall: true,
    model: gateway(modelName as any),
    modelName,
    providerName: 'gateway',
  };
}

export async function getOrCreateSession(
  dataSource: DataSource,
  homeId: string,
  role: Role,
) {
  const repo = dataSource.getRepository(LLMSession);
  let session = await repo.findOne({ where: { home: { id: homeId }, role } });
  if (!session) {
    session = repo.create({ home: { id: homeId } as any, role, contextRef: `home-${homeId}-${role}` });
    await repo.save(session);
  }
  return session;
}

export async function callLLM(
  dataSource: DataSource,
  homeId: string,
  role: Role,
  prompt: string,
  context: Record<string, unknown> = {},
) {
  const session = await getOrCreateSession(dataSource, homeId, role);
  const invocationRepo = dataSource.getRepository(LLMInvocation);
  const input = { prompt, context };
  // Placeholder：如果未配置 API key，直接返回 echo
  const canCall = !!config.llm.apiKey;
  const model = config.llm.model || 'gpt-4o-mini';
  const outputText = canCall ? `[LLM ${role} ${model}] ${prompt}` : `[mock ${role}] ${prompt}`;
  const invocation = invocationRepo.create({
    session,
    home: { id: homeId } as any,
    role,
    input,
    output: { text: outputText },
    tokensIn: prompt.length / 4,
    tokensOut: outputText.length / 4,
    cost: 0,
    summary: outputText.slice(0, 80),
  });
  await invocationRepo.save(invocation);
  logger.info({ homeId, summary: invocation.summary }, `[LLM][${role}]`);
  return outputText;
}

export async function chatWithTools(
  dataSource: DataSource,
  mqttClient: import('mqtt').MqttClient,
  homeId: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
) {
  // 简单节流：每个家庭 60 秒最多 20 次
  const key = `llm:home:${homeId}:count`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, 60);
  }
  if (current > 20) {
    return { text: '已达到调用上限，请稍后再试。' };
  }

  const devicesRepo = dataSource.getRepository(Device);
  const roomsRepo = dataSource.getRepository(Room);

  const resolvedModel = resolveConfiguredModel();
  if (!resolvedModel.canCall) {
    // 无 API key 时的降级回复
    const devices = await devicesRepo.find({ where: { room: { home: { id: homeId } } as any } });
    const names = devices.map((d) => d.name || d.deviceId).join('、') || '暂无设备';
    return { text: `（mock 回复）当前家庭设备：${names}` };
  }

  const listDevicesTool = tool({
    description: '列出家庭下的设备列表',
    inputSchema: z.object({}),
    execute: async () => {
      const devices = await devicesRepo.find({ where: { room: { home: { id: homeId } } as any } });
      return devices.map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        roomId: d.room.id,
        status: d.status,
      }));
    },
  });

  const listRoomsTool = tool({
    description: '列出家庭下的房间',
    inputSchema: z.object({}),
    execute: async () => {
      const rooms = await roomsRepo.find({ where: { home: { id: homeId } } });
      return rooms.map((r) => ({ id: r.id, name: r.name }));
    },
  });

  const sendCommandTool = tool({
    description: '向设备下发命令',
    inputSchema: z.object({
      deviceId: z.string(),
      roomId: z.string().optional(),
      method: z.string(),
      params: z.record(z.any()).optional(),
    }),
    execute: async ({ deviceId, roomId, method, params }) => {
      const cmdId = crypto.randomUUID();
      await dataSource.getRepository(Command).save({
        cmdId,
        method,
        params: params || {},
        status: 'sent',
        device: { deviceId } as any,
        homeId,
        roomId,
        sentAt: new Date(),
      });
      await sendCommand(mqttClient, deviceId, {
        cmdId,
        method,
        params: params || {},
        timeout: 5000,
      });
      return { cmdId, status: 'sent' };
    },
  });

  try {
    logger.debug(
      {
        provider: resolvedModel.providerName,
        model: resolvedModel.modelName,
        hasBaseUrl: !!config.llm.baseUrl,
      },
      'LLM provider resolved',
    );
    const { text } = await generateText({
      model: resolvedModel.model,
      messages,
      temperature: 0.3,
      tools: {
        list_devices: listDevicesTool,
        list_rooms: listRoomsTool,
        send_command: sendCommandTool,
      },
      system: `你是智能家居助手，按需调用工具获取设备/房间信息或下发命令。回答用中文，简洁。`,
    });
    return { text };
  } catch (err) {
    logger.error({ err }, 'LLM error');
    return { text: '模型调用失败，请稍后重试。' };
  }
}

