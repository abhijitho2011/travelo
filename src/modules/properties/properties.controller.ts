import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PropertiesService } from './properties.service';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePropertyDto {
  @IsUUID() ownerId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsInt() starRating?: number;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsInt() @Min(0) roomCount?: number;
}

@ApiTags('Properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('properties')
export class PropertiesController {
  constructor(private readonly svc: PropertiesService) {}

  @Get()
  @RequirePermissions('property.view')
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
    @Query('state') state?: string,
    @Query('district') district?: string,
  ) {
    return this.svc.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      q,
      status,
      ownerId,
      state,
      district,
    });
  }

  @Post()
  @RequirePermissions('property.edit')
  create(@Body() dto: CreatePropertyDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  @RequirePermissions('property.view')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get(':id/overview')
  @RequirePermissions('property.view')
  overview(@Param('id') id: string) {
    return this.svc.overview(id);
  }

  @Get(':id/integrations')
  @RequirePermissions('property.view')
  integrations(@Param('id') id: string) {
    return this.svc.listIntegrations(id);
  }
}
