import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentAdmin, AuthenticatedAdmin } from '../../common/decorators/current-admin.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminMfaService } from './admin-mfa.service';
import { AdminMfaCodeDto } from './dto/auth.dto';

/**
 * The signed-in admin's own second factor. Deliberately self-service and
 * self-scoped: every route acts on `admin.id` from the bearer token, so one
 * admin can never enrol, verify or disable MFA for another.
 *
 * Mounted under the global /api/v1/admin prefix → /api/v1/admin/profile/mfa/*.
 */
@ApiTags('Admin MFA')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile/mfa')
export class AdminMfaController {
  constructor(private readonly mfa: AdminMfaService) {}

  @Get()
  status(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.mfa.status(admin.id);
  }

  /**
   * Returns the recovery codes exactly ONCE — they are stored only as argon2
   * hashes, so nothing can show them again. Does not enable MFA on its own.
   */
  @Post('enroll')
  @HttpCode(200)
  enroll(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.mfa.enroll(admin.id);
  }

  @Post('verify')
  @HttpCode(200)
  verify(@CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: AdminMfaCodeDto) {
    return this.mfa.verifyEnrolment(admin.id, dto.code);
  }

  /** Requires a live TOTP or an unused recovery code — a session alone is not enough. */
  @Post('disable')
  @HttpCode(200)
  disable(@CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: AdminMfaCodeDto) {
    return this.mfa.disable(admin.id, dto.code);
  }
}
