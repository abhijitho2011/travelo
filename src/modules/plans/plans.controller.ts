import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PlansService } from './plans.service';

class CreatePlanDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(0) monthlyPrice!: number;
  @IsInt() @Min(0) annualPrice!: number;
  @IsInt() @Min(1) propertyLimit!: number;
  @IsOptional() @IsInt() @Min(1) @Max(120) durationMonths?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() features?: string[];
}

class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() monthlyPrice?: number;
  @IsOptional() @IsInt() annualPrice?: number;
  @IsOptional() @IsInt() propertyLimit?: number;
  @IsOptional() @IsInt() @Min(1) @Max(120) durationMonths?: number;
  @IsOptional() @IsString() status?: 'ACTIVE' | 'ARCHIVED';
}

class SetFeaturesDto {
  @IsArray() @ArrayNotEmpty() features!: string[];
}

@ApiTags('Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('plans')
export class PlansController {
  constructor(private readonly svc: PlansService) {}

  @Get()
  @RequirePermissions('plan.view')
  list() {
    return this.svc.list();
  }

  @Get('features')
  @RequirePermissions('plan.view')
  featureCatalog() {
    return this.svc.featureCatalog();
  }

  @Get(':id')
  @RequirePermissions('plan.view')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  @RequirePermissions('plan.edit')
  create(@Body() dto: CreatePlanDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('plan.edit')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.svc.update(id, dto);
  }

  @Put(':id/features')
  @RequirePermissions('plan.edit')
  setFeatures(@Param('id') id: string, @Body() dto: SetFeaturesDto) {
    return this.svc.setFeatures(id, dto.features);
  }

  @Delete(':id')
  @RequirePermissions('plan.edit')
  archive(@Param('id') id: string) {
    return this.svc.archive(id);
  }
}
