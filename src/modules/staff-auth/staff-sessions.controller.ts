import { Controller, Delete, Get, Param, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffJwtGuard } from './staff-jwt.guard';
import { CurrentStaff, AuthenticatedStaff } from './current-staff.decorator';
import { StaffSessionsService } from './staff-sessions.service';

/**
 * The staff member's own signed-in device list at /api/v1/staff/sessions.
 * Everything here is scoped to the token holder — there is no way to point at
 * another staff member. A deliberate mirror of the owner sessions surface.
 */
@ApiTags('Staff Sessions')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard)
@Controller({ path: 'api/v1/staff/sessions', version: VERSION_NEUTRAL })
export class StaffSessionsController {
  constructor(private readonly sessions: StaffSessionsService) {}

  @Get()
  list(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.sessions.list(staff.id, staff.sessionId);
  }

  /**
   * Declared before `:id` so the literal path wins the match — keeping the
   * order explicit stops a future verb change from routing "revoke-all" into
   * the by-id handler.
   */
  @Post('revoke-all')
  revokeAll(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.sessions.revokeAll(staff.id, staff.sessionId);
  }

  @Delete(':id')
  revoke(@CurrentStaff() staff: AuthenticatedStaff, @Param('id') id: string) {
    return this.sessions.revoke(staff.id, id, staff.sessionId);
  }
}
