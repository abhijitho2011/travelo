import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly svc: RolesService) {}

  @Get()
  @RequirePermissions('admin.view')
  list() {
    return this.svc.list();
  }

  @Get(':id')
  @RequirePermissions('admin.view')
  get(@Param('id') id: string) {
    return this.svc.getById(id);
  }

  @Post()
  @RequirePermissions('admin.create')
  create(@Body() dto: CreateRoleDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.edit')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.svc.update(id, dto);
  }
}
