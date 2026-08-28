import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController, DashboardController } from './analytics.controller';

@Module({
  providers: [AnalyticsService],
  controllers: [AnalyticsController, DashboardController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
