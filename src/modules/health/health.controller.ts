import { Controller, Get, Inject } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { REDIS, RedisClient } from '../../queue/redis.provider';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  root() {
    return this.health.check([() => this.pingDb(), () => this.pingRedis()]);
  }

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.pingDb(), () => this.pingRedis()]);
  }

  private async pingDb(): Promise<HealthIndicatorResult> {
    try {
      const r = await this.pool.query('SELECT 1 AS ok');
      return { database: { status: 'up', ok: r.rows[0].ok === 1 } };
    } catch (err) {
      return { database: { status: 'down', message: (err as Error).message } };
    }
  }

  private async pingRedis(): Promise<HealthIndicatorResult> {
    if (!this.redis) return { redis: { status: 'up', mode: 'disabled' } };
    try {
      const pong = await this.redis.ping();
      return { redis: { status: pong === 'PONG' ? 'up' : 'down' } };
    } catch (err) {
      return { redis: { status: 'down', message: (err as Error).message } };
    }
  }
}
