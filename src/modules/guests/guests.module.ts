import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { GuestsService } from './guests.service';
import { StaffGuestsController } from './staff-guests.controller';

/** Guest CRM: repeat-guest lookup, stay history and the blacklist. */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffGuestsController],
  providers: [GuestsService, StaffJwtGuard, StaffPermissionsGuard],
  exports: [GuestsService],
})
export class GuestsModule {}
