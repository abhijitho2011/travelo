import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { StaffTravelDeskController } from './staff-travel-desk.controller';
import { TransportService } from './transport.service';
import { VehiclesService } from './vehicles.service';

/**
 * Travel Desk — one staff surface under `/api/v1/staff/travel-desk/*`: transport
 * requests and the vehicle fleet. `TransportService` is exported so the Driver
 * module reuses the exact same transport_requests core.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffTravelDeskController],
  providers: [TransportService, VehiclesService, StaffJwtGuard, StaffPermissionsGuard],
  exports: [TransportService, VehiclesService],
})
export class TravelDeskModule {}
