import { Controller, Get, Param, Post, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from '../notifications/notifications.service';
import { StaffJwtGuard } from './staff-jwt.guard';
import { CurrentStaff, AuthenticatedStaff } from './current-staff.decorator';

/**
 * The staff member's own IN_APP inbox. The delivery pipeline writes staff
 * notifications (account approved, task assigned) into `notifications.staff_id`;
 * this is where the staff app reads them. Scoped to the authenticated staff id.
 */
@ApiTags('Staff Notifications')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard)
@Controller({ path: 'api/v1/staff/notifications', version: VERSION_NEUTRAL })
export class StaffNotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unread') unread?: string,
  ) {
    return this.svc.listForRecipient('staff', staff.id, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      unread: unread === 'true',
    });
  }

  @Post(':id/read')
  read(@CurrentStaff() staff: AuthenticatedStaff, @Param('id') id: string) {
    return this.svc.markReadForRecipient('staff', staff.id, id);
  }

  @Post('read-all')
  readAll(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.svc.markAllReadForRecipient('staff', staff.id);
  }
}
