import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import {
  StaffDashboardController,
  StaffDeskController,
  StaffReservationsController,
} from './staff-reservations.controller';
import { DeskService } from './desk.service';
import { ReservationsService } from './reservations.service';
import { FolioModule } from '../folio/folio.module';

/**
 * The booking engine. One module, one staff surface:
 *
 *   /api/v1/staff/reservations  — the bookings themselves
 *   /api/v1/staff/desk/today    — the reception board, one call
 *   /api/v1/staff/dashboard     — the GM's numbers, one call
 *
 * `DeskService` is exported because occupancy and month revenue are the same
 * two figures the owner portal reports across a portfolio, and there must be
 * exactly one definition of each.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule, FolioModule],
  controllers: [StaffReservationsController, StaffDeskController, StaffDashboardController],
  providers: [ReservationsService, DeskService, StaffJwtGuard, StaffPermissionsGuard],
  exports: [ReservationsService, DeskService],
})
export class ReservationsModule {}
