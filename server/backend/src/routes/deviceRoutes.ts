import { Router } from 'express';
import { DataSource } from 'typeorm';
import { Device, DeviceAttrsSnapshot, Room } from '../entities/index.js';
import { sendCommand } from '../services/mqttService.js';
import { nanoid } from 'nanoid';
import { logger } from '../logger.js';

function canManageAllHomes(req: any) {
  return req.auth?.role === 'admin';
}

function isDeviceCategory(value: unknown): value is 'sensor' | 'actuator' | 'both' {
  return value === 'sensor' || value === 'actuator' || value === 'both';
}

function serializeDevice(device: Device) {
  return {
    id: device.id,
    deviceId: device.deviceId,
    name: device.name,
    type: device.type,
    category: device.category,
    status: device.status,
    roomId: device.room?.id,
    homeId: device.room?.home?.id,
    attrs: device.snapshot?.attrs ?? {},
    capabilities: device.capabilities ?? [],
    lastSeen: device.lastSeen ?? null,
    fwVersion: device.fwVersion ?? null,
    secret: device.secret,
  };
}

async function findRoomForRequest(dataSource: DataSource, req: any, roomId: string, homeId: string) {
  const roomRepo = dataSource.getRepository(Room);
  const where = canManageAllHomes(req)
    ? { id: roomId, home: { id: homeId } }
    : { id: roomId, home: { id: homeId, owner: { id: req.auth?.userId } } };

  return roomRepo.findOne({
    where: where as any,
    relations: {
      home: true,
    } as any,
  });
}

async function findDeviceForRequest(dataSource: DataSource, req: any, deviceId: string) {
  const repo = dataSource.getRepository(Device);
  const where = canManageAllHomes(req)
    ? { deviceId }
    : { deviceId, room: { home: { owner: { id: req.auth?.userId } } } };

  return repo.findOne({
    where: where as any,
    relations: {
      room: {
        home: {
          owner: true,
        },
      },
      capabilities: true,
    } as any,
  });
}

export function createDeviceRoutes(dataSource: DataSource, mqttClient: import('mqtt').MqttClient) {
  const router = Router();

  router.get('/homes/:homeId/devices', async (req, res) => {
    const list = await dataSource.getRepository(Device).find({
      where: canManageAllHomes(req)
        ? { room: { home: { id: req.params.homeId } } }
        : { room: { home: { id: req.params.homeId, owner: { id: req.auth?.userId } } } } as any,
      relations: {
        capabilities: true,
      } as any,
      order: {
        createdAt: 'ASC',
      },
    });

    res.json(list.map(serializeDevice));
  });

  router.post('/homes/:homeId/devices/pre-register', async (req, res) => {
    const { homeId } = req.params;
    const { roomId, deviceId, name, type, category } = req.body;

    const room = await findRoomForRequest(dataSource, req, roomId, homeId);
    if (!room) return res.status(404).json({ code: 404, msg: 'room not found' });

    const repo = dataSource.getRepository(Device);
    const existing = await repo.findOne({ where: { deviceId } });
    if (existing) return res.status(409).json({ code: 409, msg: 'device already exists' });

    const secret = nanoid();
    const device = repo.create({
      deviceId,
      name,
      type,
      category,
      room,
      secret,
      status: 'offline',
    });
    await repo.save(device);

    res.json({
      status: 'ok',
      secret,
      homeId,
      roomId,
      device: serializeDevice(device),
    });
  });

  router.get('/devices/:deviceId', async (req, res) => {
    const device = await findDeviceForRequest(dataSource, req, req.params.deviceId);
    if (!device) return res.status(404).json({ error: 'not found' });
    res.json(serializeDevice(device));
  });

  router.patch('/devices/:deviceId', async (req, res) => {
    const device = await findDeviceForRequest(dataSource, req, req.params.deviceId);
    if (!device) return res.status(404).json({ code: 404, msg: 'device not found' });

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      device.name = req.body.name.trim();
    }
    if (typeof req.body.type === 'string') {
      device.type = req.body.type.trim() || undefined;
    }
    if (typeof req.body.category === 'string') {
      const category = req.body.category.trim();
      if (!isDeviceCategory(category)) {
        return res.status(400).json({ code: 400, msg: 'invalid device category' });
      }
      device.category = category;
    }
    if (typeof req.body.roomId === 'string' && req.body.roomId.trim()) {
      const targetHomeId =
        typeof req.body.homeId === 'string' && req.body.homeId.trim()
          ? req.body.homeId.trim()
          : device.room?.home?.id;
      if (!targetHomeId) return res.status(400).json({ code: 400, msg: 'homeId required' });

      const room = await findRoomForRequest(dataSource, req, req.body.roomId.trim(), targetHomeId);
      if (!room) return res.status(404).json({ code: 404, msg: 'target room not found' });
      device.room = room;
    }

    await dataSource.getRepository(Device).save(device);
    const refreshed = await findDeviceForRequest(dataSource, req, device.deviceId);
    res.json(serializeDevice(refreshed ?? device));
  });

  router.post('/devices/:deviceId/command', async (req, res) => {
    const { deviceId } = req.params;
    const { homeId, roomId, method, params } = req.body;
    const device = await dataSource.getRepository(Device).findOne({
      where: { deviceId },
      relations: ['room', 'room.home', 'room.home.owner'],
    });
    if (!device) return res.status(404).json({ code: 404, msg: 'device not found' });

    const auth = req.auth;
    const deviceHomeId = device.room?.home?.id;
    const ownerId = device.room?.home?.owner?.id;
    const isAdmin = auth?.role === 'admin';
    const ownsHome = auth?.userId && ownerId && auth.userId === ownerId;
    const inHomeIds = auth?.homeIds && deviceHomeId && auth.homeIds.includes(deviceHomeId);
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
    logger.debug({ deviceId, cmdId, method, homeId, roomId }, 'command dispatched');
    res.json({ status: 'sent', cmdId });
  });

  router.get('/devices/:deviceId/attrs', async (req, res) => {
    const device = await findDeviceForRequest(dataSource, req, req.params.deviceId);
    if (!device) return res.status(404).json({ error: 'not found' });

    const snapRepo = dataSource.getRepository(DeviceAttrsSnapshot);
    const snap = await snapRepo.findOne({
      where: { device: { deviceId: req.params.deviceId } },
    });
    if (!snap) return res.status(404).json({ error: 'no snapshot' });
    res.json(snap);
  });

  router.delete('/devices/:deviceId', async (req, res) => {
    const device = await findDeviceForRequest(dataSource, req, req.params.deviceId);
    if (!device) return res.status(404).json({ code: 404, msg: 'device not found' });

    await dataSource.getRepository(Device).remove(device);
    logger.debug({ deviceId: device.deviceId, roomId: device.room?.id }, 'device deleted');
    res.json({ status: 'ok', deviceId: device.deviceId });
  });

  return router;
}
