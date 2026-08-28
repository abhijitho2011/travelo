import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { RedisProvider, REDIS } from './redis.provider';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        if (!url) {
          // BullMQ requires redis; provide a dummy conn options that will only be used if a queue is registered.
          // No REDIS_URL configured — provide an inert connection; queues won't be exercised until
          // REDIS_URL is set. Host is deliberately unroutable to fail fast if used.
          return { connection: { host: '0.0.0.0', port: 6379, lazyConnect: true } };
        }
        const u = new URL(url);
        return {
          connection: {
            host: u.hostname,
            port: Number(u.port || 6379),
            password: u.password || undefined,
            username: u.username || undefined,
          },
        };
      },
    }),
  ],
  providers: [RedisProvider],
  exports: [REDIS, BullModule],
})
export class QueueModule {}
