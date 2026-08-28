import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationDispatcher } from './notification-dispatcher.service';

@Module({
  providers: [NotificationsService, NotificationDispatcher],
  controllers: [NotificationsController],
  exports: [NotificationsService, NotificationDispatcher],
})
export class NotificationsModule {}
