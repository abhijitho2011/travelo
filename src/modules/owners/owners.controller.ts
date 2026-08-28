import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OwnersService } from './owners.service';
import { CreateOwnerDto, OwnerFilterDto, SetOwnerStatusDto, UpdateOwnerDto } from './dto';

@ApiTags('Owners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('owners')
export class OwnersController {
  constructor(private readonly svc: OwnersService) {}

  @Get()
  @RequirePermissions('owner.view')
  list(@Query() q: OwnerFilterDto) {
    return this.svc.list(q);
  }

  @Post()
  @RequirePermissions('owner.create')
  create(@Body() dto: CreateOwnerDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  @RequirePermissions('owner.view')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  @RequirePermissions('owner.edit')
  update(@Param('id') id: string, @Body() dto: UpdateOwnerDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/activate')
  @RequirePermissions('owner.edit')
  activate(@Param('id') id: string, @Body() dto: SetOwnerStatusDto) {
    return this.svc.setStatus(id, 'ACTIVE', dto.reason);
  }

  @Post(':id/suspend')
  @RequirePermissions('owner.suspend')
  suspend(@Param('id') id: string, @Body() dto: SetOwnerStatusDto) {
    return this.svc.setStatus(id, 'SUSPENDED', dto.reason);
  }

  @Post(':id/block')
  @RequirePermissions('owner.suspend')
  block(@Param('id') id: string, @Body() dto: SetOwnerStatusDto) {
    return this.svc.setStatus(id, 'BLOCKED', dto.reason);
  }

  @Post(':id/unblock')
  @RequirePermissions('owner.suspend')
  unblock(@Param('id') id: string, @Body() dto: SetOwnerStatusDto) {
    return this.svc.setStatus(id, 'ACTIVE', dto.reason);
  }

  @Get(':id/overview')
  @RequirePermissions('owner.view')
  overview(@Param('id') id: string) {
    return this.svc.overview(id);
  }

  @Get(':id/properties')
  @RequirePermissions('property.view')
  properties(@Param('id') id: string) {
    return this.svc.listProperties(id);
  }
}
