import { Body, Controller, Delete, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DeviceTokensService } from '../notifications/device-tokens.service';
import { StaffJwtGuard } from './staff-jwt.guard';
import { CurrentStaff, AuthenticatedStaff } from './current-staff.decorator';

class RegisterDeviceTokenDto {
  @IsString() @MinLength(8) @MaxLength(4096) token!: string;
  @IsOptional() @IsIn(['android', 'ios', 'web']) platform?: 'android' | 'ios' | 'web';
}

class RevokeDeviceTokenDto {
  @IsString() @MinLength(8) @MaxLength(4096) token!: string;
}

/**
 * The staff app registers its FCM token here after sign-in (and on rotation),
 * and revokes it on sign-out. The PUSH channel resolves `staff:<id>` to these.
 */
@ApiTags('Staff Devices')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard)
@Controller({ path: 'api/v1/staff/device-tokens', version: VERSION_NEUTRAL })
export class StaffDeviceTokensController {
  constructor(private readonly devices: DeviceTokensService) {}

  @Post()
  register(@CurrentStaff() staff: AuthenticatedStaff, @Body() dto: RegisterDeviceTokenDto) {
    return this.devices.register(
      { audience: 'staff', id: staff.id },
      { token: dto.token, ...(dto.platform ? { platform: dto.platform } : {}) },
    );
  }

  @Delete()
  revoke(@Body() dto: RevokeDeviceTokenDto) {
    return this.devices.revoke(dto.token);
  }
}
