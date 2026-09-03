import {
  Query,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { RatesService } from './rates.service';
import { AuditService } from '../audit/audit.service';
import { BulkUpdateDto, ChangesQueryDto, GridQueryDto } from './dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class CreateRateOverrideDto {
  @IsUUID() roomTypeId!: string;
  @Matches(ISO_DATE) startDate!: string;
  @Matches(ISO_DATE) endDate!: string;
  @IsInt() @Min(0) ratePaise!: number;
  @IsOptional() @IsString() @Length(1, 120) label?: string;
}

@ApiTags('Staff Rates')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/rates', version: VERSION_NEUTRAL })
export class StaffRatesController {
  constructor(
    private readonly rates: RatesService,
    private readonly audit: AuditService,
  ) {}

  /** The rates & inventory grid: every active type × every night, resolved. */
  @Get('grid')
  @RequireStaffPermissions('rates.read')
  grid(@CurrentStaff() me: AuthenticatedStaff, @Query() q: GridQueryDto) {
    return this.rates.grid(me.propertyId, q.from, q.to, q.ratePlanId);
  }

  /**
   * Bulk update across room types and date ranges — price, availability,
   * restrictions or a per-channel delta — logged under one batch id. Every
   * cell edit in the UI is a one-cell bulk update, so this is the only write.
   */
  @Post('bulk')
  @RequireStaffPermissions('rates.update')
  async bulk(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: BulkUpdateDto) {
    const channel = dto.set.channel
      ? {
          connectionId: dto.set.channel.connectionId,
          override: dto.set.channel.clear
            ? null
            : { priceDeltaBp: dto.set.channel.priceDeltaBp, available: dto.set.channel.available },
        }
      : undefined;
    const res = await this.rates.bulkUpdate(me.propertyId, {
      roomTypeIds: dto.roomTypeIds,
      ranges: dto.ranges,
      daysOfWeek: dto.daysOfWeek,
      ratePlanId: dto.ratePlanId ?? null,
      set: { ...dto.set, channel },
      actorStaffId: me.id,
      actorKind: 'STAFF',
    });
    if (res.changed > 0) {
      await this.audit.record({
        action: 'staff.rates.bulk_updated',
        entity: 'rate_inventory',
        entityId: res.batchId ?? me.propertyId,
        after: {
          roomTypeIds: dto.roomTypeIds,
          ranges: dto.ranges,
          set: dto.set,
          changed: res.changed,
        },
        actorId: me.id,
        actorEmail: me.email,
        actorRole: me.role,
      });
    }
    return res;
  }

  /** The change history — who changed which price/availability/restriction, when. */
  @Get('changes')
  @RequireStaffPermissions('rates.read')
  changes(@CurrentStaff() me: AuthenticatedStaff, @Query() q: ChangesQueryDto) {
    return this.rates.changes(me.propertyId, q);
  }

  @Get()
  @RequireStaffPermissions('rate.read')
  list(@CurrentStaff() me: AuthenticatedStaff) {
    return this.rates.list(me.propertyId);
  }

  @Post()
  @RequireStaffPermissions('rate.update')
  create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateRateOverrideDto) {
    return this.rates.create(me.propertyId, dto);
  }

  @Delete(':id')
  @RequireStaffPermissions('rate.update')
  remove(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.rates.remove(me.propertyId, id);
  }
}
