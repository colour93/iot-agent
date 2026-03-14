import mqtt, { MqttClient } from 'mqtt';
import { DataSource } from 'typeorm';
import { config } from '../config/env.js';
import { logger } from '../logger.js';
import {
  Command,
  Device,
  DeviceAttrsSnapshot,
  DeviceCapability,
  DeviceEvent,
  TelemetryLog,
} from '../entities/index.js';
import { topicOf } from '../utils/topics.js';
import { mqttState } from '../state/mqttState.js';

interface RegisterPayload {
  ts: number;
  deviceId: string;
  type: string;
  name: string;
  fw?: string;
  capabilities?: Array<{
    kind: 'attr' | 'method' | 'event';
    name: string;
    schema?: Record<string, unknown>;
  }>;
  meta?: Record<string, unknown>;
}

interface TelemetryPayload {
  ts: number;
  attrs: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

interface EventPayload {
  ts: number;
  event: string;
  params?: Record<string, unknown>;
}

interface CommandAckPayload {
  cmdId: string;
  status: 'ok' | 'error';
  result?: Record<string, unknown>;
  error?: string;
}

interface LwtPayload {
  status: 'online' | 'offline';
  ts: number;
}

export function startMqttService(dataSource: DataSource) {
  const client = mqtt.connect(config.mqtt.url, {
    username: config.mqtt.user,
    password: config.mqtt.pass,
    clean: true,
  });

  client.on('connect', () => {
    logger.info('MQTT connected');
    mqttState.connected = true;
    mqttState.lastError = undefined;
    client.subscribe('device/+/register');
    client.subscribe('device/+/telemetry');
    client.subscribe('device/+/event/+');
    client.subscribe('device/+/command/ack');
    client.subscribe('device/+/lwt/status');
  });

  client.on('message', async (topic, buffer) => {
    logger.debug({ topic, payload: buffer.toString() }, 'MQTT message received');
    try {
      const payload = JSON.parse(buffer.toString());
      const parts = topic.split('/');
      const deviceId = parts[1];
      if (topic.endsWith('/register')) {
        await handleRegister(dataSource, client, deviceId, payload as RegisterPayload);
      } else if (topic.endsWith('/telemetry')) {
        await handleTelemetry(dataSource, client, deviceId, payload as TelemetryPayload);
      } else if (topic.includes('/event/')) {
        const eventType = parts[3];
        await handleEvent(dataSource, client, deviceId, eventType, payload as EventPayload);
      } else if (topic.endsWith('/command/ack')) {
        await handleCommandAck(dataSource, payload as CommandAckPayload);
      } else if (topic.endsWith('/lwt/status')) {
        await handleLwt(dataSource, deviceId, payload as LwtPayload);
      }
    } catch (err) {
      logger.error({ err }, 'MQTT message error');
      mqttState.lastError = String(err);
    }
  });

  client.on('error', (err) => {
    mqttState.connected = false;
    mqttState.lastError = String(err);
    logger.error({ err }, 'MQTT client error');
  });
  client.on('offline', () => {
    mqttState.connected = false;
    logger.warn('MQTT offline');
  });

  return client;
}

function triggerAutomationAsync(
  dataSource: DataSource,
  client: MqttClient,
  homeId: string | undefined,
  triggerContext: Record<string, unknown>,
) {
  if (!homeId) return;

  void import('./automationEngine.js')
    .then(({ evaluateAutomation }) =>
      evaluateAutomation(dataSource, client, homeId, triggerContext),
    )
    .catch((err) => {
      logger.error({ err, homeId, triggerContext }, 'trigger automation from mqtt failed');
    });
}

async function handleRegister(
  dataSource: DataSource,
  client: MqttClient,
  deviceIdFromTopic: string,
  payload: RegisterPayload,
) {
  const deviceRepo = dataSource.getRepository(Device);
  const device = await deviceRepo.findOne({
    where: { deviceId: payload.deviceId || deviceIdFromTopic },
    relations: ['room', 'room.home'],
  });
  if (!device) {
    logger.warn({ deviceId: payload.deviceId || deviceIdFromTopic }, 'Register failed: device not pre-registered');
    return;
  }
  device.status = 'online';
  device.fwVersion = payload.fw ?? device.fwVersion;
  device.lastSeen = new Date(payload.ts * 1000);
  if (payload.capabilities?.length) {
    device.capabilities = payload.capabilities.map((cap) =>
      dataSource.getRepository(DeviceCapability).create({
        kind: cap.kind,
        name: cap.name,
        schema: cap.schema,
      }),
    );
  }
  await deviceRepo.save(device);

  const ackTopic = topicOf(device.deviceId, 'register/ack');
  client.publish(
    ackTopic,
    JSON.stringify({
      status: 'ok',
      heartbeat: 30,
      expectAttrs: payload.capabilities
        ?.filter((c) => c.kind === 'attr')
        .map((c) => c.name),
      serverTs: Date.now(),
      config: { telemetryInterval: 60 },
    }),
    { qos: 1 },
  );
  logger.info({ deviceId: payload.deviceId }, 'Register handled');
}

async function handleTelemetry(
  dataSource: DataSource,
  client: MqttClient,
  deviceId: string,
  payload: TelemetryPayload,
) {
  const device = await dataSource.getRepository(Device).findOne({ where: { deviceId } });
  const now = new Date(payload.ts * 1000);
  if (device) {
    device.lastSeen = now;
    device.status = 'online';
    await dataSource.getRepository(Device).save(device);
    const snapRepo = dataSource.getRepository(DeviceAttrsSnapshot);
    if (device.snapshot) {
      device.snapshot.attrs = payload.attrs;
      await snapRepo.save(device.snapshot);
    } else {
      const snap = snapRepo.create({ device, attrs: payload.attrs });
      await snapRepo.save(snap);
    }
  }
  const telemetry = dataSource.getRepository(TelemetryLog).create({
    device: device ?? ({ deviceId: payload.meta?.deviceId || 'unknown' } as Device),
    homeId: device?.room?.home?.id ?? '',
    roomId: device?.room?.id ?? '',
    ts: now,
    payload: payload.attrs,
  });
  await dataSource.getRepository(TelemetryLog).save(telemetry);

  if (device?.room?.home?.id) {
    const triggerContext: Record<string, unknown> = {
      source: 'telemetry',
      homeId: device.room.home.id,
      roomId: device.room?.id,
      deviceId,
      ts: payload.ts,
      attrs: payload.attrs,
    };
    for (const [key, value] of Object.entries(payload.attrs ?? {})) {
      triggerContext[key] = value;
      triggerContext[`${deviceId}.${key}`] = value;
    }

    triggerAutomationAsync(dataSource, client, device.room.home.id, triggerContext);
  }
}

async function handleEvent(
  dataSource: DataSource,
  client: MqttClient,
  deviceId: string,
  eventType: string,
  payload: EventPayload,
) {
  const device = await dataSource.getRepository(Device).findOne({ where: { deviceId } });
  const event = dataSource.getRepository(DeviceEvent).create({
    device: device ?? ({ deviceId } as Device),
    eventType,
    params: payload.params,
    ts: new Date(payload.ts * 1000),
  });
  await dataSource.getRepository(DeviceEvent).save(event);
  logger.info({ eventType, deviceId }, 'Event saved');

  if (device?.room?.home?.id) {
    const triggerContext: Record<string, unknown> = {
      source: 'event',
      homeId: device.room.home.id,
      roomId: device.room?.id,
      deviceId,
      eventType,
      ts: payload.ts,
      params: payload.params ?? {},
    };
    for (const [key, value] of Object.entries(payload.params ?? {})) {
      triggerContext[key] = value;
      triggerContext[`event.${key}`] = value;
    }

    triggerAutomationAsync(dataSource, client, device.room.home.id, triggerContext);
  }
}

async function handleCommandAck(dataSource: DataSource, payload: CommandAckPayload) {
  const repo = dataSource.getRepository(Command);
  const cmd = await repo.findOne({ where: { cmdId: payload.cmdId } });
  if (!cmd) return;
  cmd.status = payload.status === 'ok' ? 'acked' : 'failed';
  cmd.ackAt = new Date();
  cmd.error = payload.error;
  cmd.result = payload.result;
  await repo.save(cmd);
}

export async function sendCommand(
  client: MqttClient,
  deviceId: string,
  payload: { cmdId: string; method: string; params: Record<string, unknown>; timeout?: number },
) {
  const topic = topicOf(deviceId, 'command');
  logger.debug({ topic, payload }, 'MQTT publish command');
  client.publish(topic, JSON.stringify(payload), { qos: 1 });
}

export async function markTimeouts(dataSource: DataSource, timeoutMs = 5000) {
  const repo = dataSource.getRepository(Command);
  const now = Date.now();
  const pending = await repo.find({ where: { status: 'sent' } });
  for (const cmd of pending) {
    if (cmd.sentAt && now - cmd.sentAt.getTime() > timeoutMs) {
      cmd.status = 'timeout';
      cmd.error = 'ack_timeout';
      await repo.save(cmd);
    }
  }
}

async function handleLwt(dataSource: DataSource, deviceId: string, payload: { status: 'online' | 'offline'; ts?: number }) {
  const repo = dataSource.getRepository(Device);
  const device = await repo.findOne({ where: { deviceId } });
  if (!device) return;
  device.status = payload.status;
  device.lastSeen = payload.ts ? new Date(payload.ts * 1000) : new Date();
  await repo.save(device);
  logger.debug({ deviceId, status: payload.status }, 'LWT status updated');
}
