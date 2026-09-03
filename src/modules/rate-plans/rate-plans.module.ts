import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { RatePlansService } from './rate-plans.service';
import { RevenueEngineService } from './revenue-engine.service';
import { RatesModule } from '../rates/rates.module';
import { StaffRatePlansController } from './staff-rate-plans.controller';
import { StaffRoomTypePricingController } from './staff-room-type-pricing.controller';

/**
 * The commercial layer on top of a room type: rate plans
 * (/api/v1/staff/rate-plans) plus its taxes/fees and dynamic pricing rules
 * (/api/v1/staff/room-types/:roomTypeId/fees | /pricing-rules).
 *
 * Separate from RoomsModule on purpose — a room type is a physical fact, a
 * rate plan is a commercial decision, and they change for different reasons.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule, RatesModule],
  controllers: [StaffRatePlansController, StaffRoomTypePricingController],
  providers: [RatePlansService, RevenueEngineService, StaffJwtGuard, StaffPermissionsGuard],
  exports: [RatePlansService, RevenueEngineService],
})
export class RatePlansModule {}
