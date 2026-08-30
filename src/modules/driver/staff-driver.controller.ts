import { Body, Controller, Get, Param, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { TransportService } from '../travel-desk/transport.service';
import { DriverStepDto } from '../travel-desk/dto';

/**
 * Driver, per property. Reuses the transport_requests core: a driver sees ONLY
 * the trips assigned to them (a trip that is not theirs 404s), and drives each
 * one through accept → on-the-way → arrived → picked-up → completed.
 */
@ApiTags('Staff Driver')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/driver', version: VERSION_NEUTRAL })
export class StaffDriverController {
  constructor(
    private readonly transport: TransportService,
    private readonly audit: AuditService,
  ) {}

  @Get('trips')
  @RequireStaffPermissions('transport.read')
  myTrips(@CurrentStaff() me: AuthenticatedStaff) {
    return this.transport.myTrips(me.propertyId, me.id);
  }

  @Get('trips/:id')
  @RequireStaffPermissions('transport.read')
  getTrip(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.transport.getMyTrip(me.propertyId, me.id, id);
  }

  @Post('trips/:id/step')
  @RequireStaffPermissions('transport.drive')
  async step(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: DriverStepDto,
  ) {
    const { before, after } = await this.transport.step(me.propertyId, me.id, id, dto.step);
    await this.audit.record({
      action: 'staff.driver.trip.stepped',
      entity: 'transport_request',
      entityId: id,
      before,
      after,
      reason: `${dto.step}: ${before.status}/${before.driverStage ?? '-'} → ${after.status}/${after.driverStage ?? '-'}`,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }
}
