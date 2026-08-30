import { Body, Controller, Get, HttpCode, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';
import { OwnerMfaService } from './owner-mfa.service';
import { OwnerMfaCodeDto } from './dto';

/**
 * The signed-in owner's own second factor at /api/v1/owner/profile/mfa/*.
 * Self-service and self-scoped: every route acts on `owner.id` from the bearer
 * token, so one owner can never enrol, verify or disable MFA for another.
 */
@ApiTags('Owner MFA')
@ApiBearerAuth()
@UseGuards(OwnerJwtGuard)
@Controller({ path: 'api/v1/owner/profile/mfa', version: VERSION_NEUTRAL })
export class OwnerMfaController {
  constructor(private readonly mfa: OwnerMfaService) {}

  @Get('status')
  status(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.mfa.status(owner.id);
  }

  /**
   * Returns the recovery codes exactly ONCE — they are stored only as argon2
   * hashes, so nothing can show them again. Does not enable MFA on its own.
   */
  @Post('enroll')
  @HttpCode(200)
  enroll(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.mfa.enroll(owner.id);
  }

  @Post('verify')
  @HttpCode(200)
  verify(@CurrentOwner() owner: AuthenticatedOwner, @Body() dto: OwnerMfaCodeDto) {
    return this.mfa.verifyEnrolment(owner.id, dto.code);
  }

  /** Requires a live TOTP or an unused recovery code — a session alone is not enough. */
  @Post('disable')
  @HttpCode(200)
  disable(@CurrentOwner() owner: AuthenticatedOwner, @Body() dto: OwnerMfaCodeDto) {
    return this.mfa.disable(owner.id, dto.code);
  }
}
