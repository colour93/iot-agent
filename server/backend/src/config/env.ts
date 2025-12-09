import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

type AppConfig = {
  port: number;
  mqtt: { url: string; user: string; pass: string };
  postgres: { url: string };
  redis: { url: string };
  jwt: { secret: string };
  auth?: { oauthProviders?: string[] };
  logLevel?: string;
  llm: {
    provider: string; // openai/anthropic/google/deepseek/qwen 等
    apiKey: string;
    baseUrl?: string;
    model?: string;
  };
  cors?: { origins?: string[] };
};

function defaultConfig(): AppConfig {
  return {
    port: 4000,
    mqtt: { url: 'mqtt://localhost:1883', user: 'dev', pass: 'dev' },
    postgres: { url: 'postgres://postgres:postgres@localhost:5432/iot' },
    redis: { url: 'redis://localhost:6379' },
    jwt: { secret: 'dev-secret' },
    llm: { provider: 'openai', apiKey: '', baseUrl: undefined, model: 'gpt-4o-mini' },
    logLevel: 'info',
  };
}

function loadConfig(): AppConfig {
  const configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'config.yaml');
  if (!fs.existsSync(configPath)) {
    return defaultConfig();
  }
  const file = fs.readFileSync(configPath, 'utf8');
  const parsed = yaml.parse(file) as Partial<AppConfig>;
  const base = defaultConfig();
  return {
    port: parsed?.port ?? base.port,
    mqtt: {
      url: parsed?.mqtt?.url ?? base.mqtt.url,
      user: parsed?.mqtt?.user ?? base.mqtt.user,
      pass: parsed?.mqtt?.pass ?? base.mqtt.pass,
    },
    postgres: {
      url: parsed?.postgres?.url ?? base.postgres.url,
    },
    redis: {
      url: parsed?.redis?.url ?? base.redis.url,
    },
    jwt: {
      secret: parsed?.jwt?.secret ?? base.jwt.secret,
    },
    auth: {
      oauthProviders: parsed?.auth?.oauthProviders ?? [],
    },
    logLevel: parsed?.logLevel ?? base.logLevel,
    llm: {
      provider: parsed?.llm?.provider ?? base.llm.provider,
      apiKey: parsed?.llm?.apiKey ?? base.llm.apiKey,
      baseUrl: parsed?.llm?.baseUrl ?? base.llm.baseUrl,
      model: parsed?.llm?.model ?? base.llm.model,
    },
    cors: {
      origins: parsed?.cors?.origins ?? ['*'],
    },
  };
}

export const config = loadConfig();

