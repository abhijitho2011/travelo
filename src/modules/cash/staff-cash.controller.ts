import { Body, Controller, Get, Post, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CashService } from './cash.service';

class ManualEntryDto {
  /** The hand-recorded kinds; folio and POS cash come from their own paths. */
  @IsIn(['CASH_IN', 'WITHDRAWAL', 'TOP_UP', 'EXPENSE']) kind!:
    'CASH_IN' | 'WITHDRAWAL' | 'TOP_UP' | 'EXPENSE';
  @IsInt() @Min(1) @Max(1_000_000_000) amountPaise!: number;
  @IsString() @Length(2, 500) note!: string;
}

class OpenShiftDto {
  @IsInt() @Min(0) @Max(1_000_000_000) openingCashPaise!: number;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

class CloseShiftDto {
  @IsInt() @Min(0) @Max(1_000_000_000) declaredCashPaise!: number;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

class EntriesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit?: number;
}

@ApiTags('Staff Cash')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/cash', version: VERSION_NEUTRAL })
export class StaffCashController {
  constructor(
    private readonly cash: CashService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('payment.read')
  entries(@CurrentStaff() me: AuthenticatedStaff, @Query() q: EntriesQueryDto) {
    return this.cash.entries(me.propertyId, q);
  }

  @Post()
  @RequireStaffPermissions('payment.collect')
  async record(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: ManualEntryDto) {
    const row = await this.cash.record({
      propertyId: me.propertyId,
      kind: dto.kind,
      amountPaise: dto.amountPaise,
      note: dto.note,
      recordedBy: me.id,
    });
    await this.audit.record({
      action: 'staff.cash.entry',
      entity: 'cash_entry',
      entityId: row.id,
      after: dto,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Get('shifts')
  @RequireStaffPermissions('payment.read')
  shifts(@CurrentStaff() me: AuthenticatedStaff) {
    return this.cash.shifts(me.propertyId);
  }

  @Get('shifts/current')
  @RequireStaffPermissions('payment.collect')
  current(@CurrentStaff() me: AuthenticatedStaff) {
    return this.cash.openShiftFor(me.propertyId, me.id);
  }

  @Post('shifts/open')
  @RequireStaffPermissions('payment.collect')
  async open(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: OpenShiftDto) {
    const row = await this.cash.openShift(me.propertyId, me.id, dto.openingCashPaise, dto.note);
    await this.audit.record({
      action: 'staff.shift.opened',
      entity: 'staff_shift',
      entityId: row.id,
      after: dto,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Post('shifts/close')
  @RequireStaffPermissions('payment.collect')
  async close(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CloseShiftDto) {
    const row = await this.cash.closeShift(me.propertyId, me.id, dto.declaredCashPaise, dto.note);
    await this.audit.record({
      action: 'staff.shift.closed',
      entity: 'staff_shift',
      entityId: row.id,
      after: {
        declared: dto.declaredCashPaise,
        expected: row.expectedCashPaise,
        difference: row.differencePaise,
      },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }
}
