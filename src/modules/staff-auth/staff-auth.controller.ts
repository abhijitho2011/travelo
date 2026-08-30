import { Body, Controller, Get, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { StaffAuthService } from './staff-auth.service';
import { StaffJwtGuard } from './staff-jwt.guard';
import { CurrentStaff, AuthenticatedStaff } from './current-staff.decorator';
import {
  StaffGoogleLoginDto,
  StaffMfaChallengeDto,
  StaffRefreshDto,
  StaffRequestOtpDto,
  StaffVerifyOtpDto,
} from './dto';
import { AuthThrottle } from '../../common/decorators/auth-throttle.decorator';
import { StaffMfaService } from './staff-mfa.service';

@ApiTags('Staff Auth')
@Controller({ path: 'api/v1/staff/auth', version: VERSION_NEUTRAL })
export class StaffAuthController {
  constructor(
    private readonly svc: StaffAuthService,
    private readonly mfa: StaffMfaService,
  ) {}

  @Public()
  @AuthThrottle()
  @Post('otp/request')
  requestOtp(@Body() dto: StaffRequestOtpDto) {
    return this.svc.requestOtp(dto.mobile);
  }

  @Public()
  @AuthThrottle()
  @Post('otp/verify')
  verifyOtp(@Body() dto: StaffVerifyOtpDto) {
    return this.svc.verifyOtp(dto.mobile, dto.otp);
  }

  @Public()
  @AuthThrottle()
  @Post('google')
  google(@Body() dto: StaffGoogleLoginDto) {
    return this.svc.google(dto.idToken);
  }

  /**
   * The second-factor step. Consumes the challenge token + code and, only then,
   * mints the session. No tokens are issued anywhere until this succeeds.
   */
  @Public()
  @AuthThrottle()
  @Post('mfa')
  async mfaChallenge(@Body() dto: StaffMfaChallengeDto) {
    const { staffId } = await this.mfa.consumeChallenge(dto.mfaToken, dto.code);
    return this.svc.completeLoginAfterMfa(staffId);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: StaffRefreshDto) {
    return this.svc.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(StaffJwtGuard)
  @Post('logout')
  logout(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.svc.logout(staff.sessionId);
  }

  @ApiBearerAuth()
  @UseGuards(StaffJwtGuard)
  @Get('me')
  me(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.svc.me(staff.id);
  }
}
