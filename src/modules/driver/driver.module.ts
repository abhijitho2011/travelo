import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { TravelDeskModule } from '../travel-desk/travel-desk.module';
import { StaffDriverController } from './staff-driver.controller';

/**
 * Driver — one staff surface under `/api/v1/staff/driver/*`. It owns no tables:
 * it reuses `TransportService` from the Travel Desk module, scoped to the
 * signed-in driver's own assigned trips.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule, TravelDeskModule],
  controllers: [StaffDriverController],
  providers: [StaffJwtGuard, StaffPermissionsGuard],
})
export class DriverModule {}
