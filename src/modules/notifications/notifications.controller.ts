import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentAdmin, AuthenticatedAdmin } from '../../common/decorators/current-admin.decorator';
import { NotificationsService } from './notifications.service';

class TemplateDto {
  @IsString() templateKey!: string;
  @IsString() name!: string;
  @IsString() channel!: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() body!: string;
  @IsOptional() @IsString() status?: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  @RequirePermissions('notification.view')
  list(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unread') unread?: string,
  ) {
    return this.svc.listForAdmin(admin.id, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      unread: unread === 'true',
    });
  }

  @Post(':id/read')
  @RequirePermissions('notification.view')
  read(@CurrentAdmin() admin: AuthenticatedAdmin, @Param('id') id: string) {
    return this.svc.markRead(admin.id, id);
  }

  @Post('read-all')
  @RequirePermissions('notification.view')
  readAll(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.svc.markAllRead(admin.id);
  }

  @Get('templates')
  @RequirePermissions('notification.view')
  templates() {
    return this.svc.listTemplates();
  }

  @Post('templates')
  @RequirePermissions('notification.edit')
  upsertTemplate(@Body() dto: TemplateDto) {
    return this.svc.upsertTemplate(dto);
  }
}
