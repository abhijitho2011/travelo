import { Body, Controller, HttpCode, Post, UseGuards, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  AdminGoogleLoginDto,
  AdminRequestOtpDto,
  AdminVerifyOtpDto,
  RefreshDto,
} from './dto/auth.dto';
import { AdminAltAuthService } from './admin-alt-auth.service';
import { AdminSignInResult, isMfaChallenge } from './auth.service';
import { AdminMfaService } from './admin-mfa.service';
import { AdminMfaChallengeDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentAdmin, AuthenticatedAdmin } from '../../common/decorators/current-admin.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PermissionsService } from '../permissions/permissions.service';
import { AuthThrottle } from '../../common/decorators/auth-throttle.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly alt: AdminAltAuthService,
    private readonly perms: PermissionsService,
    private readonly mfa: AdminMfaService,
  ) {}

  /**
   * Single place that shapes a sign-in outcome, whatever the method.
   *
   * For an MFA-enrolled admin that outcome is a CHALLENGE, not a session: no
   * accessToken, no refreshToken, nothing the client can use against the API.
   * The only way past it is POST /auth/mfa.
   */
  private static tokenResponse(result: AdminSignInResult) {
    if (isMfaChallenge(result)) {
      return {
        mfaRequired: true as const,
        mfaToken: result.mfaToken,
        expiresIn: result.expiresInSeconds,
      };
    }
    const { admin, tokens } = result;
    return {
      admin,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.accessExpiresIn,
      refreshExpiresIn: tokens.refreshExpiresIn,
    };
  }

  // NOTE: there is deliberately no password login route. The super-admin
  // portal authenticates ONLY through mobile OTP and Google, both gated by the
  // SUPER_ADMIN_MOBILE / SUPER_ADMIN_EMAIL allowlist. Password hashes remain in
  // the database but can no longer authenticate anyone.

  /**
   * Always returns a generic success envelope — never discloses whether the
   * number is the allowlisted super-admin mobile.
   */
  @Public()
  @AuthThrottle()
  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@Body() dto: AdminRequestOtpDto) {
    return this.alt.requestOtp(dto.mobile);
  }

  @Public()
  @AuthThrottle()
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body() dto: AdminVerifyOtpDto) {
    return AuthController.tokenResponse(await this.alt.verifyOtp(dto.mobile, dto.otp));
  }

  @Public()
  @AuthThrottle()
  @Post('google')
  @HttpCode(200)
  async google(@Body() dto: AdminGoogleLoginDto) {
    return AuthController.tokenResponse(await this.alt.google(dto.idToken));
  }

  /**
   * Second factor. Exchanges the short-lived challenge token for a real
   * session. Accepts a TOTP or an unused recovery code (which is burned).
   */
  @Public()
  @AuthThrottle()
  @Post('mfa')
  @HttpCode(200)
  async mfaChallenge(@Body() dto: AdminMfaChallengeDto) {
    const { adminId, method } = await this.mfa.consumeChallenge(dto.mfaToken, dto.code);
    return AuthController.tokenResponse(await this.auth.completeLoginAfterMfa(adminId, method));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto) {
    const tokens = await this.auth.refresh(dto.refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.accessExpiresIn,
      refreshExpiresIn: tokens.refreshExpiresIn,
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentAdmin() admin: AuthenticatedAdmin) {
    await this.auth.logout(admin.sessionId, admin.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    const eff = await this.perms.getEffectivePermissions(admin.id);
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      status: admin.status,
      roles: eff.roles,
      permissions: eff.permissions,
    };
  }
}
