import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { KeyCardsController } from './key-cards.controller';
import { KeyCardsService } from './key-cards.service';

/**
 * Key cards: /api/v1/staff/key-cards — issue, deactivate and replace the
 * physical keys reception hands over, tied to a reservation's lifetime.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [KeyCardsController],
  providers: [KeyCardsService, StaffJwtGuard, StaffPermissionsGuard],
  exports: [KeyCardsService],
})
export class KeyCardsModule {}
