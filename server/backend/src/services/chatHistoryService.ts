import { safeValidateUIMessages, type UIMessage } from 'ai';
import { nanoid } from 'nanoid';
import { DataSource } from 'typeorm';
import { ChatMessage, ChatSession } from '../entities/index.js';
import { DEFAULT_CHAT_SESSION_TITLE } from '../entities/chatSession.js';
import { logger } from '../logger.js';

type CreateChatSessionInput = {
  homeId: string;
  title?: string;
  id?: string;
};

type EnsureChatSessionInput = {
  homeId: string;
  sessionId?: string;
  title?: string;
};

type ReplaceChatMessagesInput = {
  homeId: string;
  sessionId: string;
  messages: unknown;
};

export type ChatSessionSummary = {
  id: string;
  homeId: string;
  title: string;
  latestPreview: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toIso(value?: Date) {
  return value ? value.toISOString() : null;
}

function normalizeTitle(title?: string) {
  if (typeof title !== 'string') return undefined;
  const trimmed = title.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 64);
}

function trimPreview(text?: string) {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 140);
}

function extractTextFromMessage(message: UIMessage) {
  const text = message.parts
    .map((part) => {
      if (part.type !== 'text') return '';
      return typeof part.text === 'string' ? part.text : '';
    })
    .join(' ')
    .trim();
  return trimPreview(text);
}

function inferTitleFromMessages(messages: UIMessage[]) {
  const firstUser = messages.find((message) => message.role === 'user');
  return trimPreview(firstUser ? extractTextFromMessage(firstUser) : undefined)?.slice(0, 26);
}

function buildLatestPreview(messages: UIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const preview = extractTextFromMessage(messages[index]);
    if (preview) return preview;
  }
  return undefined;
}

