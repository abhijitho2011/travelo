import { Body, Controller, Get, Param, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { KeyCardsService } from './key-cards.service';
import { DeactivateKeyCardDto, IssueKeyCardDto } from './dto';

/**
 * Key cards, per property. One permission for the whole surface —
 * `keycard.issue` — because the role that hands cards over is exactly the role
 * that takes them back; splitting read from write here would model nothing.
 *
 * The property is NEVER a parameter: every route resolves against the caller's
 * own `propertyId`, so a foreign id 404s rather than 403s.
 */
@ApiTags('Staff Key Cards')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/key-cards', version: VERSION_NEUTRAL })
export class KeyCardsController {
  constructor(
    private readonly keyCards: KeyCardsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('keycard.issue')
  list(@CurrentStaff() me: AuthenticatedStaff) {
    return this.keyCards.list(me.propertyId);
  }

  @Post()
  @RequireStaffPermissions('keycard.issue')
  async issue(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: IssueKeyCardDto) {
    const card = await this.keyCards.issue(me.propertyId, dto.reservationId, me.id);
    await this.audit.record({
      action: 'staff.keycard.issued',
      entity: 'key_card',
      entityId: card.id,
      after: { reservationId: dto.reservationId, cardNumber: card.cardNumber },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return card;
  }

  @Post(':id/deactivate')
  @RequireStaffPermissions('keycard.issue')
  async deactivate(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: DeactivateKeyCardDto,
  ) {
    const card = await this.keyCards.deactivate(me.propertyId, id, dto.lost === true);
    await this.audit.record({
      action: 'staff.keycard.deactivated',
      entity: 'key_card',
      entityId: card.id,
      after: { status: card.status, cardNumber: card.cardNumber },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return card;
  }

  /** Deactivates the old card and returns the NEW one for the same stay. */
  @Post(':id/replace')
  @RequireStaffPermissions('keycard.issue')
  async replace(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const card = await this.keyCards.replace(me.propertyId, id);
    await this.audit.record({
      action: 'staff.keycard.replaced',
      entity: 'key_card',
      entityId: card.id,
      after: {
        replacedCardId: id,
        reservationId: card.reservationId,
        cardNumber: card.cardNumber,
      },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return card;
  }
}
