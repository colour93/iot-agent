import mqtt, { type MqttClient } from "mqtt";
import type { AttrSpec, CommandMethod, DeviceConfig, EventPlan, SimConfig } from "./config";
import type { Logger } from "./logger";

interface DeviceRuntime {
  baseTopic: string;
  attrs: Record<string, unknown>;
  sequenceIndex: Record<string, number>;
  eventTimers: NodeJS.Timeout[];
  heartbeatTimer?: NodeJS.Timeout;
  telemetryTimer?: NodeJS.Timeout;
}

interface CommandPayload {
  cmdId?: string;
  method?: string;
  params?: Record<string, unknown>;
}

export class DeviceSimulator {
  private client?: MqttClient;
  private readonly runtime: DeviceRuntime;

  constructor(
    private readonly config: SimConfig,
    private readonly device: DeviceConfig,
    private readonly logger: Logger,
  ) {
    this.runtime = {
      baseTopic: resolveTopicBase(device.topicBaseTemplate ?? config.topic.baseTemplate, device),
      attrs: {},
      sequenceIndex: {},
      eventTimers: [],
    };
  }

  async start() {
    this.logger.info(`device ${this.device.deviceId} connecting`, {
      topic: this.runtime.baseTopic,
      mqtt: this.config.mqtt.url,
    });

    this.client = mqtt.connect(this.config.mqtt.url, {
      username: this.config.mqtt.username,
      password: this.config.mqtt.password,
      clientId: `sim-${this.device.deviceId}`,
      clean: this.config.mqtt.clean,
      keepalive: this.config.mqtt.keepaliveSec,
      reconnectPeriod: this.config.mqtt.reconnectPeriodMs,
      will: {
        topic: this.topic("lwt/status"),
        payload: JSON.stringify({
          status: "offline",
          ts: nowUnixSec(),
        }),
        qos: 1,
        retain: true,
      },
    });

    this.client.on("connect", () => {
      this.logger.info(`device ${this.device.deviceId} connected`);
      this.subscribeTopics();
      this.refreshLoops();

      if (this.device.registerOnConnect) {
        this.publishRegister();
      }
      if (this.device.onlineOnConnect) {
        this.publishHeartbeat("online");
      }
    });

    this.client.on("message", (topic, payloadBuffer) => {
      const payload = payloadBuffer.toString("utf8");
      this.handleMessage(topic, payload);
    });

    this.client.on("reconnect", () => {
      this.logger.warn(`device ${this.device.deviceId} reconnecting`);
    });

    this.client.on("close", () => {
      this.clearLoops();
      this.logger.warn(`device ${this.device.deviceId} connection closed`);
    });

    this.client.on("error", (err) => {
      this.logger.error(`device ${this.device.deviceId} mqtt error`, { error: String(err) });
    });
  }