function serializeChatSession(session: ChatSession): ChatSessionSummary {
  return {
    id: session.id,
    homeId: session.home?.id,
    title: session.title || DEFAULT_CHAT_SESSION_TITLE,
    latestPreview: session.latestPreview ?? null,
    messageCount: session.messageCount ?? 0,
    lastMessageAt: toIso(session.lastMessageAt),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

async function parseUiMessages(messages: unknown): Promise<UIMessage[]> {
  const result = await safeValidateUIMessages<UIMessage>({
    messages,
  });

  if (!result.success) {
    throw new Error('invalid_ui_messages');
  }

  return result.data;
}

async function findSession(
  dataSource: DataSource,
  homeId: string,
  sessionId: string,
) {
  return dataSource.getRepository(ChatSession).findOne({
    where: {
      id: sessionId,
      home: {
        id: homeId,
      },
    } as any,
  });
}

export async function listChatSessions(dataSource: DataSource, homeId: string) {
  const sessions = await dataSource.getRepository(ChatSession).find({
    where: {
      home: {
        id: homeId,
      },
    } as any,
    order: {
      lastMessageAt: 'DESC',
      updatedAt: 'DESC',
      createdAt: 'DESC',
    },
  });

  return sessions.map(serializeChatSession);
}

export async function createChatSession(
  dataSource: DataSource,
  input: CreateChatSessionInput,
) {
  const repo = dataSource.getRepository(ChatSession);
  const session = repo.create({
    id: input.id,
    home: {
      id: input.homeId,
    } as any,
    title: normalizeTitle(input.title) ?? DEFAULT_CHAT_SESSION_TITLE,
    messageCount: 0,
    latestPreview: undefined,
    lastMessageAt: undefined,
  });

  await repo.save(session);
  return serializeChatSession(session);
}

export async function ensureChatSession(
  dataSource: DataSource,
  input: EnsureChatSessionInput,
) {
  const repo = dataSource.getRepository(ChatSession);
  const normalizedTitle = normalizeTitle(input.title) ?? DEFAULT_CHAT_SESSION_TITLE;

  if (input.sessionId) {
    const existing = await repo.findOne({
      where: {
        id: input.sessionId,
        home: {
          id: input.homeId,
        },
      } as any,
    });

    if (existing) {
      return existing;
    }

    const occupied = await repo.findOne({
      where: {
        id: input.sessionId,
      },
    });
    if (occupied) {
      return null;
    }

    const created = repo.create({
      id: input.sessionId,
      home: {
        id: input.homeId,
      } as any,
      title: normalizedTitle,
      messageCount: 0,
      latestPreview: undefined,
      lastMessageAt: undefined,
    });
    await repo.save(created);
    return created;
  }

  const created = repo.create({
    home: {
      id: input.homeId,
    } as any,
    title: normalizedTitle,
    messageCount: 0,
    latestPreview: undefined,
    lastMessageAt: undefined,
  });
  await repo.save(created);
  return created;
}

export async function getChatSessionWithMessages(
  dataSource: DataSource,
  homeId: string,
  sessionId: string,
) {
  const session = await findSession(dataSource, homeId, sessionId);
  if (!session) return null;

  const messageEntities = await dataSource.getRepository(ChatMessage).find({
    where: {
      session: {
        id: session.id,
      },
    } as any,
    order: {
      sequence: 'ASC',
      createdAt: 'ASC',
    },
  });

  const payloads = messageEntities.map((message) => message.payload);
  const validation = await safeValidateUIMessages<UIMessage>({
    messages: payloads,
  });

  if (!validation.success) {
    logger.warn(
      { err: validation.error, homeId, sessionId },
      'chat session contains invalid ui messages',
    );
    return {
      session: serializeChatSession(session),
      messages: [] as UIMessage[],
    };
  }

  return {
    session: serializeChatSession(session),
    messages: validation.data,
  };
}

export async function updateChatSessionTitle(
  dataSource: DataSource,
  input: {
    homeId: string;
    sessionId: string;
    title: string;
  },
) {
  const session = await findSession(dataSource, input.homeId, input.sessionId);
  if (!session) return null;

  const nextTitle = normalizeTitle(input.title);
  if (!nextTitle) {
    throw new Error('invalid_title');
  }

  session.title = nextTitle;
  await dataSource.getRepository(ChatSession).save(session);
  return serializeChatSession(session);
}

export async function deleteChatSession(
  dataSource: DataSource,
  homeId: string,
  sessionId: string,
) {
  const session = await findSession(dataSource, homeId, sessionId);
  if (!session) return false;

  await dataSource.getRepository(ChatSession).remove(session);
  return true;
}

export async function replaceChatSessionMessages(
  dataSource: DataSource,
  input: ReplaceChatMessagesInput,
) {
  const normalizedMessages = await parseUiMessages(input.messages);

  const result = await dataSource.transaction(async (manager) => {
    const sessionRepo = manager.getRepository(ChatSession);
    const messageRepo = manager.getRepository(ChatMessage);

    const session = await sessionRepo.findOne({
      where: {
        id: input.sessionId,
        home: {
          id: input.homeId,
        },
      } as any,
    });
    if (!session) return null;

    const existingMessages = await messageRepo.find({
      where: {
        session: {
          id: session.id,
        },
      } as any,
    });

    if (existingMessages.length > 0) {
      await messageRepo.remove(existingMessages);
    }

    const nextMessages = normalizedMessages.map((message, index) => {
      const messageId = typeof message.id === 'string' && message.id ? message.id : nanoid();
      const payload: UIMessage = {
        ...message,
        id: messageId,
      };

      return messageRepo.create({
        session,
        sequence: index,
        messageId,
        role: payload.role,
        payload,
      });
    });

    if (nextMessages.length > 0) {
      await messageRepo.save(nextMessages);
    }

    const latestPreview = buildLatestPreview(normalizedMessages);
    const inferredTitle = inferTitleFromMessages(normalizedMessages);
    if (
      inferredTitle &&
      (!session.title || session.title === DEFAULT_CHAT_SESSION_TITLE)
    ) {
      session.title = inferredTitle;
    }
    session.latestPreview = latestPreview;
    session.messageCount = nextMessages.length;
    session.lastMessageAt = nextMessages.length > 0 ? new Date() : undefined;

    await sessionRepo.save(session);
    return {
      session: serializeChatSession(session),
      messages: normalizedMessages,
    };
  });

  return result;
}
