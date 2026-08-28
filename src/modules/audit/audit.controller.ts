import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.view')
  async list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('actorId') actorId?: string,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
  ) {
    const result = await this.audit.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      actorId,
      entity,
      entityId,
    });
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        ts: r.createdAt,
        actor: r.actorEmail,
        actorId: r.actorId,
        role: r.actorRole,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        before: r.before,
        after: r.after,
        reason: r.reason,
        ip: r.ip,
        userAgent: r.userAgent,
      })),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }
}
