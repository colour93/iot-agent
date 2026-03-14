import { Router } from 'express';
import { DataSource, In } from 'typeorm';
import { Command, Device, DeviceAttrsSnapshot, Home, Room } from '../entities/index.js';
import { sendCommand } from '../services/mqttService.js';
import { nanoid } from 'nanoid';
import { logger } from '../logger.js';
import { writeAuditLog } from '../services/auditService.js';

function canManageAllHomes(req: any) {
  return req.auth?.role === 'admin';
}

function claimedHomeIds(req: any) {
  return Array.isArray(req.auth?.homeIds) ? req.auth.homeIds.filter(Boolean) : [];
}

async function canAccessHome(dataSource: DataSource, req: any, homeId: string) {
  if (canManageAllHomes(req)) return true;
  if (claimedHomeIds(req).includes(homeId)) return true;

  const home = await dataSource.getRepository(Home).findOne({
    where: {
      id: homeId,
      owner: { id: req.auth?.userId },
    } as any,
  });
  return !!home;
}

function isDeviceCategory(value: unknown): value is 'sensor' | 'actuator' | 'both' {
  return value === 'sensor' || value === 'actuator' || value === 'both';
}

function isCommandStatus(value: unknown): value is Command['status'] {
  return value === 'pending' || value === 'sent' || value === 'acked' || value === 'failed' || value === 'timeout';
}

function firstQueryString(value: unknown) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }
  return typeof value === 'string' ? value.trim() : '';
}

function serializeCommandRecord(command: Command) {
  return {
    id: command.id,
    cmdId: command.cmdId,
    homeId: command.homeId ?? null,
    roomId: command.roomId ?? null,
    deviceId: command.device?.deviceId ?? null,
    method: command.method,
    params: command.params ?? {},
    status: command.status,
    retryCount: command.retryCount ?? 0,
    error: command.error ?? null,
    result: command.result ?? null,
    sentAt: command.sentAt?.toISOString() ?? null,
    ackAt: command.ackAt?.toISOString() ?? null,
    createdAt: command.createdAt.toISOString(),
    updatedAt: command.updatedAt.toISOString(),
  };
}

async function ensureHomeAccess(
  dataSource: DataSource,
  req: any,
  res: any,
  action: string,
) {
  const homeId = req.params.homeId;
  const allowed = await canAccessHome(dataSource, req, homeId);
  await writeAuditLog(dataSource, {
    req,
    action,
    target: `home:${homeId}`,
    homeId,
    result: allowed ? 'allow' : 'deny',
  });
  if (!allowed) {
    res.status(403).json({ code: 403, msg: 'forbidden' });
    return false;
  }
  return true;
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
  let where: any;
  if (canManageAllHomes(req)) {
    where = { id: roomId, home: { id: homeId } };
  } else if (claimedHomeIds(req).includes(homeId)) {
    where = { id: roomId, home: { id: homeId } };
  } else {
    where = { id: roomId, home: { id: homeId, owner: { id: req.auth?.userId } } };
  }

  return roomRepo.findOne({
    where: where as any,
    relations: {
      home: true,
    } as any,
  });
}

async function findDeviceForRequest(dataSource: DataSource, req: any, deviceId: string) {
  const repo = dataSource.getRepository(Device);
  let where: any;
  if (canManageAllHomes(req)) {
    where = { deviceId };
  } else {
    const homeIds = claimedHomeIds(req);
    const candidates: any[] = [];
    if (req.auth?.userId) {
      candidates.push({
        deviceId,
        room: { home: { owner: { id: req.auth.userId } } },
      });
    }
    if (homeIds.length > 0) {
      candidates.push({
        deviceId,
        room: { home: { id: In(homeIds) } },
      });
    }
    if (candidates.length === 0) {
      where = { deviceId, room: { home: { owner: { id: '__unauthorized__' } } } };
    } else {
      where = candidates.length === 1 ? candidates[0] : candidates;
    }
  }

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
    if (!(await canAccessHome(dataSource, req, req.params.homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

    const homeIds = claimedHomeIds(req);
    const includeClaimed = homeIds.includes(req.params.homeId);
    let where: any;
    if (canManageAllHomes(req)) {
      where = { room: { home: { id: req.params.homeId } } };
    } else {
      const candidates: any[] = [];
      if (req.auth?.userId) {
        candidates.push({
          room: { home: { id: req.params.homeId, owner: { id: req.auth.userId } } },
        });
      }
      if (includeClaimed) {
        candidates.push({
          room: { home: { id: req.params.homeId } },
        });
      }
      if (candidates.length === 0) {
        where = { room: { home: { id: '__unauthorized__' } } };
      } else {
        where = candidates.length === 1 ? candidates[0] : candidates;
      }
    }

    const list = await dataSource.getRepository(Device).find({
      where: where as any,
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

    if (!(await canAccessHome(dataSource, req, homeId))) {
      return res.status(403).json({ code: 403, msg: 'forbidden' });
    }

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

  router.get('/homes/:homeId/commands', async (req, res) => {
    if (!(await ensureHomeAccess(dataSource, req, res, 'command.list'))) return;

    const status = firstQueryString(req.query.status);
    if (status && !isCommandStatus(status)) {
      return res.status(400).json({ code: 400, msg: 'invalid command status' });
    }
    const deviceId = firstQueryString(req.query.deviceId);
    const limitRaw = Number(firstQueryString(req.query.limit) || 30);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 30;

    const where: any = { homeId: req.params.homeId };
    if (status) {
      where.status = status;
    }
    if (deviceId) {
      where.device = { deviceId };
    }

    const commands = await dataSource.getRepository(Command).find({
      where,
      order: {
        createdAt: 'DESC',
      },
      take: limit,
    });

    await writeAuditLog(dataSource, {
      req,
      action: 'command.list.result',
      target: `home:${req.params.homeId}`,
      homeId: req.params.homeId,
      result: 'success',
      meta: {
        count: commands.length,
        limit,
        status: status || null,
        deviceId: deviceId || null,
      },
    });

    res.json({
      commands: commands.map(serializeCommandRecord),
      limit,
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
    const { method, params } = req.body;
    if (typeof method !== 'string' || !method.trim()) {
      return res.status(400).json({ code: 400, msg: 'method required' });
    }

    const device = await findDeviceForRequest(dataSource, req, deviceId);
    if (!device) return res.status(404).json({ code: 404, msg: 'device not found' });

    const cmdId = nanoid();
    const cmdRepo = dataSource.getRepository(Command);
    const command = cmdRepo.create({
      cmdId,
      method: method.trim(),
      params: params && typeof params === 'object' ? params : {},
      status: 'sent',
      device,
      homeId: device.room?.home?.id,
      roomId: device.room?.id,
      sentAt: new Date(),
    });
    await cmdRepo.save(command);

    try {
      await sendCommand(
        mqttClient,
        {
          deviceId,
          homeId: command.homeId,
          roomId: command.roomId,
        },
        {
          cmdId,
          method: method.trim(),
          params: command.params,
          timeout: 5000,
        },
      );
    } catch (err) {
      command.status = 'failed';
      command.error = 'mqtt_publish_failed';
      await cmdRepo.save(command);
      logger.error({ err, deviceId, cmdId }, 'command publish failed');
      return res.status(502).json({ code: 502, msg: 'command publish failed', cmdId });
    }

    logger.debug(
      {
        deviceId,
        cmdId,
        method: method.trim(),
        homeId: command.homeId,
        roomId: command.roomId,
      },
      'command dispatched',
    );
    res.json({ status: 'sent', cmdId, commandStatus: command.status });
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
