import { Body, Controller, Get, Patch, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { GuestsService } from './guests.service';

class GuestFlagDto {
  @IsString() @Length(6, 32) phone!: string;
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @IsOptional() @IsBoolean() blacklisted?: boolean;
  @IsOptional() @IsString() @Length(0, 2000) blacklistReason?: string;
}

/**
 * Guest CRM — repeat-guest lookup, stay history and the blacklist.
 * guest.read to look up; guest.update to change the overlay (blacklist/notes).
 */
@ApiTags('Staff Guests')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/guests', version: VERSION_NEUTRAL })
export class StaffGuestsController {
  constructor(
    private readonly guests: GuestsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('guest.read')
  search(@CurrentStaff() me: AuthenticatedStaff, @Query('q') q?: string) {
    return this.guests.search(me.propertyId, q);
  }

  @Get('profile')
  @RequireStaffPermissions('guest.read')
  profile(@CurrentStaff() me: AuthenticatedStaff, @Query('phone') phone: string) {
    return this.guests.profile(me.propertyId, phone);
  }

  @Patch('flag')
  @RequireStaffPermissions('guest.update')
  async flag(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: GuestFlagDto) {
    const row = await this.guests.upsertProfile(me.propertyId, dto.phone, dto);
    await this.audit.record({
      action: 'staff.guest.flag_updated',
      entity: 'guest',
      entityId: dto.phone,
      after: { blacklisted: dto.blacklisted ?? false },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }
}
