import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { DirectBillingService } from './direct-billing.service';

class AccountDto {
  @IsString() @Length(2, 160) name!: string;
  @IsOptional() @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/) gstin?: string;
  @IsOptional() @IsString() @Length(0, 120) contactName?: string;
  @IsOptional() @IsString() @Length(0, 32) contactPhone?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @Length(0, 1000) address?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) creditLimitPaise?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateAccountDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/) gstin?: string;
  @IsOptional() @IsString() @Length(0, 120) contactName?: string;
  @IsOptional() @IsString() @Length(0, 32) contactPhone?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @Length(0, 1000) address?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) creditLimitPaise?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class LedgerPaymentDto {
  @IsInt() @Min(1) @Max(1_000_000_000) amountPaise!: number;
  @IsOptional() @IsString() @Length(0, 120) reference?: string;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

/** Corporate accounts: who may be billed later, what they owe, and the statement. */
@ApiTags('Staff Direct Billing')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/corporate-accounts', version: VERSION_NEUTRAL })
export class StaffDirectBillingController {
  constructor(
    private readonly billing: DirectBillingService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('folio.read')
  list(@CurrentStaff() me: AuthenticatedStaff) {
    return this.billing.listWithBalances(me.propertyId);
  }

  @Post()
  @RequireStaffPermissions('folio.adjust')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: AccountDto) {
    const row = await this.billing.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.corporate_account.created',
      entity: 'corporate_account',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch(':id')
  @RequireStaffPermissions('folio.adjust')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    const row = await this.billing.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.corporate_account.updated',
      entity: 'corporate_account',
      entityId: id,
      after: dto,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Get(':id/statement')
  @RequireStaffPermissions('folio.read')
  statement(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.billing.statement(me.propertyId, id);
  }

  /** Money received against the account. */
  @Post(':id/payments')
  @RequireStaffPermissions('payment.collect')
  async payment(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: LedgerPaymentDto,
  ) {
    const row = await this.billing.payment(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.corporate_account.payment',
      entity: 'corporate_account',
      entityId: id,
      after: { amountPaise: dto.amountPaise, reference: dto.reference },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }
}
