import { Logger, Module } from '@nestjs/common';
import { loadEnv } from '../../config/env';
import { DRIZZLE, Database } from '../../database/database.module';
import { FirebaseService } from '../shared-auth/firebase.service';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { SMS_PROVIDER, type SmsProvider } from '../shared-auth/sms/sms-provider.interface';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { DeviceTokensService } from './device-tokens.service';
import { NOTIFICATION_CHANNELS } from './channels/channel.interface';
import { buildChannelRegistry } from './channels/channel-registry';

@Module({
  imports: [SharedAuthModule],
  providers: [
    NotificationsService,
    NotificationDispatcher,
    NotificationDeliveryService,
    DeviceTokensService,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [DRIZZLE, SMS_PROVIDER, DeviceTokensService, FirebaseService],
      useFactory: (
        db: Database,
        sms: SmsProvider,
        deviceTokens: DeviceTokensService,
        firebase: FirebaseService,
      ) =>
        buildChannelRegistry(
          loadEnv(),
          { db, sms, deviceTokens, firebase },
          new Logger('NotificationChannels'),
        ),
    },
  ],
  controllers: [NotificationsController],
  exports: [
    NotificationsService,
    NotificationDispatcher,
    NotificationDeliveryService,
    DeviceTokensService,
  ],
})
export class NotificationsModule {}
