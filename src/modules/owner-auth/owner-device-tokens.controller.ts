import { Body, Controller, Delete, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DeviceTokensService } from '../notifications/device-tokens.service';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';

class RegisterDeviceTokenDto {
  @IsString() @MinLength(8) @MaxLength(4096) token!: string;
  @IsOptional() @IsIn(['android', 'ios', 'web']) platform?: 'android' | 'ios' | 'web';
}

class RevokeDeviceTokenDto {
  @IsString() @MinLength(8) @MaxLength(4096) token!: string;
}

/**
 * The owner app registers its FCM token here after sign-in (and whenever
 * Firebase rotates it), and revokes it on sign-out. The PUSH channel resolves
 * `owner:<id>` to these tokens.
 */
@ApiTags('Owner Devices')
@ApiBearerAuth()
@UseGuards(OwnerJwtGuard)
@Controller({ path: 'api/v1/owner/device-tokens', version: VERSION_NEUTRAL })
export class OwnerDeviceTokensController {
  constructor(private readonly devices: DeviceTokensService) {}

  @Post()
  register(@CurrentOwner() owner: AuthenticatedOwner, @Body() dto: RegisterDeviceTokenDto) {
    return this.devices.register(
      { audience: 'owner', id: owner.id },
      { token: dto.token, ...(dto.platform ? { platform: dto.platform } : {}) },
    );
  }

  @Delete()
  revoke(@Body() dto: RevokeDeviceTokenDto) {
    return this.devices.revoke(dto.token);
  }
}
