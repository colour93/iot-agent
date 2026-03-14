import { DataSource } from 'typeorm';
import { Command } from '../entities/index.js';
import { sendCommand } from './mqttService.js';
import mqtt from 'mqtt';
import { logger } from '../logger.js';

export async function sweepCommandTimeouts(dataSource: DataSource, timeoutMs: number) {
  const repo = dataSource.getRepository(Command);
  const now = Date.now();
  const sent = await repo.find({ where: { status: 'sent' } });
  for (const cmd of sent) {
    if (cmd.sentAt && now - cmd.sentAt.getTime() > timeoutMs) {
      cmd.status = 'timeout';
      cmd.error = 'ack_timeout';
      await repo.save(cmd);
    }
  }
}

async function publishCommand(
  mqttClient: mqtt.MqttClient,
  cmd: Command,
  timeoutMs: number,
) {
  await sendCommand(
    mqttClient,
    {
      deviceId: cmd.device.deviceId,
      homeId: cmd.homeId,
      roomId: cmd.roomId,
    },
    {
      cmdId: cmd.cmdId,
      method: cmd.method,
      params: cmd.params,
      timeout: timeoutMs,
    },
  );
}

export async function retryTimeouts(
  dataSource: DataSource,
  mqttClient: mqtt.MqttClient,
  timeoutMs = 5000,
  maxRetry = 2,
) {
  const repo = dataSource.getRepository(Command);
  const list = await repo.find({
    where: { status: 'timeout' },
    order: { createdAt: 'ASC' },
  });
  for (const cmd of list) {
    if (cmd.retryCount >= maxRetry) continue;
    if (!cmd.device?.deviceId) continue;

    if (cmd.device.status !== 'online') {
      cmd.status = 'pending';
      cmd.error = 'device_offline_retry_deferred';
      await repo.save(cmd);
      continue;
    }

    cmd.retryCount += 1;
    cmd.status = 'sent';
    cmd.sentAt = new Date();
    cmd.error = undefined;
    await repo.save(cmd);
    try {
      await publishCommand(mqttClient, cmd, timeoutMs);
    } catch (err) {
      cmd.status = 'pending';
      cmd.error = 'retry_publish_failed_deferred';
      await repo.save(cmd);
      logger.warn({ err, cmdId: cmd.cmdId, deviceId: cmd.device.deviceId }, 'retry publish failed, deferred');
    }
  }
}

export async function dispatchPendingCommands(
  dataSource: DataSource,
  mqttClient: mqtt.MqttClient,
  timeoutMs = 5000,
  batchSize = 50,
) {
  const repo = dataSource.getRepository(Command);
  const list = await repo.find({
    where: {
      status: 'pending',
      device: { status: 'online' } as any,
    } as any,
    order: { createdAt: 'ASC' },
    take: batchSize,
  });

  for (const cmd of list) {
    if (!cmd.device?.deviceId) continue;
    cmd.status = 'sent';
    cmd.sentAt = new Date();
    cmd.error = undefined;
    await repo.save(cmd);
    try {
      await publishCommand(mqttClient, cmd, timeoutMs);
    } catch (err) {
      cmd.status = 'pending';
      cmd.error = 'publish_failed_deferred';
      await repo.save(cmd);
      logger.warn({ err, cmdId: cmd.cmdId, deviceId: cmd.device.deviceId }, 'dispatch pending failed');
      if (!mqttClient.connected) {
        break;
      }
    }
  }
}

export async function dispatchPendingCommandsForDevice(
  dataSource: DataSource,
  mqttClient: mqtt.MqttClient,
  deviceId: string,
  timeoutMs = 5000,
  batchSize = 20,
) {
  const repo = dataSource.getRepository(Command);
  const list = await repo.find({
    where: {
      status: 'pending',
      device: {
        deviceId,
        status: 'online',
      } as any,
    } as any,
    order: { createdAt: 'ASC' },
    take: batchSize,
  });

  for (const cmd of list) {
    cmd.status = 'sent';
    cmd.sentAt = new Date();
    cmd.error = undefined;
    await repo.save(cmd);
    try {
      await publishCommand(mqttClient, cmd, timeoutMs);
    } catch (err) {
      cmd.status = 'pending';
      cmd.error = 'publish_failed_deferred';
      await repo.save(cmd);
      logger.warn({ err, cmdId: cmd.cmdId, deviceId }, 'dispatch pending for device failed');
      break;
    }
  }
}
