import { Inject, Injectable, Module, NotFoundException } from '@nestjs/common';
import { Body, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { integrationConnections } from '../../database/schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { loadEnv } from '../../config/env';
import { AuditModule } from '../audit/audit.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { ChannexClient } from './channex.client';
import { ChannexSyncService } from './channex-sync.service';
import { ChannexController, ChannexWebhookController } from './channex.controller';

@Injectable()
export class IntegrationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(params: { limit?: number; offset?: number; status?: string; ownerId?: string }) {
    const limit = Math.min(params.limit ?? 100, 200);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [];
    if (params.status) conds.push(eq(integrationConnections.status, params.status));
    if (params.ownerId) conds.push(eq(integrationConnections.ownerId, params.ownerId));
    const where = conds.length ? and(...conds) : undefined;
    return this.db
      .select()
      .from(integrationConnections)
      .where(where)
      .orderBy(desc(integrationConnections.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Integration not found');
    return row;
  }

  // Stub: called by health-collector background job.
  async collectHealth() {
    // TODO: gateway call — poll each provider and update status/error_count.
    return { ran: true, at: new Date().toISOString() };
  }
}

@ApiTags('Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get()
  @RequirePermissions('integration.view')
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.svc.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      status,
      ownerId,
    });
  }

  @Get(':id')
  @RequirePermissions('integration.view')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }
}

/**
 * The Channex client is a FACTORY, not a plain provider: its whole contract is
 * "am I configured", and that is decided once, from env, at boot — where the
 * single inert/enabled log line belongs.
 */
export const CHANNEX_CLIENT_PROVIDER = {
  provide: ChannexClient,
  useFactory: () => {
    const env = loadEnv();
    const client = new ChannexClient({
      baseUrl: env.CHANNEX_BASE_URL,
      apiKey: env.CHANNEX_API_KEY,
      enabled: env.CHANNEX_ENABLED,
    });
    client.logBootState();
    return client;
  },
};

@Module({
  imports: [AuditModule, ReservationsModule],
  providers: [IntegrationsService, ChannexSyncService, CHANNEX_CLIENT_PROVIDER],
  controllers: [IntegrationsController, ChannexController, ChannexWebhookController],
  exports: [IntegrationsService, ChannexSyncService],
})
export class IntegrationsModule {}
