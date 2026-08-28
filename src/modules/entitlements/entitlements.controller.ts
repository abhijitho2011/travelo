import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { EntitlementsService } from './entitlements.service';

class OverrideDto {
  @IsString() featureKey!: string;
  @IsOptional() @IsBoolean() granted?: boolean;
  @IsOptional() @IsString() reason?: string;
}

@ApiTags('Entitlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('owners/:ownerId')
export class EntitlementsController {
  constructor(private readonly svc: EntitlementsService) {}

  @Get('entitlements')
  @RequirePermissions('owner.view')
  resolve(@Param('ownerId') ownerId: string) {
    return this.svc.resolve(ownerId);
  }

  @Post('entitlements/overrides')
  @RequirePermissions('owner.edit')
  add(@Param('ownerId') ownerId: string, @Body() dto: OverrideDto) {
    return this.svc.addOverride(ownerId, dto);
  }

  @Delete('entitlements/overrides/:id')
  @RequirePermissions('owner.edit')
  remove(@Param('ownerId') ownerId: string, @Param('id') id: string) {
    return this.svc.removeOverride(ownerId, id);
  }
}
