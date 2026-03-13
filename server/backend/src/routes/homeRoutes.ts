import { Router } from 'express';
import { DataSource } from 'typeorm';
import { Device, Home, Room, User } from '../entities/index.js';
import { logger } from '../logger.js';

function canManageAllHomes(req: any) {
  return req.auth?.role === 'admin';
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
  };
}

function serializeRoom(room: Room) {
  const devices = room.devices ?? [];
  const onlineDevicesCount = devices.filter((device) => device.status === 'online').length;

  return {
    id: room.id,
    name: room.name,
    floor: room.floor ?? null,
    type: room.type ?? null,
    homeId: room.home?.id,
    devicesCount: devices.length,
    onlineDevicesCount,
    devices: devices.map(serializeDevice),
  };
}

function serializeHome(home: Home) {
  const rooms = home.rooms ?? [];
  const devices = rooms.flatMap((room) => room.devices ?? []);
  const onlineDevicesCount = devices.filter((device) => device.status === 'online').length;

  return {
    id: home.id,
    name: home.name,
    address: home.address ?? null,
    timezone: home.timezone,
    owner: home.owner ? { id: home.owner.id, email: home.owner.email } : undefined,
    roomsCount: rooms.length,
    devicesCount: devices.length,
    onlineDevicesCount,
    automationsCount: home.automations?.length ?? 0,
  };
}

async function findHomeForRequest(
  dataSource: DataSource,
  req: any,
  homeId: string,
  includeStructure = false,
) {
  const homeRepo = dataSource.getRepository(Home);
  const relations = includeStructure
    ? {
        owner: true,
        automations: true,
        rooms: {
          devices: {
            capabilities: true,
          },
        },
      }
    : {
        owner: true,
      };

  const where = canManageAllHomes(req)
    ? { id: homeId }
    : { id: homeId, owner: { id: req.auth?.userId } };

  return homeRepo.findOne({
    where: where as any,
    relations: relations as any,
    order: includeStructure
      ? {
          rooms: {
            createdAt: 'ASC',
          },
        }
      : undefined,
  });
}

async function findRoomForRequest(dataSource: DataSource, req: any, roomId: string) {
  const roomRepo = dataSource.getRepository(Room);
  const where = canManageAllHomes(req)
    ? { id: roomId }
    : { id: roomId, home: { owner: { id: req.auth?.userId } } };

  return roomRepo.findOne({
    where: where as any,
    relations: {
      home: true,
      devices: true,
    } as any,
  });
}

export function createHomeRoutes(dataSource: DataSource) {
  const router = Router();

  router.get('/homes', async (req, res) => {
    const repo = dataSource.getRepository(Home);
    const homes = await repo.find({
      where: canManageAllHomes(req) ? {} : { owner: { id: req.auth?.userId } } as any,
      relations: {
        owner: true,
        automations: true,
        rooms: {
          devices: true,
        },
      } as any,
      order: {
        createdAt: 'ASC',
      },
    });

    res.json(homes.map(serializeHome));
  });

  router.post('/homes', async (req, res) => {
    const ownerId = canManageAllHomes(req) ? (req.body.ownerId || req.auth?.userId) : req.auth?.userId;
    if (!ownerId) return res.status(400).json({ code: 400, msg: 'ownerId required' });

    const user = await dataSource.getRepository(User).findOne({ where: { id: ownerId } });
    if (!user) return res.status(400).json({ code: 400, msg: 'owner not found' });

    const repo = dataSource.getRepository(Home);
    const home = repo.create({
      name: req.body.name,
      address: req.body.address,
      timezone: req.body.timezone || 'Asia/Shanghai',
      owner: user,
    });
    await repo.save(home);

    logger.debug({ homeId: home.id, ownerId: user.id }, 'home created');

    const fullHome = await repo.findOne({
      where: { id: home.id },
      relations: {
        owner: true,
        rooms: {
          devices: true,
        },
        automations: true,
      } as any,
    });

    res.json(serializeHome(fullHome ?? home));
  });

  router.patch('/homes/:homeId', async (req, res) => {
    const home = await findHomeForRequest(dataSource, req, req.params.homeId);
    if (!home) return res.status(404).json({ code: 404, msg: 'home not found' });

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      home.name = req.body.name.trim();
    }
    if (typeof req.body.timezone === 'string' && req.body.timezone.trim()) {
      home.timezone = req.body.timezone.trim();
    }
    if (typeof req.body.address === 'string') {
      home.address = req.body.address.trim() || undefined;
    }

    await dataSource.getRepository(Home).save(home);

    const refreshed = await findHomeForRequest(dataSource, req, home.id, true);
    res.json(serializeHome(refreshed ?? home));
  });

  router.get('/homes/:homeId/structure', async (req, res) => {
    const home = await findHomeForRequest(dataSource, req, req.params.homeId, true);
    if (!home) return res.status(404).json({ code: 404, msg: 'home not found' });

    const rooms = (home.rooms ?? []).map(serializeRoom);
    res.json({
      home: serializeHome(home),
      rooms,
      selectedRoomId: rooms[0]?.id ?? null,
    });
  });

  router.get('/homes/:homeId/rooms', async (req, res) => {
    const home = await findHomeForRequest(dataSource, req, req.params.homeId, true);
    if (!home) return res.status(404).json({ code: 404, msg: 'home not found' });

    res.json((home.rooms ?? []).map(serializeRoom));
  });

  router.post('/homes/:homeId/rooms', async (req, res) => {
    const home = await findHomeForRequest(dataSource, req, req.params.homeId);
    if (!home) return res.status(404).json({ code: 404, msg: 'home not found' });

    const repo = dataSource.getRepository(Room);
    const room = repo.create({
      home,
      name: req.body.name,
      floor: req.body.floor,
      type: req.body.type,
    });
    await repo.save(room);

    logger.debug({ roomId: room.id, homeId: home.id }, 'room created');

    const fullRoom = await repo.findOne({
      where: { id: room.id },
      relations: {
        home: true,
        devices: true,
      } as any,
    });

    res.json(serializeRoom(fullRoom ?? room));
  });

  router.patch('/rooms/:roomId', async (req, res) => {
    const room = await findRoomForRequest(dataSource, req, req.params.roomId);
    if (!room) return res.status(404).json({ code: 404, msg: 'room not found' });

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      room.name = req.body.name.trim();
    }
    if (typeof req.body.floor === 'string') {
      room.floor = req.body.floor.trim() || undefined;
    }
    if (typeof req.body.type === 'string') {
      room.type = req.body.type.trim() || undefined;
    }

    await dataSource.getRepository(Room).save(room);

    const refreshed = await findRoomForRequest(dataSource, req, room.id);
    res.json(serializeRoom(refreshed ?? room));
  });

  return router;
}
