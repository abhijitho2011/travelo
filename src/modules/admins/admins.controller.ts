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
import { AdminsService } from './admins.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateAdminDto, SetStatusDto, UpdateAdminDto } from './dto/admin.dto';

@ApiTags('Admins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin-users')
export class AdminsController {
  constructor(private readonly svc: AdminsService) {}

  @Get()
  @RequirePermissions('admin.view')
  list(@Query('limit') limit?: string, @Query('offset') offset?: string, @Query('q') q?: string) {
    return this.svc.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      q,
    });
  }

  @Get(':id')
  @RequirePermissions('admin.view')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  @RequirePermissions('admin.create')
  create(@Body() dto: CreateAdminDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.edit')
  update(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('admin.edit')
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.svc.setStatus(id, dto.status, dto.reason);
  }

  @Get(':id/sessions')
  @RequirePermissions('admin.view')
  sessions(@Param('id') id: string) {
    return this.svc.listSessions(id);
  }

  @Delete(':id/sessions/:sid')
  @RequirePermissions('admin.edit')
  revoke(@Param('id') id: string, @Param('sid') sid: string) {
    return this.svc.revokeSession(id, sid);
  }
}
