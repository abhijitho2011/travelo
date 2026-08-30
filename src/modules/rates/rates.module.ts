import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { RatesService } from './rates.service';
import { StaffRatesController } from './staff-rates.controller';

/** Date-ranged rate overrides (seasonal/peak pricing). */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffRatesController],
  providers: [RatesService, StaffJwtGuard, StaffPermissionsGuard],
})
export class RatesModule {}
