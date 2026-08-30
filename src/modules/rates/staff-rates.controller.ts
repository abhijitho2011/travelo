import {
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
  constructor(private readonly rates: RatesService) {}

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
