import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SubscriptionsService } from './subscriptions.service';

class CreateSubDto {
  @IsUUID() ownerId!: string;
  @IsUUID() planId!: string;
  @IsOptional() @IsIn(['MONTHLY', 'ANNUAL']) billingCycle?: 'MONTHLY' | 'ANNUAL';
  @IsOptional() @IsInt() propertyLimitOverride?: number;
  @IsOptional() @IsInt() priceOverride?: number;
}

class ExtendDto {
  @IsInt() @Min(1) @Max(3650) days!: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsIn(['expiry', 'now']) extendFrom?: 'expiry' | 'now';
}

class UpdateSubDto {
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsIn(['MONTHLY', 'ANNUAL']) billingCycle?: 'MONTHLY' | 'ANNUAL';
  @IsOptional() autoRenew?: boolean;
  @IsOptional() @IsInt() propertyLimitOverride?: number;
  @IsOptional() @IsInt() priceOverride?: number;
}

class StatusReasonDto {
  @IsOptional() @IsString() reason?: string;
}

@ApiTags('Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly svc: SubscriptionsService) {}

  @Get()
  @RequirePermissions('subscription.view')
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('ownerId') ownerId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      ownerId,
      status,
    });
  }

  @Post()
  @RequirePermissions('subscription.edit')
  create(@Body() dto: CreateSubDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  @RequirePermissions('subscription.view')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  @RequirePermissions('subscription.edit')
  update(@Param('id') id: string, @Body() dto: UpdateSubDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/extend')
  @RequirePermissions('subscription.edit')
  extend(
    @Param('id') id: string,
    @Body() dto: ExtendDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.svc.extend(id, { ...dto, idempotencyKey });
  }

  @Post(':id/suspend')
  @RequirePermissions('subscription.edit')
  suspend(@Param('id') id: string, @Body() dto: StatusReasonDto) {
    return this.svc.setStatus(id, 'SUSPENDED', dto.reason);
  }

  @Post(':id/reactivate')
  @RequirePermissions('subscription.edit')
  reactivate(@Param('id') id: string, @Body() dto: StatusReasonDto) {
    return this.svc.setStatus(id, 'ACTIVE', dto.reason);
  }

  @Post(':id/cancel')
  @RequirePermissions('subscription.cancel')
  cancel(@Param('id') id: string, @Body() dto: StatusReasonDto) {
    return this.svc.setStatus(id, 'CANCELLED', dto.reason);
  }

  @Get(':id/events')
  @RequirePermissions('subscription.view')
  events(@Param('id') id: string) {
    return this.svc.listEvents(id);
  }
}
