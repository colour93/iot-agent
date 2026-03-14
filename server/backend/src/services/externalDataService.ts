import { DataSource } from 'typeorm';
import { ExternalDataCache, Home } from '../entities/index.js';
import { logger } from '../logger.js';
import { redis } from './redisClient.js';

const WEATHER_CACHE_TTL_SECONDS = 15 * 60;
const REDIS_WEATHER_KEY_PREFIX = 'external:weather:home:';
const DB_WEATHER_SOURCE = 'weather';
const DB_SEASON_SOURCE = 'season';

type WeatherSnapshot = {
  temperature?: number;
  humidity?: number;
  weatherCode?: number;
  fetchedAt: string;
  source: 'live' | 'db-cache' | 'redis-cache' | 'fallback';
};

function seasonNameFromMonth(month: number) {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

function resolveCoordinatesByTimezone(timezone: string | undefined) {
  const normalized = (timezone || '').trim();
  if (normalized === 'America/Los_Angeles') {
    return { lat: 37.7749, lon: -122.4194, tz: 'America/Los_Angeles' };
  }
  if (normalized === 'Europe/London') {
    return { lat: 51.5072, lon: -0.1276, tz: 'Europe/London' };
  }
  if (normalized === 'Asia/Tokyo') {
    return { lat: 35.6764, lon: 139.6500, tz: 'Asia/Tokyo' };
  }
  return { lat: 31.2304, lon: 121.4737, tz: 'Asia/Shanghai' };
}

function weatherRedisKey(homeId: string) {
  return `${REDIS_WEATHER_KEY_PREFIX}${homeId}`;
}

async function loadWeatherFromRedis(homeId: string): Promise<WeatherSnapshot | null> {
  try {
    const raw = await redis.get(weatherRedisKey(homeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeatherSnapshot;
    return parsed;
  } catch (err) {
    logger.warn({ err, homeId }, 'load weather from redis failed');
    return null;
  }
}

async function saveWeatherToRedis(homeId: string, snapshot: WeatherSnapshot) {
  try {
    await redis.set(weatherRedisKey(homeId), JSON.stringify(snapshot), {
      EX: WEATHER_CACHE_TTL_SECONDS,
    });
  } catch (err) {
    logger.warn({ err, homeId }, 'save weather to redis failed');
  }
}

async function loadWeatherFromDb(dataSource: DataSource, homeId: string): Promise<WeatherSnapshot | null> {
  const repo = dataSource.getRepository(ExternalDataCache);
  const item = await repo.findOne({
    where: {
      source: DB_WEATHER_SOURCE,
      cacheKey: `home:${homeId}`,
    },
    order: {
      updatedAt: 'DESC',
    },
  });
  if (!item) return null;
  if (item.expireAt.getTime() <= Date.now()) return null;

  return {
    temperature: Number(item.payload.temperature),
    humidity: Number(item.payload.humidity),
    weatherCode: Number(item.payload.weatherCode),
    fetchedAt: String(item.payload.fetchedAt ?? item.updatedAt.toISOString()),
    source: 'db-cache',
  };
}

async function saveWeatherToDb(
  dataSource: DataSource,
  homeId: string,
  snapshot: WeatherSnapshot,
  ttlSeconds: number,
) {
  const repo = dataSource.getRepository(ExternalDataCache);
  const expireAt = new Date(Date.now() + ttlSeconds * 1000);
  const cacheKey = `home:${homeId}`;

  let item = await repo.findOne({
    where: {
      source: DB_WEATHER_SOURCE,
      cacheKey,
    },
  });
  if (!item) {
    item = repo.create({
      source: DB_WEATHER_SOURCE,
      cacheKey,
      payload: {},
      expireAt,
    });
  }
  item.payload = {
    temperature: snapshot.temperature ?? null,
    humidity: snapshot.humidity ?? null,
    weatherCode: snapshot.weatherCode ?? null,
    fetchedAt: snapshot.fetchedAt,
  };
  item.expireAt = expireAt;
  await repo.save(item);
}

async function saveSeasonToDb(dataSource: DataSource, homeId: string, seasonName: string, month: number) {
  const repo = dataSource.getRepository(ExternalDataCache);
  const cacheKey = `home:${homeId}`;
  const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  let item = await repo.findOne({
    where: {
      source: DB_SEASON_SOURCE,
      cacheKey,
    },
  });
  if (!item) {
    item = repo.create({
      source: DB_SEASON_SOURCE,
      cacheKey,
      payload: {},
      expireAt,
    });
  }
  item.payload = {
    season: seasonName,
    month,
    updatedAt: new Date().toISOString(),
  };
  item.expireAt = expireAt;
  await repo.save(item);
}

async function fetchWeather(timezone: string | undefined): Promise<WeatherSnapshot> {
  const coords = resolveCoordinatesByTimezone(timezone);
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(coords.lat));
  url.searchParams.set('longitude', String(coords.lon));
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code');
  url.searchParams.set('timezone', coords.tz);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`weather_fetch_failed:${response.status}`);
    }
    const data = (await response.json()) as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
      };
    };
    const current = data.current ?? {};
    return {
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      weatherCode: current.weather_code,
      fetchedAt: new Date().toISOString(),
      source: 'live',
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildFallbackWeather(): WeatherSnapshot {
  return {
    temperature: 24,
    humidity: 55,
    weatherCode: 0,
    fetchedAt: new Date().toISOString(),
    source: 'fallback',
  };
}

async function resolveWeatherForHome(
  dataSource: DataSource,
  homeId: string,
  timezone: string | undefined,
) {
  const redisCache = await loadWeatherFromRedis(homeId);
  if (redisCache) {
    return { ...redisCache, source: 'redis-cache' as const };
  }

  const dbCache = await loadWeatherFromDb(dataSource, homeId);
  if (dbCache) {
    await saveWeatherToRedis(homeId, dbCache);
    return dbCache;
  }

  try {
    const live = await fetchWeather(timezone);
    await Promise.all([
      saveWeatherToRedis(homeId, live),
      saveWeatherToDb(dataSource, homeId, live, WEATHER_CACHE_TTL_SECONDS),
    ]);
    return live;
  } catch (err) {
    logger.warn({ err, homeId }, 'fetch weather failed, fallback to default snapshot');
    const fallback = buildFallbackWeather();
    await Promise.all([
      saveWeatherToRedis(homeId, fallback),
      saveWeatherToDb(dataSource, homeId, fallback, Math.floor(WEATHER_CACHE_TTL_SECONDS / 3)),
    ]);
    return fallback;
  }
}

export async function buildExternalContext(dataSource: DataSource, homeId: string) {
  const home = await dataSource.getRepository(Home).findOne({
    where: { id: homeId },
    select: {
      id: true,
      timezone: true,
    },
  });

  const now = new Date();
  const month = now.getMonth() + 1;
  const season = seasonNameFromMonth(month);
  const weather = await resolveWeatherForHome(dataSource, homeId, home?.timezone);
  await saveSeasonToDb(dataSource, homeId, season, month);

  return {
    'external.weather.temperature': weather.temperature ?? null,
    'external.weather.humidity': weather.humidity ?? null,
    'external.weather.code': weather.weatherCode ?? null,
    'external.weather.fetchedAt': weather.fetchedAt,
    'external.weather.source': weather.source,
    'external.season.name': season,
    'external.season.month': month,
  } satisfies Record<string, unknown>;
}

export async function refreshAllHomeExternalData(dataSource: DataSource) {
  const homes = await dataSource.getRepository(Home).find({
    select: {
      id: true,
      timezone: true,
    },
  });
  for (const home of homes) {
    try {
      await resolveWeatherForHome(dataSource, home.id, home.timezone);
      const month = new Date().getMonth() + 1;
      await saveSeasonToDb(dataSource, home.id, seasonNameFromMonth(month), month);
    } catch (err) {
      logger.warn({ err, homeId: home.id }, 'refresh external data failed');
    }
  }
}
