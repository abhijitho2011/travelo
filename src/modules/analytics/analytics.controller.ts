import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('overview')
  @RequirePermissions('analytics.view')
  overview() {
    return this.svc.overview();
  }

  @Get('revenue')
  @RequirePermissions('analytics.view')
  revenue(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.revenueSeries(from, to);
  }

  @Get('subscriptions')
  @RequirePermissions('analytics.view')
  subs() {
    return this.svc.subscriptionHealth();
  }

  @Get('owners')
  @RequirePermissions('analytics.view')
  ownerBreakdown() {
    return this.svc.ownerSummary();
  }
}

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get()
  @RequirePermissions('analytics.view')
  dashboard() {
    return this.svc.dashboard();
  }
}