  async stop() {
    this.clearLoops();

    if (!this.client) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.client?.end(true, {}, () => resolve());
    });
    this.logger.info(`device ${this.device.deviceId} stopped`);
  }

  private subscribeTopics() {
    this.client?.subscribe(this.topic("command"), { qos: 1 });
    this.client?.subscribe(this.topic("register/ack"), { qos: 1 });
    this.client?.subscribe(this.topic("config"), { qos: 1 });
  }

  private refreshLoops() {
    this.clearLoops();

    this.runtime.telemetryTimer = setInterval(
      () => this.publishTelemetry(),
      this.device.telemetryIntervalSec * 1000,
    );

    this.runtime.heartbeatTimer = setInterval(
      () => this.publishHeartbeat("online"),
      this.device.heartbeatIntervalSec * 1000,
    );

    this.device.events.forEach((eventPlan) => {
      const timer = setInterval(() => {
        if (Math.random() > eventPlan.chance) {
          return;
        }
        this.publishEvent(eventPlan);
      }, eventPlan.intervalSec * 1000);
      this.runtime.eventTimers.push(timer);
    });
  }

  private clearLoops() {
    if (this.runtime.telemetryTimer) {
      clearInterval(this.runtime.telemetryTimer);
      this.runtime.telemetryTimer = undefined;
    }
    if (this.runtime.heartbeatTimer) {
      clearInterval(this.runtime.heartbeatTimer);
      this.runtime.heartbeatTimer = undefined;
    }
    this.runtime.eventTimers.forEach((timer) => clearInterval(timer));
    this.runtime.eventTimers = [];
  }

  private handleMessage(topic: string, payloadText: string) {
    this.logger.debug(`device ${this.device.deviceId} recv`, { topic, payloadText });

    if (topic.endsWith("/command")) {
      this.handleCommand(payloadText);
      return;
    }
    if (topic.endsWith("/register/ack")) {
      this.logger.info(`device ${this.device.deviceId} register ack`, {
        payload: tryParseJson(payloadText),
      });
      return;
    }
    if (topic.endsWith("/config")) {
      this.logger.info(`device ${this.device.deviceId} config update`, {
        payload: tryParseJson(payloadText),
      });
    }
  }

  private handleCommand(payloadText: string) {
    const payload = tryParseJson(payloadText) as CommandPayload | null;
    if (!payload) {
      this.publishCommandAck({
        cmdId: "unknown",
        status: "error",
        error: "invalid_json",
      });
      return;
    }

    const cmdId = payload.cmdId ?? "unknown";
    const method = payload.method ?? "unknown";
    const params = payload.params ?? {};

    const methodConfig = this.device.methods.find((item) => item.name === method);
    if (!methodConfig) {
      this.logger.warn(`device ${this.device.deviceId} unknown method`, { cmdId, method, params });
      this.publishCommandAck({
        cmdId,
        status: "error",
        error: `unknown_method:${method}`,
      });
      return;
    }

    this.applyCommandSideEffect(methodConfig, params);
    this.publishCommandAck({
      cmdId,
      status: methodConfig.ackStatus,
      result: methodConfig.result,
      error: methodConfig.error,
    });
  }

  private applyCommandSideEffect(methodConfig: CommandMethod, params: Record<string, unknown>) {
    if (!methodConfig.apply) {
      this.applyMethodDebugFallback(methodConfig.name, params);
      return;
    }

    if (methodConfig.apply.type === "set-attr") {
      const attr = methodConfig.apply.attr;
      if (!attr) {
        return;
      }
      const value = resolveMethodApplyValue(methodConfig.apply, params, attr);
      if (typeof value === "undefined") {
        return;
      }
      this.runtime.attrs[attr] = value;
      return;
    }

    if (methodConfig.apply.type === "merge-attrs") {
      Object.assign(this.runtime.attrs, params);
    }
  }

  private applyMethodDebugFallback(methodName: string, params: Record<string, unknown>) {
    const inferredAttr = inferAttrFromMethodName(methodName);
    if (!inferredAttr) {
      return;
    }

    const attr = this.resolveAttrName(inferredAttr);
    const value = pickMethodDebugValue(attr, params);
    if (typeof value === "undefined") {
      return;
    }

    this.runtime.attrs[attr] = value;
    this.logger.debug(`device ${this.device.deviceId} method debug side effect`, {
      method: methodName,
      attr,
      value,
    });
  }

  private resolveAttrName(inferredAttr: string): string {
    const attrs = Object.keys({
      ...this.device.attrs,
      ...this.runtime.attrs,
    });

    const exact = attrs.find((attr) => attr === inferredAttr);
    if (exact) {
      return exact;
    }

    const normalizedTarget = normalizeKey(inferredAttr);
    const normalized = attrs.find((attr) => normalizeKey(attr) === normalizedTarget);
    return normalized ?? inferredAttr;
  }

  private publishRegister() {
    this.publishJson(
      this.topic("register"),
      {
        ts: nowUnixSec(),
        deviceId: this.device.deviceId,
        homeId: this.device.homeId,
        roomId: this.device.roomId,
        type: this.device.type,
        name: this.device.name,
        fw: this.device.fw,
        capabilities: this.device.capabilities,
        meta: {
          ...this.device.meta,
          simulator: "bun-test-device",
        },
      },
      1,
    );
  }

  private publishHeartbeat(status: "online" | "offline") {
    this.publishJson(
      this.topic("lwt/status"),
      {
        ts: nowUnixSec(),
        status,
        meta: {
          fw: this.device.fw,
        },
      },
      1,
      true,
    );
  }

  private publishTelemetry() {
    const attrs = this.generateAttrs(this.device.attrs, this.runtime.attrs, "attr");
    this.runtime.attrs = attrs;
    this.publishJson(
      this.topic("telemetry"),
      {
        ts: nowUnixSec(),
        attrs,
        meta: {
          fw: this.device.fw,
        },
      },
      0,
    );
  }

  private publishEvent(eventPlan: EventPlan) {
    const params = this.generateAttrs(eventPlan.params, {}, `event:${eventPlan.eventType}`);
    this.publishJson(
      this.topic(`event/${eventPlan.eventType}`),
      {
        ts: nowUnixSec(),
        event: eventPlan.eventType,
        params,
      },
      1,
    );
  }

  private publishCommandAck(payload: {
    cmdId: string;
    status: "ok" | "error";
    result?: Record<string, unknown>;
    error?: string;
  }) {
    this.publishJson(
      this.topic("command/ack"),
      {
        ts: nowUnixSec(),
        cmdId: payload.cmdId,
        status: payload.status,
        result: payload.result,
        error: payload.error,
      },
      1,
    );
  }

  private publishJson(topic: string, payload: Record<string, unknown>, qos: 0 | 1, retain = false) {
    const text = JSON.stringify(payload);
    this.logger.debug(`device ${this.device.deviceId} publish`, { topic, payload });
    this.client?.publish(topic, text, { qos, retain }, (err) => {
      if (err) {
        this.logger.error(`device ${this.device.deviceId} publish failed`, {
          topic,
          error: String(err),
        });
      }
    });
  }

  private topic(suffix: string): string {
    return `${this.runtime.baseTopic}/${suffix}`;
  }

  private generateAttrs(
    source: Record<string, AttrSpec>,
    current: Record<string, unknown>,
    scope: string,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...current };
    for (const [key, spec] of Object.entries(source)) {
      out[key] = this.resolveAttrValue(`${scope}:${key}`, spec, current[key]);
    }
    return out;
  }

  private resolveAttrValue(cacheKey: string, spec: AttrSpec, current: unknown): unknown {
    if (
      typeof spec === "string" ||
      typeof spec === "number" ||
      typeof spec === "boolean" ||
      spec === null
    ) {
      return spec;
    }

    if (typeof spec !== "object" || spec === null) {
      return spec;
    }

    const normalized = spec as Record<string, unknown>;
    const mode = String(normalized.mode ?? "constant");

    if (mode === "constant") {
      return typeof current === "undefined" ? normalized.value : current;
    }

    if (mode === "random-int") {
      const min = toNumber(normalized.min, 0);
      const max = toNumber(normalized.max, 100);
      return randomInt(min, max);
    }

    if (mode === "random-float") {
      const min = toNumber(normalized.min, 0);
      const max = toNumber(normalized.max, 100);
      const precision = toNumber(normalized.precision, 2);
      return randomFloat(min, max, precision);
    }

    if (mode === "random-walk") {
      const min = toNumber(normalized.min, 0);
      const max = toNumber(normalized.max, 100);
      const step = toNumber(normalized.step, 1);
      const precision = toNumber(normalized.precision, 2);
      const baseline =
        typeof current === "number" && Number.isFinite(current) ? current : randomFloat(min, max, precision);
      const delta = (Math.random() * 2 - 1) * step;
      const next = clamp(baseline + delta, min, max);
      return withPrecision(next, precision);
    }

    if (mode === "sequence" || mode === "toggle") {
      const values = Array.isArray(normalized.values) ? normalized.values : [];
      if (!values.length) {
        return null;
      }
      const index = this.runtime.sequenceIndex[cacheKey] ?? 0;
      this.runtime.sequenceIndex[cacheKey] = (index + 1) % values.length;
      return values[index];
    }

    if (Object.prototype.hasOwnProperty.call(normalized, "value")) {
      return normalized.value;
    }

    return normalized;
  }
}

