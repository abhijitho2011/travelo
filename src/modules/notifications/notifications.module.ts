import { Logger, Module } from '@nestjs/common';
import { loadEnv } from '../../config/env';
import { DRIZZLE, Database } from '../../database/database.module';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { SMS_PROVIDER, type SmsProvider } from '../shared-auth/sms/sms-provider.interface';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NOTIFICATION_CHANNELS } from './channels/channel.interface';
import { buildChannelRegistry } from './channels/channel-registry';

@Module({
  imports: [SharedAuthModule],
  providers: [
    NotificationsService,
    NotificationDispatcher,
    NotificationDeliveryService,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [DRIZZLE, SMS_PROVIDER],
      useFactory: (db: Database, sms: SmsProvider) =>
        buildChannelRegistry(loadEnv(), { db, sms }, new Logger('NotificationChannels')),
    },
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService, NotificationDispatcher, NotificationDeliveryService],
})
export class NotificationsModule {}
