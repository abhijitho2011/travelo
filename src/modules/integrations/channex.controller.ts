import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ChannexSyncService } from './channex-sync.service';

/**
 * The Channex admin surface, mounted under the existing integrations
 * controller's path so `/api/v1/admin/integrations/:id/...` stays one resource.
 */
@ApiTags('Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integrations')
export class ChannexController {
  constructor(
    private readonly svc: ChannexSyncService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Trigger a run now. Audited BEFORE the result is known — "who pressed sync"
   * is the question an operator asks about a run that then went wrong.
   */
  @Post(':id/sync')
  @RequirePermissions('integration.sync')
  async sync(@Param('id', ParseUUIDPipe) id: string) {
    await this.audit.record({
      action: 'integration.sync',
      entity: 'integration_connection',
      entityId: id,
    });
    return this.svc.syncConnection(id);
  }

  @Get(':id/logs')
  @RequirePermissions('integration.view')
  async logs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // 404s a non-Channex or missing connection before paging an empty list.
    await this.svc.requireChannexConnection(id);
    return this.svc.listLogs(id, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}

/**
 * Channex's inbound hook. Public by necessity — a channel manager holds no
 * admin token — so the shared secret and the idempotency table are the whole
 * of its protection, and the handler re-reads the booking from the API rather
 * than trusting the body.
 */
@ApiTags('Webhooks')
@Controller('webhooks/channex')
export class ChannexWebhookController {
  constructor(
    private readonly svc: ChannexSyncService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post()
  handle(
    @Body() body: Record<string, unknown>,
    @Headers('x-channex-signature') signature?: string,
    @Headers('x-api-key') apiKeyHeader?: string,
  ) {
    return this.svc.handleWebhook({
      payload: body ?? {},
      secret: this.config.get<string>('CHANNEX_WEBHOOK_SECRET'),
      providedSecret: signature ?? apiKeyHeader,
    });
  }
}