function resolveTopicBase(template: string, device: DeviceConfig): string {
  return template
    .replaceAll("{deviceId}", device.deviceId)
    .replaceAll("{homeId}", device.homeId)
    .replaceAll("{roomId}", device.roomId);
}

function nowUnixSec(): number {
  return Math.floor(Date.now() / 1000);
}

function randomInt(min: number, max: number): number {
  const start = Math.ceil(Math.min(min, max));
  const end = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (end - start + 1)) + start;
}

function randomFloat(min: number, max: number, precision = 2): number {
  const start = Math.min(min, max);
  const end = Math.max(min, max);
  const value = Math.random() * (end - start) + start;
  return withPrecision(value, precision);
}

function withPrecision(value: number, precision = 2): number {
  const p = Math.max(0, Math.floor(precision));
  return Number(value.toFixed(p));
}

function toNumber(input: unknown, fallback: number): number {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferAttrFromMethodName(methodName: string): string | undefined {
  const snakeOrKebab = methodName.match(/^set[-_](.+)$/i);
  if (snakeOrKebab?.[1]) {
    return snakeOrKebab[1];
  }

  const camel = methodName.match(/^set([A-Z].+)$/);
  if (camel?.[1]) {
    const [first = "", ...rest] = camel[1];
    return `${first.toLowerCase()}${rest.join("")}`;
  }

  return undefined;
}

function pickMethodDebugValue(attrName: string, params: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(params, attrName)) {
    return params[attrName];
  }

  const normalizedAttr = normalizeKey(attrName);
  const normalizedMatch = Object.entries(params).find(([key]) => normalizeKey(key) === normalizedAttr);
  if (normalizedMatch) {
    return normalizedMatch[1];
  }

  const candidateKeys = ["value", "on", "state", "enabled"];
  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return params[key];
    }
  }

  const entries = Object.entries(params);
  if (entries.length === 1) {
    return entries[0]?.[1];
  }

  return undefined;
}

