import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Home, User } from '../entities/index.js';
import { issueToken } from '../middleware/auth.js';

async function resolveUserHomeIds(dataSource: DataSource, user: User) {
  if (user.role === 'admin') return [] as string[];

  const homes = await dataSource.getRepository(Home).find({
    where: {
      owner: {
        id: user.id,
      },
    } as any,
    select: {
      id: true,
    },
  });
  return homes.map((home) => home.id);
}

export function createAuthRoutes(dataSource: DataSource) {
  const router = Router();

  router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await dataSource.getRepository(User).findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    const homeIds = await resolveUserHomeIds(dataSource, user);
    const token = issueToken({ userId: user.id, role: user.role, homeIds });
    res.json({
      token,
      homeIds,
      user: { id: user.id, email: user.email, role: user.role },
    });
  });

  // 简易注册，仅用于开发
  router.post('/auth/register', async (req, res) => {
    const { email, password } = req.body;
    const repo = dataSource.getRepository(User);
    const exists = await repo.findOne({ where: { email } });
    if (exists) return res.status(400).json({ error: 'email_exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = repo.create({ email, passwordHash, role: 'user' });
    await repo.save(user);
    const homeIds: string[] = [];
    const token = issueToken({ userId: user.id, role: user.role, homeIds });
    res.json({
      token,
      homeIds,
      user: { id: user.id, email: user.email, role: user.role },
    });
  });

  return router;
}
