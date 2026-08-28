import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { AuthService } from './auth.service';
import { AdminAltAuthService } from './admin-alt-auth.service';
import { AdminOtpService } from './admin-otp.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Module({
  imports: [PassportModule, JwtModule.register({}), SharedAuthModule],
  providers: [
    AuthService,
    AdminAltAuthService,
    AdminOtpService,
    JwtStrategy,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, PermissionsGuard],
})
export class AuthModule {}
