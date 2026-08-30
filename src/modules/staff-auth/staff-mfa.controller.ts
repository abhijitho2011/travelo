import { Body, Controller, Get, HttpCode, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffJwtGuard } from './staff-jwt.guard';
import { CurrentStaff, AuthenticatedStaff } from './current-staff.decorator';
import { StaffMfaService } from './staff-mfa.service';
import { StaffMfaCodeDto } from './dto';

/**
 * The signed-in staff member's own second factor at
 * /api/v1/staff/profile/mfa/*. Self-service and self-scoped: every route acts
 * on `staff.id` from the bearer token.
 */
@ApiTags('Staff MFA')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard)
@Controller({ path: 'api/v1/staff/profile/mfa', version: VERSION_NEUTRAL })
export class StaffMfaController {
  constructor(private readonly mfa: StaffMfaService) {}

  @Get('status')
  status(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.mfa.status(staff.id);
  }

  /**
   * Returns the recovery codes exactly ONCE — they are stored only as argon2
   * hashes, so nothing can show them again. Does not enable MFA on its own.
   */
  @Post('enroll')
  @HttpCode(200)
  enroll(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.mfa.enroll(staff.id);
  }

  @Post('verify')
  @HttpCode(200)
  verify(@CurrentStaff() staff: AuthenticatedStaff, @Body() dto: StaffMfaCodeDto) {
    return this.mfa.verifyEnrolment(staff.id, dto.code);
  }

  /** Requires a live TOTP or an unused recovery code — a session alone is not enough. */
  @Post('disable')
  @HttpCode(200)
  disable(@CurrentStaff() staff: AuthenticatedStaff, @Body() dto: StaffMfaCodeDto) {
    return this.mfa.disable(staff.id, dto.code);
  }
}
