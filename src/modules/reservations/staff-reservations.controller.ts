import {
  Optional,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { ReservationErrors } from './reservation-errors';
import { FolioService } from '../folio/folio.service';
import { CashService } from '../cash/cash.service';
import { DirectBillingService } from '../direct-billing/direct-billing.service';
import { FolioReceiptService } from '../folio/folio-receipt.service';
import { ReportsService } from './reports.service';
import {
  CustomReportDto,
  FolioTaxExemptDto,
  FolioReasonDto,
  FolioDiscountDto,
  AutoAllocateDto,
  SwapRoomsDto,
  LockRoomDto,
  AssignRoomDto,
  AvailabilityQueryDto,
  CancelReservationDto,
  CheckInDto,
  CheckOutDto,
  CollectPaymentDto,
  CreateReservationDto,
  ExtendStayDto,
  MoveRoomDto,
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
    private readonly folioService: FolioService,
    private readonly desk: DeskService,
    private readonly audit: AuditService,
    private readonly receipts: FolioReceiptService,
    // Side-ledgers. Optional so the surface spec's bare module still resolves.
    @Optional() private readonly cash?: CashService,
    @Optional() private readonly directBilling?: DirectBillingService,
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

  /**
   * Auto-allocate unassigned arrivals in a window. Declared before `:id` so
   * "auto-allocate" is never read as a reservation id.
   */
  @Post('auto-allocate')
  @RequireStaffPermissions('reservation.allocate')
  async autoAllocate(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: AutoAllocateDto) {
    const res = await this.reservations.autoAllocate(me.propertyId, dto, me.id);
    if (!dto.dryRun) {
      await this.audit.record({
        action: 'staff.reservation.auto_allocated',
        entity: 'reservation',
        entityId: me.propertyId,
        after: { from: dto.from, to: dto.to, assigned: res.assigned, unplaced: res.unplaced },
        actorId: me.id,
        actorEmail: me.email,
        actorRole: me.role,
      });
    }
    return res;
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

  /** Extend an in-house or committed stay to a later check-out. */
  @Post(':id/extend')
  @RequireStaffPermissions('reservation.update')
  async extend(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: ExtendStayDto,
  ) {
    const res = await this.reservations.extendStay(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.reservation.extended',
      entity: 'reservation',
      entityId: id,
      after: { checkOut: dto.checkOut },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  /** Move a checked-in guest to a different room, re-quoting on a type change. */
  @Post(':id/move-room')
  @RequireStaffPermissions('reservation.update')
  async moveRoom(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: MoveRoomDto,
  ) {
    const res = await this.reservations.moveRoom(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.reservation.room_moved',
      entity: 'reservation',
      entityId: id,
      after: { roomId: dto.roomId },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  /** Pin or release a booking from its room; pinned bookings never auto-move. */
  @Post(':id/lock')
  @RequireStaffPermissions('reservation.allocate')
  async lockRoom(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: LockRoomDto,
  ) {
    const res = await this.reservations.lockRoom(me.propertyId, id, dto.locked, me.id);
    await this.audit.record({
      action: dto.locked ? 'staff.reservation.room_locked' : 'staff.reservation.room_unlocked',
      entity: 'reservation',
      entityId: id,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  /** Swap rooms with another booking of the same type. Distinct from move. */
  @Post(':id/swap-room')
  @RequireStaffPermissions('reservation.allocate')
  async swapRooms(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: SwapRoomsDto,
  ) {
    const res = await this.reservations.swapRooms(me.propertyId, id, dto.otherReservationId, me.id);
    await this.audit.record({
      action: 'staff.reservation.rooms_swapped',
      entity: 'reservation',
      entityId: id,
      after: { with: dto.otherReservationId },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
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

  /** The itemised folio for a stay: room, ancillary charges, payments, balance. */
  @Get(':id/folio')
  @RequireStaffPermissions('folio.read')
  folio(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.reservations.folioFor(me.propertyId, id);
  }

  /**
   * The guest's stay receipt as a PDF, generated on demand and streamed. `@Res()`
   * takes this route out of the JSON envelope so the raw bytes reach the client.
   */
  @Get(':id/folio/receipt')
  @RequireStaffPermissions('folio.read')
  async receipt(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.receipts.pdf(me.propertyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${id}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }

  /**
   * Take a payment against a stay's folio, out of band from checkout — an
   * advance at booking, a mid-stay top-up, a partial settlement. Idempotent by
   * key so a tablet double-tap never charges twice.
   */
  /** A discount: its own negative, tax-free line with a reason — never an edit. */
  @Post(':id/folio/discount')
  @RequireStaffPermissions('folio.adjust')
  async folioDiscount(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: FolioDiscountDto,
  ) {
    await this.reservations.requireReservation(me.propertyId, id);
    const line = await this.folioService.applyDiscount({
      reservationId: id,
      propertyId: me.propertyId,
      amountPaise: dto.amountPaise,
      reason: dto.reason,
      actorStaffId: me.id,
    });
    await this.audit.record({
      action: 'staff.folio.discount_applied',
      entity: 'reservation',
      entityId: id,
      after: { lineId: line.id, amountPaise: line.amountPaise, reason: dto.reason },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return line;
  }

  /** Voids a line: kept for the record, excluded from every total. */
  @Post(':id/folio/lines/:lineId/void')
  @RequireStaffPermissions('folio.adjust')
  async folioVoid(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: FolioReasonDto,
  ) {
    await this.reservations.requireReservation(me.propertyId, id);
    const line = await this.folioService.voidLine({
      reservationId: id,
      propertyId: me.propertyId,
      lineId,
      reason: dto.reason,
      actorStaffId: me.id,
    });
    if (!line) throw ReservationErrors.folioLineNotFound();
    await this.audit.record({
      action: 'staff.folio.line_voided',
      entity: 'reservation',
      entityId: id,
      after: { lineId, reason: dto.reason },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return line;
  }

  /** Grants or withdraws a tax exemption on one line. */
  @Post(':id/folio/lines/:lineId/tax-exempt')
  @RequireStaffPermissions('folio.adjust')
  async folioTaxExempt(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: FolioTaxExemptDto,
  ) {
    await this.reservations.requireReservation(me.propertyId, id);
    const line = await this.folioService.setLineTaxExempt({
      reservationId: id,
      propertyId: me.propertyId,
      lineId,
      exempt: dto.exempt,
      reason: dto.reason,
      actorStaffId: me.id,
    });
    if (!line) throw ReservationErrors.folioLineNotFound();
    await this.audit.record({
      action: dto.exempt ? 'staff.folio.tax_exempted' : 'staff.folio.tax_exemption_removed',
      entity: 'reservation',
      entityId: id,
      after: { lineId, reason: dto.reason },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return line;
  }

  /** The folio's own log — who changed what on the bill, and when. */
  @Get(':id/folio/events')
  @RequireStaffPermissions('folio.read')
  async folioEvents(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    await this.reservations.requireReservation(me.propertyId, id);
    return this.folioService.events(id);
  }

  @Post(':id/payments')
  @RequireStaffPermissions('payment.collect')
  async collectPayment(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CollectPaymentDto,
  ) {
    const out = await this.reservations.collectPayment(
      me.propertyId,
      id,
      {
        method: dto.method,
        amountPaise: dto.amountPaise,
        direction: 'PAYMENT',
        reference: dto.reference,
        note: dto.note,
        idempotencyKey: dto.idempotencyKey,
      },
      me.id,
    );
    // Cash goes into the drawer; a corporate settlement charges the account.
    if (dto.method === 'CASH') {
      await this.cash?.record({
        propertyId: me.propertyId,
        kind: 'FOLIO_CASH',
        amountPaise: dto.amountPaise,
        reservationId: id,
        recordedBy: me.id,
      });
    } else if (dto.method === 'CORPORATE') {
      const stay = await this.reservations.requireReservation(me.propertyId, id);
      if (!stay.corporateAccountId) throw ReservationErrors.corporateAccountRequired();
      await this.directBilling?.charge({
        propertyId: me.propertyId,
        accountId: stay.corporateAccountId,
        amountPaise: dto.amountPaise,
        reservationId: id,
        reference: stay.reservationNumber,
        recordedBy: me.id,
      });
    }
    await this.audit.record({
      action: 'staff.folio.payment',
      entity: 'reservation',
      entityId: id,
      after: { method: dto.method, amountPaise: dto.amountPaise, balancePaise: out.balancePaise },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return out;
  }

  /**
   * Record a refund against a stay's folio. Deliberately a SEPARATE route
   * behind the stronger `payment.refund` — returning money is not something the
   * receptionist who can only take it should be able to do.
   */
  @Post(':id/refunds')
  @RequireStaffPermissions('payment.refund')
  async refundPayment(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CollectPaymentDto,
  ) {
    const out = await this.reservations.collectPayment(
      me.propertyId,
      id,
      {
        method: dto.method,
        amountPaise: dto.amountPaise,
        direction: 'REFUND',
        reference: dto.reference,
        note: dto.note,
        idempotencyKey: dto.idempotencyKey,
      },
      me.id,
    );
    await this.audit.record({
      action: 'staff.folio.refund',
      entity: 'reservation',
      entityId: id,
      after: { method: dto.method, amountPaise: dto.amountPaise, balancePaise: out.balancePaise },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return out;
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

/**
 * Hotel reporting — occupancy / ADR / RevPAR history and the arrivals /
 * departures manifest. `reports.read`, which management and accounts hold.
 */
@ApiTags('Staff Reports')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/reports', version: VERSION_NEUTRAL })
export class StaffReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** The custom report builder: a whitelisted entity × window × group × measures. */
  @Post('custom')
  @RequireStaffPermissions('reports.read')
  custom(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CustomReportDto) {
    return this.reports.customReport(me.propertyId, dto);
  }

  @Get('occupancy')
  @RequireStaffPermissions('reports.read')
  occupancy(@CurrentStaff() me: AuthenticatedStaff, @Query('days') days?: string) {
    return this.reports.occupancyHistory(me.propertyId, days ? Number(days) : 30);
  }

  @Get('summary')
  @RequireStaffPermissions('reports.read')
  summary(@CurrentStaff() me: AuthenticatedStaff, @Query('days') days?: string) {
    return this.reports.summary(me.propertyId, days ? Number(days) : 30);
  }

  @Get('manifest')
  @RequireStaffPermissions('reports.read')
  manifest(@CurrentStaff() me: AuthenticatedStaff, @Query('date') date?: string) {
    const d =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
    return this.reports.manifest(me.propertyId, d);
  }
}
