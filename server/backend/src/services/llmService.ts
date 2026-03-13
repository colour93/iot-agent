import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  ToolLoopAgent,
  createGateway,
  pipeAgentUIStreamToResponse,
  stepCountIs,
  tool,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import crypto from 'crypto';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { config } from '../config/env.js';
import {
  Command,
  Device,
  DeviceEvent,
  LLMInvocation,
  LLMSession,
  Room,
  TelemetryLog,
} from '../entities/index.js';
import { logger } from '../logger.js';
import { redis } from './redisClient.js';
import { sendCommand } from './mqttService.js';

type Role = 'front' | 'back';
type SupportedProvider = 'openai' | 'gateway';
type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

type ResolvedModel =
  | { canCall: false; reason: string }
  | {
      canCall: true;
      model: LanguageModel;
      modelName: string;
      providerName: SupportedProvider;
    };

type AgentRunResult = {
  text: string;
  toolCalls: string[];
};

const COMMAND_TIMEOUT_MS = 5000;
const MAX_COMMAND_WAIT_MS = 10000;
const HISTORY_LIMIT = 24;
const HISTORY_TTL_SECONDS = 12 * 60 * 60;
const RATE_LIMIT_PER_MINUTE: Record<Role, number> = {
  front: 20,
  back: 40,
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

function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function normalizeMessages(messages: Array<{ role: string; content: string }>): ChatMessage[] {
  return messages
    .filter(
      (message): message is ChatMessage =>
        (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0,
    )
    .slice(-HISTORY_LIMIT)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

function memoryKey(homeId: string, role: Role) {
  return `llm:home:${homeId}:${role}:history`;
}

async function loadHistory(homeId: string, role: Role): Promise<ChatMessage[]> {
  try {
    const raw = await redis.get(memoryKey(homeId, role));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ role: string; content: string }>;
    return normalizeMessages(parsed);
  } catch (err) {
    logger.warn({ err, homeId, role }, 'load llm history failed');
    return [];
  }
}

async function saveHistory(homeId: string, role: Role, messages: ChatMessage[]) {
  const payload = JSON.stringify(messages.slice(-HISTORY_LIMIT));
  try {
    await redis.set(memoryKey(homeId, role), payload, { EX: HISTORY_TTL_SECONDS });
  } catch (err) {
    logger.warn({ err, homeId, role }, 'save llm history failed');
  }
}

function buildRoleInstructions(role: Role, homeId: string) {
  if (role === 'back') {
    return [
      '你是智能家居后台模型，负责根据家庭设备状态和事件做判断。',
      `当前仅可操作家庭 homeId=${homeId} 下的数据和设备。`,
      '涉及设备状态判断时，先调用工具读取实时数据，再给出结论。',
      '涉及设备控制时，优先确认目标设备，再调用工具执行命令并返回命令状态。',
      '回答简洁、明确、可执行，使用中文。',
    ].join('\n');
  }

  return [
    '你是智能家居前台助手，负责和用户进行设备查询与控制。',
    `当前仅可操作家庭 homeId=${homeId} 下的数据和设备。`,
    '不要臆测设备状态，必须先调用工具获取实时信息。',
    '执行设备控制后，要返回命令号和状态；若失败，解释原因并给出下一步建议。',
    '回答使用中文，清晰简洁。',
  ].join('\n');
}

function createHomeAgent(input: {
  dataSource: DataSource;
  mqttClient: import('mqtt').MqttClient;
  homeId: string;
  role: Role;
  model: LanguageModel;
}) {
  const tools = buildHomeTools(input.dataSource, input.mqttClient, input.homeId);
  return new ToolLoopAgent({
    model: input.model,
    instructions: buildRoleInstructions(input.role, input.homeId),
    tools,
    stopWhen: stepCountIs(8),
    temperature: 0.2,
  });
}

function extractAssistantTextFromUIMessage(message: UIMessage | undefined) {
  if (!message || !Array.isArray(message.parts)) return '';
  return message.parts
    .map((part) => {
      if (part.type !== 'text') return '';
      return typeof part.text === 'string' ? part.text : '';
    })
    .join('')
    .trim();
}

function mergePromptWithContext(prompt: string, context: Record<string, unknown>) {
  const keys = Object.keys(context ?? {});
  if (keys.length === 0) return prompt;

  try {
    return `${prompt}\n\n补充上下文(JSON)：\n${JSON.stringify(context)}`;
  } catch {
    return prompt;
  }
}

function isoDate(date: Date | undefined) {
  return date ? date.toISOString() : null;
}

function serializeCommand(command: Command) {
  return {
    cmdId: command.cmdId,
    method: command.method,
    status: command.status,
    retryCount: command.retryCount,
    error: command.error ?? null,
    result: command.result ?? null,
    sentAt: isoDate(command.sentAt),
    ackAt: isoDate(command.ackAt),
  };
}

async function waitForCommandFinalState(
  dataSource: DataSource,
  cmdId: string,
  waitMs: number,
): Promise<Command | null> {
  const repo = dataSource.getRepository(Command);
  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline) {
    const current = await repo.findOne({ where: { cmdId } });
    if (!current) return null;
    if (current.status === 'acked' || current.status === 'failed' || current.status === 'timeout') {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return repo.findOne({ where: { cmdId } });
}

function buildHomeTools(
  dataSource: DataSource,
  mqttClient: import('mqtt').MqttClient,
  homeId: string,
) {
  const devicesRepo = dataSource.getRepository(Device);
  const roomsRepo = dataSource.getRepository(Room);
  const commandsRepo = dataSource.getRepository(Command);
  const telemetryRepo = dataSource.getRepository(TelemetryLog);
  const eventsRepo = dataSource.getRepository(DeviceEvent);

  async function findHomeDevice(deviceId: string) {
    return devicesRepo.findOne({
      where: {
        deviceId,
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
    });
  }

  async function dispatchCommand(input: {
    deviceId: string;
    method: string;
    params?: Record<string, unknown>;
    awaitAckMs?: number;
  }) {
    const device = await findHomeDevice(input.deviceId);
    if (!device) {
      return {
        ok: false,
        error: 'device_not_found',
        deviceId: input.deviceId,
      };
    }

    const cmdId = crypto.randomUUID();
    const command = commandsRepo.create({
      cmdId,
      method: input.method,
      params: input.params ?? {},
      status: 'sent',
      device,
      homeId,
      roomId: device.room?.id,
      sentAt: new Date(),
    });
    await commandsRepo.save(command);

    await sendCommand(mqttClient, device.deviceId, {
      cmdId,
      method: input.method,
      params: input.params ?? {},
      timeout: COMMAND_TIMEOUT_MS,
    });

    const waitMs = Math.min(
      Math.max(input.awaitAckMs ?? 0, 0),
      MAX_COMMAND_WAIT_MS,
    );
    if (waitMs <= 0) {
      return {
        ok: true,
        command: serializeCommand(command),
      };
    }

    const finalState = await waitForCommandFinalState(dataSource, cmdId, waitMs);
    if (!finalState) {
      return {
        ok: false,
        error: 'command_not_found',
        cmdId,
      };
    }

    return {
      ok: true,
      command: serializeCommand(finalState),
    };
  }

  return {
    get_home_overview: tool({
      description: '读取当前家庭的房间和设备概要统计（房间数、设备数、在线设备数）。',
      inputSchema: z.object({}),
      execute: async () => {
        const rooms = await roomsRepo.find({
          where: { home: { id: homeId } },
          relations: {
            devices: true,
          } as any,
          order: {
            createdAt: 'ASC',
          },
        });
        const devicesCount = rooms.reduce((sum, room) => sum + (room.devices?.length ?? 0), 0);
        const onlineDevicesCount = rooms.reduce(
          (sum, room) => sum + (room.devices?.filter((device) => device.status === 'online').length ?? 0),
          0,
        );
        return {
          homeId,
          roomsCount: rooms.length,
          devicesCount,
          onlineDevicesCount,
        };
      },
    }),
    list_rooms: tool({
      description: '列出当前家庭的房间及其设备数量。',
      inputSchema: z.object({}),
      execute: async () => {
        const rooms = await roomsRepo.find({
          where: { home: { id: homeId } },
          relations: {
            devices: true,
          } as any,
          order: {
            createdAt: 'ASC',
          },
        });
        return rooms.map((room) => ({
          roomId: room.id,
          name: room.name,
          floor: room.floor ?? null,
          type: room.type ?? null,
          devicesCount: room.devices?.length ?? 0,
          onlineDevicesCount: room.devices?.filter((device) => device.status === 'online').length ?? 0,
        }));
      },
    }),
    list_devices: tool({
      description:
        '列出当前家庭设备，可按 roomId、在线状态、名称关键字过滤。返回设备基础信息、能力和最近属性快照。',
      inputSchema: z.object({
        roomId: z.string().min(1).optional(),
        status: z.enum(['online', 'offline']).optional(),
        keyword: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ roomId, status, keyword, limit }) => {
        const devices = await devicesRepo.find({
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
            snapshot: true,
          } as any,
          order: {
            createdAt: 'ASC',
          },
        });

        const normalizedKeyword = keyword?.trim().toLowerCase();
        const filtered = devices.filter((device) => {
          if (roomId && device.room?.id !== roomId) return false;
          if (status && device.status !== status) return false;
          if (
            normalizedKeyword &&
            !(device.name ?? '').toLowerCase().includes(normalizedKeyword) &&
            !device.deviceId.toLowerCase().includes(normalizedKeyword)
          ) {
            return false;
          }
          return true;
        });

        return filtered.slice(0, limit ?? 20).map((device) => ({
          deviceId: device.deviceId,
          name: device.name,
          type: device.type ?? null,
          category: device.category,
          status: device.status,
          roomId: device.room?.id ?? null,
          roomName: device.room?.name ?? null,
          lastSeen: isoDate(device.lastSeen),
          attrs: device.snapshot?.attrs ?? {},
          capabilities:
            device.capabilities?.map((capability) => ({
              kind: capability.kind,
              name: capability.name,
              schema: capability.schema ?? null,
            })) ?? [],
        }));
      },
    }),
    get_device_state: tool({
      description: '读取单个设备的最新状态、属性快照、能力定义和最近命令执行结果。',
      inputSchema: z.object({
        deviceId: z.string().min(1),
        recentCommandLimit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ deviceId, recentCommandLimit }) => {
        const device = await findHomeDevice(deviceId);
        if (!device) {
          return {
            ok: false,
            error: 'device_not_found',
            deviceId,
          };
        }

        const commands = await commandsRepo.find({
          where: {
            device: {
              id: device.id,
            },
          } as any,
          order: {
            createdAt: 'DESC',
          },
          take: recentCommandLimit ?? 5,
        });

        return {
          ok: true,
          device: {
            deviceId: device.deviceId,
            name: device.name,
            type: device.type ?? null,
            category: device.category,
            status: device.status,
            roomId: device.room?.id ?? null,
            roomName: device.room?.name ?? null,
            lastSeen: isoDate(device.lastSeen),
            attrs: device.snapshot?.attrs ?? {},
            capabilities:
              device.capabilities?.map((capability) => ({
                kind: capability.kind,
                name: capability.name,
                schema: capability.schema ?? null,
              })) ?? [],
          },
          recentCommands: commands.map(serializeCommand),
        };
      },
    }),
    get_recent_telemetry: tool({
      description: '查询设备最近遥测记录，用于分析趋势和异常。',
      inputSchema: z.object({
        deviceId: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ deviceId, limit }) => {
        const device = await findHomeDevice(deviceId);
        if (!device) {
          return {
            ok: false,
            error: 'device_not_found',
            deviceId,
          };
        }

        const logs = await telemetryRepo.find({
          where: {
            device: {
              id: device.id,
            },
          } as any,
          order: {
            ts: 'DESC',
          },
          take: limit ?? 20,
        });

        return {
          ok: true,
          deviceId,
          telemetry: logs.map((log) => ({
            ts: isoDate(log.ts),
            payload: log.payload,
          })),
        };
      },
    }),
    get_recent_events: tool({
      description: '查询设备最近事件日志（如 motion、door 等）。',
      inputSchema: z.object({
        deviceId: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ deviceId, limit }) => {
        const device = await findHomeDevice(deviceId);
        if (!device) {
          return {
            ok: false,
            error: 'device_not_found',
            deviceId,
          };
        }

        const events = await eventsRepo.find({
          where: {
            device: {
              id: device.id,
            },
          } as any,
          order: {
            ts: 'DESC',
          },
          take: limit ?? 20,
        });

        return {
          ok: true,
          deviceId,
          events: events.map((event) => ({
            eventType: event.eventType,
            params: event.params ?? {},
            ts: isoDate(event.ts),
          })),
        };
      },
    }),
    send_device_command: tool({
      description:
        '向设备下发命令。可指定 awaitAckMs 等待回执，返回命令号和执行状态。',
      inputSchema: z.object({
        deviceId: z.string().min(1),
        method: z.string().min(1),
        params: z.record(z.unknown()).optional(),
        awaitAckMs: z.number().int().min(0).max(MAX_COMMAND_WAIT_MS).optional(),
      }),
      execute: async ({ deviceId, method, params, awaitAckMs }) =>
        dispatchCommand({ deviceId, method, params, awaitAckMs }),
    }),
    get_command_status: tool({
      description: '根据 cmdId 查询命令执行状态，确认是否已回执。',
      inputSchema: z.object({
        cmdId: z.string().min(1),
      }),
      execute: async ({ cmdId }) => {
        const command = await commandsRepo.findOne({
          where: {
            cmdId,
            homeId,
          },
        });
        if (!command) {
          return {
            ok: false,
            error: 'command_not_found',
            cmdId,
          };
        }
        return {
          ok: true,
          command: serializeCommand(command),
        };
      },
    }),
  };
}

async function persistInvocation(
  dataSource: DataSource,
  payload: {
    session: LLMSession;
    homeId: string;
    role: Role;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    tokensIn?: number;
    tokensOut?: number;
  },
) {
  const invocationRepo = dataSource.getRepository(LLMInvocation);
  const summaryText = String(payload.output.text ?? payload.output.error ?? '').trim();
  const invocation = invocationRepo.create({
    session: payload.session,
    home: { id: payload.homeId } as any,
    role: payload.role,
    input: payload.input,
    output: payload.output,
    tokensIn: payload.tokensIn ?? 0,
    tokensOut: payload.tokensOut ?? 0,
    cost: 0,
    summary: summaryText.slice(0, 120) || undefined,
  });
  await invocationRepo.save(invocation);
}

async function enforceRateLimit(homeId: string, role: Role) {
  const key = `llm:home:${homeId}:${role}:count`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, 60);
  }
  return current <= RATE_LIMIT_PER_MINUTE[role];
}

async function runHomeAgent(input: {
  dataSource: DataSource;
  mqttClient: import('mqtt').MqttClient;
  homeId: string;
  role: Role;
  messages: ChatMessage[];
}) {
  const { dataSource, mqttClient, homeId, role, messages } = input;
  const session = await getOrCreateSession(dataSource, homeId, role);
  const allowed = await enforceRateLimit(homeId, role);
  if (!allowed) {
    const text = '调用过于频繁，请稍后再试。';
    await persistInvocation(dataSource, {
      session,
      homeId,
      role,
      input: { messages, reason: 'rate_limited' },
      output: { text },
    });
    return { text, toolCalls: [] } satisfies AgentRunResult;
  }

  const resolvedModel = resolveConfiguredModel();
  if (!resolvedModel.canCall) {
    const devices = await dataSource.getRepository(Device).find({
      where: {
        room: {
          home: {
            id: homeId,
          },
        },
      } as any,
      order: {
        createdAt: 'ASC',
      },
    });
    const list = devices.map((device) => device.name || device.deviceId).join('、') || '暂无设备';
    const text = `当前未配置 LLM API key，家庭设备：${list}`;
    await persistInvocation(dataSource, {
      session,
      homeId,
      role,
      input: { messages, reason: resolvedModel.reason },
      output: { text, mode: 'mock' },
      tokensIn: 0,
      tokensOut: 0,
    });
    return { text, toolCalls: [] } satisfies AgentRunResult;
  }

  const agent = createHomeAgent({
    dataSource,
    mqttClient,
    homeId,
    role,
    model: resolvedModel.model,
  });

  try {
    const result = await agent.generate({
      messages: toModelMessages(messages),
    });

    const toolCalls = Array.from(
      new Set(result.steps.flatMap((step) => step.toolCalls.map((toolCall) => toolCall.toolName))),
    );

    const text = result.text?.trim() || '已完成分析。';
    await persistInvocation(dataSource, {
      session,
      homeId,
      role,
      input: {
        messages,
        provider: resolvedModel.providerName,
        model: resolvedModel.modelName,
      },
      output: {
        text,
        finishReason: result.finishReason,
        toolCalls,
      },
      tokensIn: result.totalUsage.inputTokens ?? 0,
      tokensOut: result.totalUsage.outputTokens ?? 0,
    });

    return { text, toolCalls } satisfies AgentRunResult;
  } catch (err) {
    logger.error({ err, homeId, role }, 'llm agent call failed');
    const text = '模型调用失败，请稍后重试。';
    await persistInvocation(dataSource, {
      session,
      homeId,
      role,
      input: {
        messages,
        provider: resolvedModel.providerName,
        model: resolvedModel.modelName,
      },
      output: {
        text,
        error: String(err),
      },
    });
    return { text, toolCalls: [] } satisfies AgentRunResult;
  }
}

export async function getOrCreateSession(dataSource: DataSource, homeId: string, role: Role) {
  const repo = dataSource.getRepository(LLMSession);
  let session = await repo.findOne({ where: { home: { id: homeId }, role } });
  if (!session) {
    session = repo.create({
      home: { id: homeId } as any,
      role,
      contextRef: `home-${homeId}-${role}`,
    });
    await repo.save(session);
  }
  return session;
}

export async function callLLM(
  dataSource: DataSource,
  mqttClient: import('mqtt').MqttClient,
  homeId: string,
  role: Role,
  prompt: string,
  context: Record<string, unknown> = {},
) {
  const trimmedPrompt = prompt?.trim();
  if (!trimmedPrompt) {
    return '请输入有效问题。';
  }

  const history = await loadHistory(homeId, role);
  const mergedPrompt = mergePromptWithContext(trimmedPrompt, context);
  const nextUserMessage: ChatMessage = { role: 'user', content: mergedPrompt };
  const messages: ChatMessage[] = [...history, nextUserMessage].slice(-HISTORY_LIMIT);

  const result = await runHomeAgent({
    dataSource,
    mqttClient,
    homeId,
    role,
    messages,
  });

  await saveHistory(homeId, role, [...messages, { role: 'assistant', content: result.text }]);
  return result.text;
}

export async function chatWithTools(
  dataSource: DataSource,
  mqttClient: import('mqtt').MqttClient,
  homeId: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
) {
  const normalized = normalizeMessages(messages);
  const usableMessages = normalized.length > 0 ? normalized : await loadHistory(homeId, 'front');

  if (usableMessages.length === 0) {
    return { text: '请输入要执行的指令或问题。' };
  }

  const result = await runHomeAgent({
    dataSource,
    mqttClient,
    homeId,
    role: 'front',
    messages: usableMessages,
  });
  await saveHistory(homeId, 'front', [...usableMessages, { role: 'assistant', content: result.text }]);
  return { text: result.text, toolCalls: result.toolCalls };
}

export async function streamChatWithTools(
  dataSource: DataSource,
  mqttClient: import('mqtt').MqttClient,
  homeId: string,
  uiMessages: unknown[],
  response: Response,
) {
  const role: Role = 'front';
  const session = await getOrCreateSession(dataSource, homeId, role);
  const allowed = await enforceRateLimit(homeId, role);
  if (!allowed) {
    response.status(429).json({ code: 429, msg: 'rate_limited' });
    return;
  }

  const resolvedModel = resolveConfiguredModel();
  if (!resolvedModel.canCall) {
    response.status(503).json({ code: 503, msg: 'llm_not_configured' });
    return;
  }

  const agent = createHomeAgent({
    dataSource,
    mqttClient,
    homeId,
    role,
    model: resolvedModel.model,
  });

  let tokensIn = 0;
  let tokensOut = 0;
  const toolCalls = new Set<string>();

  await pipeAgentUIStreamToResponse({
    response,
    agent,
    uiMessages,
    onStepFinish: (stepResult) => {
      tokensIn += stepResult.usage.inputTokens ?? 0;
      tokensOut += stepResult.usage.outputTokens ?? 0;
      for (const call of stepResult.toolCalls) {
        toolCalls.add(call.toolName);
      }
    },
    onFinish: async ({ responseMessage, finishReason, isAborted, messages }) => {
      const text = extractAssistantTextFromUIMessage(responseMessage) || (isAborted ? 'response_aborted' : '');
      await persistInvocation(dataSource, {
        session,
        homeId,
        role,
        input: {
          mode: 'stream',
          provider: resolvedModel.providerName,
          model: resolvedModel.modelName,
          uiMessagesCount: Array.isArray(uiMessages) ? uiMessages.length : 0,
          totalMessages: messages.length,
        },
        output: {
          text,
          finishReason: finishReason ?? null,
          isAborted,
          toolCalls: Array.from(toolCalls),
        },
        tokensIn,
        tokensOut,
      });
    },
    onError: (error) => {
      logger.error({ err: error, homeId }, 'llm stream error');
      return 'stream_error';
    },
  });
}
