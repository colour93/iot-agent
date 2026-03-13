import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { z } from "zod";
import type { LogLevel } from "./logger";

const CAPABILITY_KIND = ["attr", "method", "event"] as const;
const DEVICE_CATEGORY = ["sensor", "actuator", "both"] as const;
const ACK_STATUS = ["ok", "error"] as const;

const capabilitySchema = z.object({
  kind: z.enum(CAPABILITY_KIND),
  name: z.string().min(1),
  schema: z.record(z.string(), z.unknown()).optional(),
});

const methodApplySchema = z
  .object({
    type: z.enum(["set-attr", "merge-attrs"]).default("set-attr"),
    attr: z.string().optional(),
    fromParam: z.string().optional(),
    value: z.unknown().optional(),
  })
  .passthrough();

const methodSchema = z
  .object({
    name: z.string().min(1),
    ackStatus: z.enum(ACK_STATUS).default("ok"),
    error: z.string().optional(),
    result: z.record(z.string(), z.unknown()).optional(),
    apply: methodApplySchema.optional(),
  })
  .passthrough();

const eventSchema = z
  .object({
    eventType: z.string().min(1),
    intervalSec: z.number().positive().default(30),
    chance: z.number().min(0).max(1).default(1),
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

const deviceSchema = z
  .object({
    deviceId: z.string().min(1),
    homeId: z.string().default("home-1"),
    roomId: z.string().default("room-1"),
    name: z.string().optional(),
    type: z.string().default("both"),
    category: z.enum(DEVICE_CATEGORY).default("both"),
    fw: z.string().default("sim-1.0.0"),
    telemetryIntervalSec: z.number().positive().default(5),
    heartbeatIntervalSec: z.number().positive().default(30),
    registerOnConnect: z.boolean().default(true),
    onlineOnConnect: z.boolean().default(true),
    startupDelayMs: z.number().int().nonnegative().default(0),
    topicBaseTemplate: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).default({}),
    methods: z.array(methodSchema).default([]),
    events: z.array(eventSchema).default([]),
    capabilities: z.array(capabilitySchema).optional(),
    meta: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

const rootSchema = z
  .object({
    simulator: z
      .object({
        logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
        shutdownAfterSec: z.number().int().nonnegative().default(0),
      })
      .default({}),
    mqtt: z.object({
      url: z.string().url(),
      username: z.string().optional(),
      password: z.string().optional(),
      keepaliveSec: z.number().positive().default(30),
      reconnectPeriodMs: z.number().int().nonnegative().default(2000),
      clean: z.boolean().default(true),
    }),
    topic: z
      .object({
        baseTemplate: z.string().default("device/{deviceId}"),
      })
      .default({}),
    devices: z.array(deviceSchema).min(1),
  })
  .passthrough();

export type AttrSpec = unknown;
export type CommandMethod = z.infer<typeof methodSchema>;
export type EventPlan = z.infer<typeof eventSchema>;
export type Capability = z.infer<typeof capabilitySchema>;

export interface DeviceConfig extends z.infer<typeof deviceSchema> {
  name: string;
  capabilities: Capability[];
}

export interface SimConfig {
  configPath: string;
  simulator: {
    logLevel: LogLevel;
    shutdownAfterSec: number;
  };
  mqtt: {
    url: string;
    username?: string;
    password?: string;
    keepaliveSec: number;
    reconnectPeriodMs: number;
    clean: boolean;
  };
  topic: {
    baseTemplate: string;
  };
  devices: DeviceConfig[];
}

export async function loadConfig(configPath: string): Promise<SimConfig> {
  const resolved = resolve(configPath);
  const text = await readFile(resolved, { encoding: "utf8" });
  const raw = parseConfigByExtension(resolved, text);
  const parsed = rootSchema.parse(raw);

  return {
    configPath: resolved,
    simulator: {
      logLevel: parsed.simulator.logLevel,
      shutdownAfterSec: parsed.simulator.shutdownAfterSec,
    },
    mqtt: parsed.mqtt,
    topic: parsed.topic,
    devices: parsed.devices.map((device) => ({
      ...device,
      name: device.name ?? device.deviceId,
      capabilities: device.capabilities ?? inferCapabilities(device),
    })),
  };
}

function parseConfigByExtension(path: string, text: string): Record<string, unknown> {
  const ext = extname(path).toLowerCase();
  if (ext === ".toml") {
    return Bun.TOML.parse(text) as Record<string, unknown>;
  }
  if (ext === ".json") {
    return JSON.parse(text) as Record<string, unknown>;
  }
  throw new Error(`Unsupported config extension "${ext}". Use .toml or .json.`);
}

function inferCapabilities(device: z.infer<typeof deviceSchema>): Capability[] {
  const attrCaps = Object.keys(device.attrs).map((name) => ({
    kind: "attr" as const,
    name,
    schema: inferSchemaFromAttrSpec(device.attrs[name]),
  }));
  const methodCaps = device.methods.map((method) => ({
    kind: "method" as const,
    name: method.name,
    schema: { type: "object" },
  }));
  const eventCaps = device.events.map((event) => ({
    kind: "event" as const,
    name: event.eventType,
    schema: { type: "object" },
  }));
  return [...attrCaps, ...methodCaps, ...eventCaps];
}

function inferSchemaFromAttrSpec(spec: unknown): Record<string, unknown> {
  if (typeof spec === "number") return { type: "number" };
  if (typeof spec === "boolean") return { type: "boolean" };
  if (typeof spec === "string") return { type: "string" };
  if (spec === null) return { type: "null" };

  if (typeof spec === "object" && spec !== null) {
    const mode = (spec as Record<string, unknown>).mode;
    if (mode === "random-int") return { type: "integer" };
    if (mode === "random-float" || mode === "random-walk") return { type: "number" };
  }

  return { type: "object" };
}