function normalizeKey(input: string): string {
  return input.replaceAll(/[\s_-]/g, "").toLowerCase();
}

function resolveMethodApplyValue(
  apply: { fromParam?: string; value?: unknown },
  params: Record<string, unknown>,
  attrName: string,
): unknown {
  if (typeof apply.fromParam === "string") {
    const picked = pickParamValue(params, apply.fromParam);
    if (typeof picked !== "undefined") {
      return picked;
    }
    return pickMethodDebugValue(attrName, params);
  }

  if (Object.prototype.hasOwnProperty.call(apply, "value")) {
    return apply.value;
  }

  return pickMethodDebugValue(attrName, params);
}

function pickParamValue(params: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(params, key)) {
    return params[key];
  }

  const normalizedKey = normalizeKey(key);
  const normalizedMatch = Object.entries(params).find(([name]) => normalizeKey(name) === normalizedKey);
  if (normalizedMatch) {
    return normalizedMatch[1];
  }

  const envelope = params.value;
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
    return undefined;
  }

  const envelopeObj = envelope as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(envelopeObj, key)) {
    return envelopeObj[key];
  }

  const nestedMatch = Object.entries(envelopeObj).find(([name]) => normalizeKey(name) === normalizedKey);
  if (nestedMatch) {
    return nestedMatch[1];
  }

  return undefined;
}
