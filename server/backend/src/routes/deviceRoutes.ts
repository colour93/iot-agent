import { Router } from 'express';
import { DataSource } from 'typeorm';
import { Device, DeviceAttrsSnapshot } from '../entities/index.js';
import { sendCommand } from '../services/mqttService.js';
import { nanoid } from 'nanoid';
import { logger } from '../logger.js';

export function createDeviceRoutes(dataSource: DataSource, mqttClient: import('mqtt').MqttClient) {
  const router = Router();

  router.get('/homes/:homeId/devices', async (req, res) => {
    const list = await dataSource.getRepository(Device).find({
      where: { room: { home: { id: req.params.homeId } } as any },
    });
    res.json(list);
  });

  // 设备预注册，生成密钥与占位设备记录
  router.post('/homes/:homeId/devices/pre-register', async (req, res) => {
    const { homeId } = req.params;
    const { roomId, deviceId, name, type, category } = req.body;
    const secret = nanoid();
    const repo = dataSource.getRepository(Device);
    const device = repo.create({
      deviceId,
      name,
      type,
      category,
      room: { id: roomId } as any,
      secret,
      status: 'offline',
    });
    await repo.save(device);
    res.json({ status: 'ok', secret, homeId, roomId });
  });

  // 查询设备详情与属性快照
  router.get('/devices/:deviceId', async (req, res) => {
    const repo = dataSource.getRepository(Device);
    const device = await repo.findOne({ where: { deviceId: req.params.deviceId } });
    if (!device) return res.status(404).json({ error: 'not found' });
    res.json(device);
  });

  // 命令下发
  router.post('/devices/:deviceId/command', async (req, res) => {
    const { deviceId } = req.params;
    const { homeId, roomId, method, params } = req.body;
    const device = await dataSource.getRepository(Device).findOne({
      where: { deviceId },
      relations: ['room', 'room.home', 'room.home.owner'],
    });
    if (!device) return res.status(404).json({ code: 404, msg: 'device not found' });

    const auth = req.auth;
    const ownerId = device.room?.home?.owner?.id;
    const isAdmin = auth?.role === 'admin';
    const ownsHome = auth?.userId && ownerId && auth.userId === ownerId;
    const inHomeIds = auth?.homeIds && ownerId && auth.homeIds.includes(ownerId);
    if (!isAdmin && !(ownsHome || inHomeIds)) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    const cmdId = nanoid();
    await sendCommand(mqttClient, deviceId, {
      cmdId,
      method,
      params: params || {},
      timeout: 5000,
    });
    logger.debug({ deviceId, cmdId, method }, 'command dispatched');
    res.json({ status: 'sent', cmdId });
  });

  // 属性快照
  router.get('/devices/:deviceId/attrs', async (req, res) => {
    const snapRepo = dataSource.getRepository(DeviceAttrsSnapshot);
    const snap = await snapRepo.findOne({
      where: { device: { deviceId: req.params.deviceId } },
    });
    if (!snap) return res.status(404).json({ error: 'no snapshot' });
    res.json(snap);
  });

  return router;
}

