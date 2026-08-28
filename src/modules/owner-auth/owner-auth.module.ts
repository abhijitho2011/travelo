import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { OwnerAuthController } from './owner-auth.controller';
import { OwnerPortalController } from './owner-portal.controller';
import { AdminLocationsController } from './admin-locations.controller';
import { OwnerAuthService } from './owner-auth.service';
import { OwnerOtpService } from './owner-otp.service';
import { OwnerTokenService } from './owner-token.service';
import { OwnerPortalService } from './owner-portal.service';
import { LocationsService } from './locations.service';
import { OwnerJwtGuard } from './owner-jwt.guard';

@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [OwnerAuthController, OwnerPortalController, AdminLocationsController],
  providers: [
    OwnerAuthService,
    OwnerOtpService,
    OwnerTokenService,
    OwnerPortalService,
    LocationsService,
    OwnerJwtGuard,
  ],
})
export class OwnerAuthModule {}
