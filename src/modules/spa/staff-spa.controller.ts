import {
  Body,
  Controller,
  Delete,
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
import { SpaServicesService } from './services.service';
import { SpaAppointmentsService } from './appointments.service';
import { SpaBillsService } from './bills.service';
import {
  AppointmentFilterDto,
  AppointmentNotesDto,
  AppointmentStatusDto,
  AssignTherapistDto,
  CreateAppointmentDto,
  CreateServiceDto,
  RefundBillDto,
  ServiceQueryDto,
  SettleBillDto,
  UpdateAppointmentDto,
  UpdateServiceDto,
} from './dto';

/** Boundaries of "today" in the server's clock — the dashboards' day window. */
function todayBounds(now: Date = new Date()): { since: Date; until: Date } {
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  const until = new Date(since.getTime() + 24 * 60 * 60 * 1000);
  return { since, until };
}

// ---------- Services (manager) ----------

@ApiTags('Staff Spa Services')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/spa/services', version: VERSION_NEUTRAL })
export class StaffSpaServicesController {
  constructor(
    private readonly services: SpaServicesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('spa.service.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: ServiceQueryDto) {
    return this.services.list(me.propertyId, q);
  }

  @Post()
  @RequireStaffPermissions('spa.service.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateServiceDto) {
    const row = await this.services.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.spa.service.created',
      entity: 'spa_service',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch(':id')
  @RequireStaffPermissions('spa.service.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const { before, after } = await this.services.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.spa.service.updated',
      entity: 'spa_service',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Delete(':id')
  @RequireStaffPermissions('spa.service.delete')
  async remove(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.services.remove(me.propertyId, id);
    await this.audit.record({
      action: 'staff.spa.service.deleted',
      entity: 'spa_service',
      entityId: id,
      before: res.before,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return { id: res.id, deleted: res.deleted };
  }
}

// ---------- Dashboard (manager) ----------

@ApiTags('Staff Spa Dashboard')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/spa/dashboard', version: VERSION_NEUTRAL })
export class StaffSpaDashboardController {
  constructor(private readonly appointments: SpaAppointmentsService) {}

  @Get()
  @RequireStaffPermissions('spa.read')
  dashboard(@CurrentStaff() me: AuthenticatedStaff) {
    const { since, until } = todayBounds();
    return this.appointments.dashboard(me.propertyId, since, until);
  }
}

// ---------- Appointments ----------

@ApiTags('Staff Spa Appointments')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/spa/appointments', version: VERSION_NEUTRAL })
export class StaffSpaAppointmentsController {
  constructor(
    private readonly appointments: SpaAppointmentsService,
    private readonly audit: AuditService,
  ) {}

  /** A spa therapist is restricted to their own appointments; a manager is not. */
  private ownScope(me: AuthenticatedStaff): string | undefined {
    return me.role === 'SPA_STAFF' ? me.id : undefined;
  }

  @Get()
  @RequireStaffPermissions('spa.booking.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: AppointmentFilterDto) {
    const own = q.mine ? me.id : this.ownScope(me);
    return this.appointments.list(me.propertyId, q, own);
  }

  @Get(':id')
  @RequireStaffPermissions('spa.booking.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.appointments.get(me.propertyId, id, this.ownScope(me));
  }

  @Post()
  @RequireStaffPermissions('spa.booking.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateAppointmentDto) {
    const row = await this.appointments.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.spa.appointment.created',
      entity: 'spa_appointment',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch(':id')
  @RequireStaffPermissions('spa.booking.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    const { before, after } = await this.appointments.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.spa.appointment.updated',
      entity: 'spa_appointment',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Post(':id/assign')
  @RequireStaffPermissions('spa.roster.update')
  async assign(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: AssignTherapistDto,
  ) {
    const { before, after } = await this.appointments.assignTherapist(
      me.propertyId,
      id,
      dto.staffId,
    );
    await this.audit.record({
      action: 'staff.spa.appointment.assigned',
      entity: 'spa_appointment',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Post(':id/status')
  @RequireStaffPermissions('spa.booking.update')
  async setStatus(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: AppointmentStatusDto,
  ) {
    const { before, after } = await this.appointments.setStatus(
      me.propertyId,
      id,
      dto.status,
      this.ownScope(me),
    );
    await this.audit.record({
      action: 'staff.spa.appointment.status',
      entity: 'spa_appointment',
      entityId: id,
      before,
      after,
      reason: dto.status,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Post(':id/notes')
  @RequireStaffPermissions('spa.booking.update')
  async notes(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: AppointmentNotesDto,
  ) {
    const { after } = await this.appointments.addNotes(
      me.propertyId,
      id,
      dto.notes,
      this.ownScope(me),
    );
    return after;
  }
}

// ---------- Bills (accounts) ----------

@ApiTags('Staff Spa Bills')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/spa/bills', version: VERSION_NEUTRAL })
export class StaffSpaBillsController {
  constructor(
    private readonly bills: SpaBillsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('spa.bill.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query('status') status?: string) {
    return this.bills.list(me.propertyId, status);
  }

  @Get(':id')
  @RequireStaffPermissions('spa.bill.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.bills.requireBill(me.propertyId, id).then(SpaBillsService.toDto);
  }

  @Post()
  @RequireStaffPermissions('spa.bill.create')
  async create(
    @CurrentStaff() me: AuthenticatedStaff,
    @Body('appointmentId') appointmentId: string,
  ) {
    const row = await this.bills.createForAppointment(me.propertyId, appointmentId);
    await this.audit.record({
      action: 'staff.spa.bill.created',
      entity: 'spa_bill',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Post(':id/settle')
  @RequireStaffPermissions('spa.bill.settle')
  async settle(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: SettleBillDto,
  ) {
    const { before, after } = await this.bills.settle(me.propertyId, id, dto, me.id);
    await this.audit.record({
      action: 'staff.spa.bill.settled',
      entity: 'spa_bill',
      entityId: id,
      before,
      after,
      reason: dto.method,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Post(':id/refund')
  @RequireStaffPermissions('spa.bill.refund')
  async refund(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: RefundBillDto,
  ) {
    const { before, after } = await this.bills.refund(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.spa.bill.refunded',
      entity: 'spa_bill',
      entityId: id,
      before,
      after,
      reason: dto.reason,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }
}

// ---------- Revenue (accounts / manager) ----------

@ApiTags('Staff Spa Revenue')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/spa/revenue', version: VERSION_NEUTRAL })
export class StaffSpaRevenueController {
  constructor(private readonly bills: SpaBillsService) {}

  @Get()
  @RequireStaffPermissions('spa.revenue.read')
  revenue(@CurrentStaff() me: AuthenticatedStaff) {
    const { since } = todayBounds();
    return this.bills.revenue(me.propertyId, since);
  }
}
