import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');
export type RedisClient = Redis | null;

export const RedisProvider: Provider = {
  provide: REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService): RedisClient => {
    const url = config.get<string>('REDIS_URL');
    const logger = new Logger('Redis');
    if (!url) {
      logger.warn('REDIS_URL not set — running with in-memory fallbacks (dev/test only).');
      return null;
    }
    const client = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
    client.on('error', (err) => logger.error(`Redis error: ${err.message}`));
    client.on('connect', () => logger.log('Connected to Redis'));
    return client;
  },
};
