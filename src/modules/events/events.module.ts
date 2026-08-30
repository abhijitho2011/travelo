import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { StaffEventsController } from './staff-events.controller';
import { EventsService } from './events.service';

/**
 * Events / Banquets — one module, one staff surface under `/api/v1/staff/events/*`
 * for the EVENT_MANAGER: events with a status machine, their task checklist, and
 * the dashboard. Money is paise.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffEventsController],
  providers: [EventsService, StaffJwtGuard, StaffPermissionsGuard],
  exports: [EventsService],
})
export class EventsModule {}
