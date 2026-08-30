import { Body, Controller, Get, Param, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { GroupsService } from './groups.service';

class CreateGroupDto {
  @IsString() @Length(2, 160) name!: string;
  @IsOptional() @IsString() @Length(1, 160) contactName?: string;
  @IsOptional() @IsString() @Length(6, 32) contactPhone?: string;
  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
}
class AttachDto {
  @IsUUID() reservationId!: string;
}

@ApiTags('Staff Groups')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/groups', version: VERSION_NEUTRAL })
export class StaffGroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @RequireStaffPermissions('reservation.read')
  list(@CurrentStaff() me: AuthenticatedStaff) {
    return this.groups.list(me.propertyId);
  }

  @Post()
  @RequireStaffPermissions('reservation.create')
  create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateGroupDto) {
    return this.groups.create(me.propertyId, dto, me.id);
  }

  @Get(':id')
  @RequireStaffPermissions('reservation.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.groups.get(me.propertyId, id);
  }

  @Post(':id/attach')
  @RequireStaffPermissions('reservation.update')
  attach(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: AttachDto,
  ) {
    return this.groups.attach(me.propertyId, id, dto.reservationId);
  }
}
