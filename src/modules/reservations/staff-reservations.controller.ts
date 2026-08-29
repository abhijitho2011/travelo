import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { DeskService } from './desk.service';
import { ReservationsService } from './reservations.service';
import {
  AssignRoomDto,
  AvailabilityQueryDto,
  CancelReservationDto,
  CheckInDto,
  CheckOutDto,
  CreateReservationDto,
  NoShowDto,
  ReservationFilterDto,
  UpdateReservationDto,
} from './dto';

/**
 * Reservations, per property.
 *
 * The permission split mirrors what a front office actually delegates:
 *   reservation.read    — everyone who needs to see who is coming
 *   reservation.create  — reception and sales take bookings
 *   reservation.update  — amend a booking, including its rate
 *   reservation.cancel  — reception, GM, AGM. NOT sales or travel desk:
 *                         cancelling is the one action that destroys revenue.
 *   checkin.perform  / checkout.perform — the desk, separately from the above,
 *                         because a night auditor may check people out without
 *                         being able to rewrite the booking.
 *
 * The property is NEVER a parameter a client supplies — every route resolves
 * against the caller's own `propertyId`, so a foreign id 404s rather than 403s.
 */
@ApiTags('Staff Reservations')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/reservations', version: VERSION_NEUTRAL })
export class StaffReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly desk: DeskService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('reservation.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: ReservationFilterDto) {
    return this.reservations.list(me.propertyId, q);
  }

  /**
   * Free rooms per type for a date range. Declared BEFORE `:id` so
   * "availability" is never swallowed as a reservation id.
   */
  @Get('availability')
  @RequireStaffPermissions('reservation.read')
  availability(@CurrentStaff() me: AuthenticatedStaff, @Query() q: AvailabilityQueryDto) {
    return this.desk.availability(me.propertyId, q);
  }

  @Post()
  @RequireStaffPermissions('reservation.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateReservationDto) {
    const row = await this.reservations.create(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.reservation.created',
      entity: 'reservation',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Get(':id')
  @RequireStaffPermissions('reservation.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.reservations.get(me.propertyId, id);
  }

  @Patch(':id')
  @RequireStaffPermissions('reservation.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateReservationDto,
  ) {
    const { before, after } = await this.reservations.update(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.reservation.updated',
      entity: 'reservation',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Post(':id/confirm')
  @RequireStaffPermissions('reservation.update')
  async confirm(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.reservations.confirm(me.propertyId, id, me.id);
    await this.audit.record({
      action: 'staff.reservation.confirmed',
      entity: 'reservation',
      entityId: id,
      before: { status: res.previousStatus },
      after: { status: res.status },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  @Post(':id/assign-room')
  @RequireStaffPermissions('reservation.update')
  async assignRoom(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: AssignRoomDto,
  ) {
    const res = await this.reservations.assignRoom(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.reservation.room_assigned',
      entity: 'reservation',
      entityId: id,
      after: { roomId: res.roomId, roomNumber: res.roomNumber },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  /**
   * Check-in. `checkin.perform`, NOT `reservation.update`: a night auditor or a
   * duty receptionist admits guests without being able to rewrite a booking.
   */
  @Post(':id/check-in')
  @RequireStaffPermissions('checkin.perform')
  async checkIn(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CheckInDto,
  ) {
    const res = await this.reservations.checkIn(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.reservation.checked_in',
      entity: 'reservation',
      entityId: id,
      before: { status: res.previousStatus },
      after: { status: res.status, roomId: res.roomId, roomNumber: res.roomNumber },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  @Post(':id/check-out')
  @RequireStaffPermissions('checkout.perform')
  async checkOut(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CheckOutDto,
  ) {
    const res = await this.reservations.checkOut(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.reservation.checked_out',
      entity: 'reservation',
      entityId: id,
      before: { status: res.previousStatus },
      after: { status: res.status, balancePaise: res.balancePaise },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  @Post(':id/cancel')
  @RequireStaffPermissions('reservation.cancel')
  async cancel(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CancelReservationDto,
  ) {
    const res = await this.reservations.cancel(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.reservation.cancelled',
      entity: 'reservation',
      entityId: id,
      before: { status: res.previousStatus },
      after: { status: res.status },
      reason: dto.reason,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  /**
   * No-show. Same permission as cancel: both write off a booking's revenue,
   * and the difference between them is a judgement about the guest, not about
   * how much authority the act needs.
   */
  @Post(':id/no-show')
  @RequireStaffPermissions('reservation.cancel')
  async noShow(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: NoShowDto,
  ) {
    const res = await this.reservations.noShow(me.propertyId, id, me.id);
    await this.audit.record({
      action: 'staff.reservation.no_show',
      entity: 'reservation',
      entityId: id,
      before: { status: res.previousStatus },
      after: { status: res.status },
      reason: dto.note,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }
}

/**
 * The reception desk board. ONE call for the whole dashboard, so every figure
 * on it is from the same instant.
 */
@ApiTags('Staff Desk')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/desk', version: VERSION_NEUTRAL })
export class StaffDeskController {
  constructor(private readonly desk: DeskService) {}

  @Get('today')
  @RequireStaffPermissions('reservation.read')
  today(@CurrentStaff() me: AuthenticatedStaff) {
    return this.desk.today(me.propertyId);
  }
}

/**
 * The GM/AGM dashboard. `dashboard.read`, which only management, accounts and
 * sales carry — occupancy and month revenue are not floor-staff numbers.
 */
@ApiTags('Staff Dashboard')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/dashboard', version: VERSION_NEUTRAL })
export class StaffDashboardController {
  constructor(private readonly desk: DeskService) {}

  @Get()
  @RequireStaffPermissions('dashboard.read')
  dashboard(@CurrentStaff() me: AuthenticatedStaff) {
    return this.desk.dashboard(me.propertyId);
  }
}
