import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { PublicInboundController, StaffConversationsController } from './conversations.controllers';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [JwtModule.register({}), SharedAuthModule, AuditModule, NotificationsModule],
  controllers: [StaffConversationsController, PublicInboundController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
