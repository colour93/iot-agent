import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { z } from 'zod';

const supportedLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

function isUrlWithProtocol(value: string, protocols: string[]) {
  try {
    const parsed = new URL(value);
    return protocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

const mqttUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isUrlWithProtocol(value, ['mqtt:', 'mqtts:']), {
    message: 'must be a mqtt:// or mqtts:// URL',
  });

const postgresUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isUrlWithProtocol(value, ['postgres:', 'postgresql:']), {
    message: 'must be a postgres:// or postgresql:// URL',
  });

const redisUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isUrlWithProtocol(value, ['redis:', 'rediss:']), {
    message: 'must be a redis:// or rediss:// URL',
  });

const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isUrlWithProtocol(value, ['http:', 'https:']), {
    message: 'must be a http:// or https:// URL',
  });

const corsOriginsSchema = z
  .array(z.string().trim().min(1))
  .default(['*'])
  .transform((origins) => {
    const deduped = [...new Set(origins.map((origin) => origin.trim()).filter(Boolean))];
    return deduped.length > 0 ? deduped : ['*'];
  });

const appConfigSchema = z
  .object({
    port: z.number().int().min(1).max(65535),
    mqtt: z
      .object({
        url: mqttUrlSchema,
        user: z.string(),
        pass: z.string(),
      })
      .strict(),
    postgres: z
      .object({
        url: postgresUrlSchema,
      })
      .strict(),
    redis: z
      .object({
        url: redisUrlSchema,
      })
      .strict(),
    jwt: z
      .object({
        secret: z.string().trim().min(1),
      })
      .strict(),
    auth: z
      .object({
        oauthProviders: z.array(z.string().trim().min(1)).default([]),
      })
      .strict(),
    logLevel: z.enum(supportedLogLevels),
    llm: z
      .object({
        provider: z.string().trim().min(1),
        apiKey: z.string(),
        baseUrl: httpUrlSchema.optional(),
        model: z.string().trim().min(1),
      })
      .strict(),
    cors: z
      .object({
        origins: corsOriginsSchema,
      })
      .strict(),
  })
  .strict();

const partialConfigSchema = z
  .object({
    port: appConfigSchema.shape.port.optional(),
    mqtt: appConfigSchema.shape.mqtt.partial().optional(),
    postgres: appConfigSchema.shape.postgres.partial().optional(),
    redis: appConfigSchema.shape.redis.partial().optional(),
    jwt: appConfigSchema.shape.jwt.partial().optional(),
    auth: appConfigSchema.shape.auth.partial().optional(),
    logLevel: appConfigSchema.shape.logLevel.optional(),
    llm: appConfigSchema.shape.llm.partial().optional(),
    cors: appConfigSchema.shape.cors.partial().optional(),
  })
  .strict();

export type AppConfig = z.infer<typeof appConfigSchema>;
type PartialAppConfig = z.infer<typeof partialConfigSchema>;

const DEFAULT_CONFIG: AppConfig = {
  port: 4000,
  mqtt: { url: 'mqtt://localhost:1883', user: 'dev', pass: 'dev' },
  postgres: { url: 'postgres://postgres:postgres@localhost:5432/iot' },
  redis: { url: 'redis://localhost:6379' },
  jwt: { secret: 'dev-secret' },
  auth: { oauthProviders: [] },
  logLevel: 'info',
  llm: { provider: 'openai', apiKey: '', baseUrl: undefined, model: 'gpt-4o-mini' },
  cors: { origins: ['*'] },
};

function formatConfigError(configPath: string, issues: z.ZodIssue[]) {
  const details = issues
    .map((issue) => {
      const field = issue.path.join('.') || '(root)';
      return `${field}: ${issue.message}`;
    })
    .join('; ');
  return `Invalid config file "${configPath}". ${details}`;
}

function parseConfigFile(configPath: string): PartialAppConfig {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const parsed = (yaml.parse(content) ?? {}) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid config file "${configPath}". Root value must be an object.`);
  }

  const validation = partialConfigSchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(formatConfigError(configPath, validation.error.issues));
  }

  return validation.data;
}

function emitConfigWarnings(config: AppConfig) {
  if (config.jwt.secret.length < 16) {
    console.warn('[config] jwt.secret is shorter than 16 chars. Use a stronger secret in production.');
  }
  if (config.cors.origins.includes('*')) {
    console.warn('[config] cors.origins contains "*". Limit allowed origins in production.');
  }
  const llmProvider = config.llm.provider.trim().toLowerCase();
  if (config.llm.apiKey && llmProvider === 'gateway' && !config.llm.model.includes('/')) {
    console.warn('[config] llm.model is missing provider prefix. Example: "openai/gpt-4o-mini".');
  }
}

function loadConfig(): AppConfig {
  const configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'config.yaml');
  const partial = parseConfigFile(configPath);

  const merged: AppConfig = {
    port: partial.port ?? DEFAULT_CONFIG.port,
    mqtt: {
      url: partial.mqtt?.url ?? DEFAULT_CONFIG.mqtt.url,
      user: partial.mqtt?.user ?? DEFAULT_CONFIG.mqtt.user,
      pass: partial.mqtt?.pass ?? DEFAULT_CONFIG.mqtt.pass,
    },
    postgres: {
      url: partial.postgres?.url ?? DEFAULT_CONFIG.postgres.url,
    },
    redis: {
      url: partial.redis?.url ?? DEFAULT_CONFIG.redis.url,
    },
    jwt: {
      secret: partial.jwt?.secret ?? DEFAULT_CONFIG.jwt.secret,
    },
    auth: {
      oauthProviders: partial.auth?.oauthProviders ?? DEFAULT_CONFIG.auth.oauthProviders,
    },
    logLevel: partial.logLevel ?? DEFAULT_CONFIG.logLevel,
    llm: {
      provider: partial.llm?.provider ?? DEFAULT_CONFIG.llm.provider,
      apiKey: partial.llm?.apiKey ?? DEFAULT_CONFIG.llm.apiKey,
      baseUrl: partial.llm?.baseUrl ?? DEFAULT_CONFIG.llm.baseUrl,
      model: partial.llm?.model ?? DEFAULT_CONFIG.llm.model,
    },
    cors: {
      origins: partial.cors?.origins ?? DEFAULT_CONFIG.cors.origins,
    },
  };

  const validation = appConfigSchema.safeParse(merged);
  if (!validation.success) {
    throw new Error(formatConfigError(configPath, validation.error.issues));
  }

  emitConfigWarnings(validation.data);
  return validation.data;
}

export const config = loadConfig();
