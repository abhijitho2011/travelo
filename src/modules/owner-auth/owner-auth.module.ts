import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { OwnerAuthController } from './owner-auth.controller';
import { OwnerPortalController } from './owner-portal.controller';
import { OwnerAccountController } from './owner-account.controller';
import { OwnerSubscriptionController } from './owner-subscription.controller';
import { OwnerSupportController } from './owner-support.controller';
import { AdminLocationsController } from './admin-locations.controller';
import { OwnerAuthService } from './owner-auth.service';
import { OwnerOtpService } from './owner-otp.service';
import { OwnerTokenService } from './owner-token.service';
import { OwnerPortalService } from './owner-portal.service';
import { OwnerProfileService } from './owner-profile.service';
import { OwnerSessionsService } from './owner-sessions.service';
import { OwnerSubscriptionService } from './owner-subscription.service';
import { OwnerSupportService } from './owner-support.service';
import { LocationsService } from './locations.service';
import { PropertyPhotosService } from './property-photos.service';
import { OwnerJwtGuard } from './owner-jwt.guard';

@Module({
  // EntitlementsModule supplies the shared feature resolver so the owner's
  // subscription page reports exactly what the admin console resolves.
  imports: [JwtModule.register({}), SharedAuthModule, EntitlementsModule],
  controllers: [
    OwnerAuthController,
    OwnerPortalController,
    OwnerAccountController,
    OwnerSubscriptionController,
    OwnerSupportController,
    AdminLocationsController,
  ],
  providers: [
    OwnerAuthService,
    OwnerOtpService,
    OwnerTokenService,
    OwnerPortalService,
    OwnerProfileService,
    OwnerSessionsService,
    OwnerSubscriptionService,
    OwnerSupportService,
    LocationsService,
    PropertyPhotosService,
    OwnerJwtGuard,
  ],
})
export class OwnerAuthModule {}
