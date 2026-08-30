import { Body, Controller, Get, Param, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { ApprovalsService } from './approvals.service';
import { AlertsService } from './alerts.service';

class RejectDto {
  @IsOptional() @IsString() @Length(0, 500) reason?: string;
}

/**
 * The GM/AGM management surface the app expected. Two route groups the app was
 * calling into 404s:
 *   GET  /approvals              — the unified approval queue
 *   POST /approvals/:id/approve  — sign off an expense or a purchase order
 *   POST /approvals/:id/reject
 *   GET  /dashboard/alerts       — the operational alert strip
 */
@ApiTags('Staff Management')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/approvals', version: VERSION_NEUTRAL })
export class StaffApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @RequireStaffPermissions('approval.read')
  list(@CurrentStaff() me: AuthenticatedStaff) {
    return this.approvals.list(me.propertyId);
  }

  @Post(':id/approve')
  @RequireStaffPermissions('approval.act')
  approve(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.approvals.decide(me.propertyId, id, true, null, me);
  }

  @Post(':id/reject')
  @RequireStaffPermissions('approval.act')
  reject(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: RejectDto,
  ) {
    return this.approvals.decide(me.propertyId, id, false, dto.reason ?? null, me);
  }
}

@ApiTags('Staff Management')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/dashboard', version: VERSION_NEUTRAL })
export class StaffAlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('alerts')
  @RequireStaffPermissions('dashboard.read')
  list(@CurrentStaff() me: AuthenticatedStaff) {
    return this.alerts.list(me.propertyId);
  }
}
