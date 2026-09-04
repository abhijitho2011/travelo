import { Controller, Get, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { FolioListService, type FolioListScope } from './folio-list.service';

export class FolioListQueryDto {
  /** open (default): balance due; inhouse: CHECKED_IN; all: every folio-bearing stay. */
  @IsOptional() @IsIn(['open', 'inhouse', 'all']) scope?: FolioListScope;

  /** Guest name, booking code or room number substring. */
  @IsOptional() @IsString() @Length(1, 160) q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

/**
 * The property-wide folio list — what the cashier works from.
 * Per-stay folio routes stay under /staff/reservations/:id/folio.
 */
@ApiTags('Staff Folios')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/folios', version: VERSION_NEUTRAL })
export class StaffFoliosController {
  constructor(private readonly folios: FolioListService) {}

  @Get()
  @RequireStaffPermissions('folio.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() query: FolioListQueryDto) {
    return this.folios.list(me.propertyId, query);
  }
}
