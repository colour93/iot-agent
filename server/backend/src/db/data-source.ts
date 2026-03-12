import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from '../config/env.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { entities } from '../entities/index.js';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsPath = path.join(__dirname, '..', 'migrations', '*.{ts,js}');

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: config.postgres.url,
  synchronize: true,
  logging: false,
  entities,
  migrations: [migrationsPath],
});

export async function initDataSource() {
  if (!AppDataSource.isInitialized) {
    try {
      logger.info('Connecting Postgres...');
      await AppDataSource.initialize();
      logger.info('Postgres connected');
    } catch (err) {
      logger.error({ err }, 'Postgres connection failed');
      throw err;
    }
  }
  return AppDataSource;
}

