import { Body, Controller, Get, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { OwnerAuthService } from './owner-auth.service';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';
import { GoogleLoginDto, RefreshDto, RequestOtpDto, VerifyOtpDto } from './dto';

@ApiTags('Owner Auth')
@Controller({ path: 'api/v1/owner/auth', version: VERSION_NEUTRAL })
export class OwnerAuthController {
  constructor(private readonly svc: OwnerAuthService) {}

  @Public()
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.svc.requestOtp(dto.mobile);
  }

  @Public()
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.svc.verifyOtp(dto.mobile, dto.otp);
  }

  @Public()
  @Post('google')
  google(@Body() dto: GoogleLoginDto) {
    return this.svc.google(dto.idToken);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.svc.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Post('logout')
  logout(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.svc.logout(owner.sessionId);
  }

  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  /**
   * Also the client's only signal that it is inside a Tavelo support session:
   * when `impersonation.active` is present the app must show its banner and
   * disable every write control (the API refuses those writes regardless).
   */
  @Get('me')
  me(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.svc.me(owner.id, owner.impersonation);
  }
}
