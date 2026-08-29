import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../notifications/notifications.module';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffAuthController } from './staff-auth.controller';
import { StaffTeamController } from './staff-team.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffOtpService } from './staff-otp.service';
import { StaffTokenService } from './staff-token.service';
import { StaffTeamService } from './staff-team.service';
import { StaffJwtGuard } from './staff-jwt.guard';
import { StaffPermissionsGuard } from './staff-permissions.guard';

/**
 * The staff mobile app's own surface at /api/v1/staff/*. It reads the SAME
 * `hotel_staff` table the admin and owner surfaces read — one source of truth,
 * three views of it.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule, NotificationsModule],
  controllers: [StaffAuthController, StaffTeamController],
  providers: [
    StaffAuthService,
    StaffOtpService,
    StaffTokenService,
    StaffTeamService,
    StaffJwtGuard,
    StaffPermissionsGuard,
  ],
})
export class StaffAuthModule {}
