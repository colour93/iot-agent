import { Router } from 'express';
import { DataSource } from 'typeorm';
import { Home, Room, User } from '../entities/index.js';
import { logger } from '../logger.js';

export function createHomeRoutes(dataSource: DataSource) {
  const router = Router();

  router.get('/homes', async (_req, res) => {
    const homes = await dataSource.getRepository(Home).find();
    res.json(homes);
  });

  router.post('/homes', async (req, res) => {
    const ownerId = req.body.ownerId || (req as any).auth?.userId;
    if (!ownerId) return res.status(400).json({ code: 400, msg: 'ownerId required' });
    const user = await dataSource.getRepository(User).findOne({ where: { id: ownerId } });
    if (!user) return res.status(400).json({ code: 400, msg: 'owner not found' });
    const repo = dataSource.getRepository(Home);
    const home = repo.create({
      name: req.body.name,
      timezone: req.body.timezone || 'Asia/Shanghai',
      owner: user,
    });
    await repo.save(home);
    logger.debug({ homeId: home.id, ownerId: user.id }, 'home created');
    res.json(home);
  });

  router.get('/homes/:homeId/rooms', async (req, res) => {
    const rooms = await dataSource
      .getRepository(Room)
      .find({ where: { home: { id: req.params.homeId } } });
    res.json(rooms);
  });

  router.post('/homes/:homeId/rooms', async (req, res) => {
    const home = await dataSource.getRepository(Home).findOne({ where: { id: req.params.homeId } });
    if (!home) return res.status(400).json({ code: 400, msg: 'home not found' });
    const repo = dataSource.getRepository(Room);
    const room = repo.create({
      home,
      name: req.body.name,
      floor: req.body.floor,
      type: req.body.type,
    });
    await repo.save(room);
    logger.debug({ roomId: room.id, homeId: home.id }, 'room created');
    res.json(room);
  });

  return router;
}

