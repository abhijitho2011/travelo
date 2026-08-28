import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentAdmin, AuthenticatedAdmin } from '../../common/decorators/current-admin.decorator';
import { ImpersonationService } from './impersonation.service';
import { AuditService } from '../audit/audit.service';

class StartDto {
  @IsIn(['OWNER', 'GM', 'AGM']) targetUserType!: 'OWNER' | 'GM' | 'AGM';
  @IsOptional() @IsUUID() targetUserId?: string;
  @IsOptional() @IsUUID() targetOwnerId?: string;
  @IsOptional() @IsUUID() targetPropertyId?: string;
  @IsString() reason!: string;
}

@ApiTags('Impersonation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('impersonation')
export class ImpersonationController {
  constructor(
    private readonly svc: ImpersonationService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @RequirePermissions('impersonation.start')
  start(@CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: StartDto) {
    return this.svc.start({ ...dto, actorAdminId: admin.id }, this.audit);
  }

  @Get('history')
  @RequirePermissions('impersonation.view')
  history(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('actorAdminId') actorAdminId?: string,
  ) {
    return this.svc.history({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      actorAdminId,
    });
  }

  @Get(':id')
  @RequirePermissions('impersonation.view')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post(':id/terminate')
  @RequirePermissions('impersonation.stop')
  terminate(@Param('id') id: string) {
    return this.svc.terminate(id, this.audit);
  }
}
