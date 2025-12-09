import { DataSource } from 'typeorm';
import { Command } from '../entities/index.js';
import { sendCommand } from './mqttService.js';
import mqtt from 'mqtt';

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

export async function retryTimeouts(
  dataSource: DataSource,
  mqttClient: mqtt.MqttClient,
  timeoutMs = 5000,
  maxRetry = 2,
) {
  const repo = dataSource.getRepository(Command);
  const list = await repo.find({ where: { status: 'timeout' } });
  for (const cmd of list) {
    if (cmd.retryCount >= maxRetry) continue;
    cmd.retryCount += 1;
    cmd.status = 'sent';
    cmd.sentAt = new Date();
    await repo.save(cmd);
    if (cmd.homeId && cmd.roomId) {
      await sendCommand(mqttClient, cmd.homeId, cmd.roomId, cmd.device.deviceId, {
        cmdId: cmd.cmdId,
        method: cmd.method,
        params: cmd.params,
        timeout: timeoutMs,
      });
    }
  }
}