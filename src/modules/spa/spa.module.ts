import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import {
  StaffSpaAppointmentsController,
  StaffSpaBillsController,
  StaffSpaDashboardController,
  StaffSpaRevenueController,
  StaffSpaServicesController,
} from './staff-spa.controller';
import { SpaServicesService } from './services.service';
import { SpaAppointmentsService } from './appointments.service';
import { SpaBillsService } from './bills.service';
import { FolioModule } from '../folio/folio.module';

/**
 * Spa / Wellness — one module, one staff surface under `/api/v1/staff/spa/*`:
 * the service catalogue, the appointment calendar, and the bills. Reservations
 * are read (not written) for the ROOM_CHARGE settlement path; nothing here
 * mutates a booking.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule, FolioModule],
  controllers: [
    StaffSpaServicesController,
    StaffSpaDashboardController,
    StaffSpaAppointmentsController,
    StaffSpaBillsController,
    StaffSpaRevenueController,
  ],
  providers: [
    SpaServicesService,
    SpaAppointmentsService,
    SpaBillsService,
    StaffJwtGuard,
    StaffPermissionsGuard,
  ],
  exports: [SpaServicesService, SpaAppointmentsService, SpaBillsService],
})
export class SpaModule {}
