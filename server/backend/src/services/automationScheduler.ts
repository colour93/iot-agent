import type mqtt from 'mqtt';
import { DataSource } from 'typeorm';
import { Home } from '../entities/index.js';
import { logger } from '../logger.js';
import { evaluateAutomation } from './automationEngine.js';

const DEFAULT_TICK_MS = 15_000;

export function startAutomationScheduler(
  dataSource: DataSource,
  mqttClient: mqtt.MqttClient,
  tickMs = DEFAULT_TICK_MS,
) {
  let lastMinuteSlot = '';

  const tick = async () => {
    const now = new Date();
    const minuteSlot = now.toISOString().slice(0, 16);
    if (minuteSlot === lastMinuteSlot) return;
    lastMinuteSlot = minuteSlot;

    const homes = await dataSource.getRepository(Home).find({
      select: {
        id: true,
      },
    });
    const triggerContext = {
      source: 'scheduler',
      ts: Math.floor(now.getTime() / 1000),
      now: now.toISOString(),
      scheduleTick: true,
    } satisfies Record<string, unknown>;

    for (const home of homes) {
      await evaluateAutomation(dataSource, mqttClient, home.id, triggerContext);
    }
  };

  void tick().catch((err) => logger.error({ err }, 'automation scheduler initial tick failed'));

  return setInterval(() => {
    void tick().catch((err) => logger.error({ err }, 'automation scheduler tick failed'));
  }, tickMs);
}
