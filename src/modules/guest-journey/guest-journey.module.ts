import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { FolioModule } from '../folio/folio.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PropertyConfigModule } from '../property-config/property-config.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StorageModule } from '../storage/storage.module';
import {
  PublicGuestController,
  StaffGuestLinkController,
  StaffGuestLinksController,
} from './guest-journey.controllers';
import { GuestJourneyService } from './guest-journey.service';

@Module({
  imports: [
    JwtModule.register({}),
    SharedAuthModule,
    AuditModule,
    ReservationsModule,
    FolioModule,
    PropertyConfigModule,
    StorageModule,
    NotificationsModule,
  ],
  controllers: [PublicGuestController, StaffGuestLinkController, StaffGuestLinksController],
  providers: [GuestJourneyService],
  exports: [GuestJourneyService],
})
export class GuestJourneyModule {}
