import { Controller, Get, Param, Post, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from '../notifications/notifications.service';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';

/**
 * The owner's own IN_APP inbox. The delivery pipeline already writes owner
 * notifications (subscription reminders, payment receipts, support replies)
 * into `notifications.owner_id`; this is where the owner app reads them.
 * Every query is scoped to the authenticated owner id, so one owner can never
 * see another's.
 */
@ApiTags('Owner Notifications')
@ApiBearerAuth()
@UseGuards(OwnerJwtGuard)
@Controller({ path: 'api/v1/owner/notifications', version: VERSION_NEUTRAL })
export class OwnerNotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unread') unread?: string,
  ) {
    return this.svc.listForRecipient('owner', owner.id, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      unread: unread === 'true',
    });
  }

  @Post(':id/read')
  read(@CurrentOwner() owner: AuthenticatedOwner, @Param('id') id: string) {
    return this.svc.markReadForRecipient('owner', owner.id, id);
  }

  @Post('read-all')
  readAll(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.svc.markAllReadForRecipient('owner', owner.id);
  }
}
