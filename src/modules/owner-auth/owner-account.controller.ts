import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { SubscriptionStatusGuard } from '../../common/guards/subscription-status.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';
import { OwnerProfileService } from './owner-profile.service';
import { OwnerSessionsService } from './owner-sessions.service';
import { UpdateOwnerProfileDto } from './dto';

/**
 * The owner's own account: profile details and the signed-in device list.
 * Everything here is scoped to the token holder — there is no id parameter to
 * point at somebody else.
 */
@ApiTags('Owner Account')
@ApiBearerAuth()
@UseGuards(OwnerJwtGuard, SubscriptionStatusGuard)
@Controller({ path: 'api/v1/owner', version: VERSION_NEUTRAL })
export class OwnerAccountController {
  constructor(
    private readonly profile: OwnerProfileService,
    private readonly sessions: OwnerSessionsService,
  ) {}

  @Get('profile')
  getProfile(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.profile.get(owner.id);
  }

  @Patch('profile')
  updateProfile(@CurrentOwner() owner: AuthenticatedOwner, @Body() dto: UpdateOwnerProfileDto) {
    return this.profile.update(owner.id, dto);
  }

  // ---------- Security / sessions ----------

  @Get('sessions')
  listSessions(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.sessions.list(owner.id, owner.sessionId);
  }

  /**
   * Declared before `sessions/:id` so the literal path wins the match — a DELETE
   * and a POST would not collide, but keeping the order explicit stops a future
   * verb change from silently routing "revoke-all" into the by-id handler.
   */
  @Post('sessions/revoke-all')
  revokeAllSessions(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.sessions.revokeAll(owner.id, owner.sessionId);
  }

  @Delete('sessions/:id')
  revokeSession(@CurrentOwner() owner: AuthenticatedOwner, @Param('id') id: string) {
    return this.sessions.revoke(owner.id, id, owner.sessionId);
  }
}
