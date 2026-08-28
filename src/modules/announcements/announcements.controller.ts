import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AnnouncementsService } from './announcements.service';

class CreateDto {
  @IsString() title!: string;
  @IsString() message!: string;
  audience!: unknown;
  @IsOptional() channels?: unknown;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() scheduledAt?: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsString() status?: string;
}

@ApiTags('Announcements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  @Get()
  @RequirePermissions('announcement.view')
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      status,
    });
  }

  @Get(':id')
  @RequirePermissions('announcement.view')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  @RequirePermissions('announcement.edit')
  create(@Body() dto: CreateDto) {
    return this.svc.create({
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }

  @Patch(':id')
  @RequirePermissions('announcement.edit')
  update(@Param('id') id: string, @Body() dto: Partial<CreateDto>) {
    return this.svc.update(id, {
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }

  @Post(':id/publish')
  @RequirePermissions('announcement.edit')
  publish(@Param('id') id: string) {
    return this.svc.publish(id);
  }

  @Delete(':id')
  @RequirePermissions('announcement.edit')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
