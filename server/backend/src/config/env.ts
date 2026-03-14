import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { z } from 'zod';

const supportedLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
const isProduction = process.env.NODE_ENV === 'production';

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
  .default(['http://localhost:5173'])
  .transform((origins) => {
    const deduped = [...new Set(origins.map((origin) => origin.trim()).filter(Boolean))];
    return deduped.length > 0 ? deduped : ['http://localhost:5173'];
  });

const optionalPathSchema = z.string().trim().min(1).optional();

const mqttTlsSchema = z
  .object({
    enabled: z.boolean().default(false),
    rejectUnauthorized: z.boolean().default(true),
    caPath: optionalPathSchema,
    certPath: optionalPathSchema,
    keyPath: optionalPathSchema,
  })
  .strict();

const alertThresholdSchema = z
  .object({
    commandSuccessRateMin: z.number().min(0).max(1).default(0.85),
    automationFailureRateMax: z.number().min(0).max(1).default(0.25),
    llmFailureRateMax: z.number().min(0).max(1).default(0.2),
    requireMqttConnected: z.boolean().default(true),
  })
  .strict();

const appConfigSchema = z
  .object({
    port: z.number().int().min(1).max(65535),
    mqtt: z
      .object({
        url: mqttUrlSchema,
        user: z.string(),
        pass: z.string(),
        tls: mqttTlsSchema,
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
        secret: z.string().trim().min(16),
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
    observability: z
      .object({
        alertThresholds: alertThresholdSchema,
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
    observability: appConfigSchema.shape.observability.partial().optional(),
  })
  .strict();

export type AppConfig = z.infer<typeof appConfigSchema>;
type PartialAppConfig = z.infer<typeof partialConfigSchema>;

const DEFAULT_CONFIG: AppConfig = {
  port: 4000,
  mqtt: {
    url: 'mqtt://localhost:1883',
    user: 'dev',
    pass: 'dev',
    tls: {
      enabled: false,
      rejectUnauthorized: true,
      caPath: undefined,
      certPath: undefined,
      keyPath: undefined,
    },
  },
  postgres: { url: 'postgres://postgres:postgres@localhost:5432/iot' },
  redis: { url: 'redis://localhost:6379' },
  jwt: { secret: 'dev-secret-change-me-please-2026' },
  auth: { oauthProviders: [] },
  logLevel: 'info',
  llm: { provider: 'openai', apiKey: '', baseUrl: undefined, model: 'gpt-4o-mini' },
  cors: { origins: ['http://localhost:5173'] },
  observability: {
    alertThresholds: {
      commandSuccessRateMin: 0.85,
      automationFailureRateMax: 0.25,
      llmFailureRateMax: 0.2,
      requireMqttConnected: true,
    },
  },
};

function isMqttsUrl(value: string) {
  try {
    return new URL(value).protocol === 'mqtts:';
  } catch {
    return false;
  }
}

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
  if (config.jwt.secret.length < 32) {
    console.warn('[config] jwt.secret is shorter than 32 chars. Use a stronger secret in production.');
  }
  if (config.cors.origins.includes('*')) {
    console.warn('[config] cors.origins contains "*". Limit allowed origins in production.');
  }
  if (!isMqttsUrl(config.mqtt.url)) {
    console.warn('[config] mqtt.url uses mqtt://. Prefer mqtts:// in production.');
  }
  if (config.mqtt.user === 'dev' || config.mqtt.pass === 'dev') {
    console.warn('[config] mqtt user/pass still use dev credentials.');
  }
  const llmProvider = config.llm.provider.trim().toLowerCase();
  if (config.llm.apiKey && llmProvider === 'gateway' && !config.llm.model.includes('/')) {
    console.warn('[config] llm.model is missing provider prefix. Example: "openai/gpt-4o-mini".');
  }
}

function enforceProductionSecurity(config: AppConfig) {
  if (!isProduction) return;

  if (config.jwt.secret.length < 32) {
    throw new Error('Invalid production config: jwt.secret must be at least 32 chars.');
  }
  if (config.cors.origins.includes('*')) {
    throw new Error('Invalid production config: cors.origins cannot contain "*".');
  }
  if (!isMqttsUrl(config.mqtt.url)) {
    throw new Error('Invalid production config: mqtt.url must use mqtts://');
  }
  if (!config.mqtt.tls.rejectUnauthorized) {
    throw new Error('Invalid production config: mqtt.tls.rejectUnauthorized must be true.');
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
      tls: {
        enabled: partial.mqtt?.tls?.enabled ?? DEFAULT_CONFIG.mqtt.tls.enabled,
        rejectUnauthorized:
          partial.mqtt?.tls?.rejectUnauthorized ?? DEFAULT_CONFIG.mqtt.tls.rejectUnauthorized,
        caPath: partial.mqtt?.tls?.caPath ?? DEFAULT_CONFIG.mqtt.tls.caPath,
        certPath: partial.mqtt?.tls?.certPath ?? DEFAULT_CONFIG.mqtt.tls.certPath,
        keyPath: partial.mqtt?.tls?.keyPath ?? DEFAULT_CONFIG.mqtt.tls.keyPath,
      },
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
    observability: {
      alertThresholds: {
        commandSuccessRateMin:
          partial.observability?.alertThresholds?.commandSuccessRateMin ??
          DEFAULT_CONFIG.observability.alertThresholds.commandSuccessRateMin,
        automationFailureRateMax:
          partial.observability?.alertThresholds?.automationFailureRateMax ??
          DEFAULT_CONFIG.observability.alertThresholds.automationFailureRateMax,
        llmFailureRateMax:
          partial.observability?.alertThresholds?.llmFailureRateMax ??
          DEFAULT_CONFIG.observability.alertThresholds.llmFailureRateMax,
        requireMqttConnected:
          partial.observability?.alertThresholds?.requireMqttConnected ??
          DEFAULT_CONFIG.observability.alertThresholds.requireMqttConnected,
      },
    },
  };

  const validation = appConfigSchema.safeParse(merged);
  if (!validation.success) {
    throw new Error(formatConfigError(configPath, validation.error.issues));
  }

  emitConfigWarnings(validation.data);
  enforceProductionSecurity(validation.data);
  return validation.data;
}

export const config = loadConfig();
