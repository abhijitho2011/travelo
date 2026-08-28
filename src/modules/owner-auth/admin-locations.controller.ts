import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { LocationsService } from './locations.service';
import { AuditService } from '../audit/audit.service';

class NameDto {
  @IsString() @Length(1, 128) name!: string;
}

@ApiTags('Admin Settings - Locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('settings/locations')
export class AdminLocationsController {
  constructor(
    private readonly locations: LocationsService,
    private readonly audit: AuditService,
  ) {}

  @Get('states')
  @RequirePermissions('settings.locations.manage')
  listStates() {
    return this.locations.listStates();
  }

  @Post('states')
  @RequirePermissions('settings.locations.manage')
  async createState(@Body() dto: NameDto) {
    const row = await this.locations.createState(dto.name);
    await this.audit.record({
      action: 'settings.location.state.created',
      entity: 'location_state',
      entityId: row.id,
      after: row,
    });
    return row;
  }

  @Delete('states/:id')
  @RequirePermissions('settings.locations.manage')
  async deleteState(@Param('id') id: string) {
    const res = await this.locations.deleteState(id);
    await this.audit.record({
      action: 'settings.location.state.deleted',
      entity: 'location_state',
      entityId: id,
    });
    return res;
  }

  @Get('states/:stateId/districts')
  @RequirePermissions('settings.locations.manage')
  listDistricts(@Param('stateId') stateId: string) {
    return this.locations.listDistricts(stateId);
  }

  @Post('states/:stateId/districts')
  @RequirePermissions('settings.locations.manage')
  async createDistrict(@Param('stateId') stateId: string, @Body() dto: NameDto) {
    const row = await this.locations.createDistrict(stateId, dto.name);
    await this.audit.record({
      action: 'settings.location.district.created',
      entity: 'location_district',
      entityId: row.id,
      after: row,
    });
    return row;
  }

  @Delete('districts/:id')
  @RequirePermissions('settings.locations.manage')
  async deleteDistrict(@Param('id') id: string) {
    const res = await this.locations.deleteDistrict(id);
    await this.audit.record({
      action: 'settings.location.district.deleted',
      entity: 'location_district',
      entityId: id,
    });
    return res;
  }
}
