import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { StaffHousekeepingController } from './housekeeping.controller';
import { StaffWorkOrdersController } from './work-orders.controller';
import { HousekeepingService } from './housekeeping.service';
import { WorkOrdersService } from './work-orders.service';

/**
 * Housekeeping and maintenance — the operational loop under a hotel's rooms.
 *
 *   /api/v1/staff/housekeeping/*  — the cleaning board, tasks and attendant feed
 *   /api/v1/staff/work-orders/*   — the maintenance queue and technician feed
 *
 * `HousekeepingService` is exported because the reservations check-out path
 * calls its static `createCheckoutCleanForRoom` to raise the turnover clean the
 * moment a room flips DIRTY — one definition of "a checked-out room needs a
 * clean", shared rather than forked.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffHousekeepingController, StaffWorkOrdersController],
  providers: [HousekeepingService, WorkOrdersService, StaffJwtGuard, StaffPermissionsGuard],
  exports: [HousekeepingService, WorkOrdersService],
})
export class HousekeepingModule {}
