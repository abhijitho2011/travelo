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
import { SecurityLogsService } from './logs.service';
import { IncidentsService } from './incidents.service';
import { SecurityShiftsService } from './shifts.service';
import {
  AssignIncidentDto,
  CreateShiftDto,
  GateLogQueryDto,
  IncidentFilterDto,
  RecordGateMovementDto,
  RecordLostFoundDto,
  RecordVisitorDto,
  ReportIncidentDto,
  ResolveIncidentDto,
  ShiftFilterDto,
  UpdateLostFoundDto,
  UpdateShiftStatusDto,
} from './dto';
import type { LostFoundStatus, SecurityShiftStatus } from '../../database/schema';

/**
 * Security, per property, under `/api/v1/staff/security/*`.
 *
 * TWO audiences share these routes. The security STAFF app already ships gate,
 * visitor, incident and lost-&-found screens — this is the backend they write to
 * (they had none before). The security MANAGER reads those ledgers plus the
 * roster and the oversight dashboard, and assigns/resolves incidents.
 *
 * The permission split keeps the guard honest:
 *   gate.read / gate.record         — read and write the gate feed (both roles)
 *   visitor.record / visitor.read   — write the visitor book / browse it
 *   incident.create                 — any guard reports; only the manager READS
 *   incident.read / incident.update — the manager browses, assigns, resolves
 *   lostfound.read/create/update    — the lost-&-found book
 *   shift.read / shift.assign       — the manager's roster
 */

// ---------- Gate log ----------

@ApiTags('Staff Security Gate')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/security/gate-log', version: VERSION_NEUTRAL })
export class StaffSecurityGateController {
  constructor(
    private readonly logs: SecurityLogsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('gate.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: GateLogQueryDto) {
    return this.logs.gateLog(me.propertyId, q.kind);
  }

  @Post()
  @RequireStaffPermissions('gate.record')
  async record(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: RecordGateMovementDto) {
    const row = await this.logs.recordGate(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.security.gate.recorded',
      entity: 'gate_movement',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }
}

// ---------- Visitors ----------

@ApiTags('Staff Security Visitors')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/security/visitors', version: VERSION_NEUTRAL })
export class StaffSecurityVisitorsController {
  constructor(
    private readonly logs: SecurityLogsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('visitor.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query('onSite') onSite?: string) {
    return this.logs.visitors(me.propertyId, onSite === 'true');
  }

  @Post()
  @RequireStaffPermissions('visitor.record')
  async record(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: RecordVisitorDto) {
    const row = await this.logs.recordVisitor(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.security.visitor.recorded',
      entity: 'visitor_log',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Post(':id/depart')
  @RequireStaffPermissions('visitor.record')
  async depart(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const row = await this.logs.departVisitor(me.propertyId, id);
    await this.audit.record({
      action: 'staff.security.visitor.departed',
      entity: 'visitor_log',
      entityId: id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }
}

// ---------- Lost & found ----------

@ApiTags('Staff Security Lost & Found')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/security/lost-found', version: VERSION_NEUTRAL })
export class StaffSecurityLostFoundController {
  constructor(
    private readonly logs: SecurityLogsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('lostfound.read')
  list(@CurrentStaff() me: AuthenticatedStaff) {
    return this.logs.lostFound(me.propertyId);
  }

  @Post()
  @RequireStaffPermissions('lostfound.create')
  async record(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: RecordLostFoundDto) {
    const row = await this.logs.recordLostFound(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.security.lostfound.recorded',
      entity: 'lost_found_item',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch(':id')
  @RequireStaffPermissions('lostfound.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateLostFoundDto,
  ) {
    const row = await this.logs.updateLostFound(me.propertyId, id, dto.status as LostFoundStatus);
    await this.audit.record({
      action: 'staff.security.lostfound.updated',
      entity: 'lost_found_item',
      entityId: id,
      after: row,
      reason: dto.status,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }
}

// ---------- Incidents ----------

@ApiTags('Staff Security Incidents')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/security/incidents', version: VERSION_NEUTRAL })
export class StaffSecurityIncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly audit: AuditService,
  ) {}

  /** Browsing the incident log is a MANAGER act (`incident.read`); a guard reports only. */
  @Get()
  @RequireStaffPermissions('incident.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: IncidentFilterDto) {
    return this.incidents.list(me.propertyId, q);
  }

  @Post()
  @RequireStaffPermissions('incident.create')
  async report(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: ReportIncidentDto) {
    const row = await this.incidents.report(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.security.incident.reported',
      entity: 'incident',
      entityId: row.id,
      after: row,
      reason: dto.severity,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Post(':id/assign')
  @RequireStaffPermissions('incident.update')
  async assign(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: AssignIncidentDto,
  ) {
    const { before, after } = await this.incidents.assign(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.security.incident.assigned',
      entity: 'incident',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Post(':id/resolve')
  @RequireStaffPermissions('incident.update')
  async resolve(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: ResolveIncidentDto,
  ) {
    const { before, after } = await this.incidents.resolve(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.security.incident.resolved',
      entity: 'incident',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }
}

// ---------- Manager: shifts, roster, dashboard ----------

@ApiTags('Staff Security Manager')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/security', version: VERSION_NEUTRAL })
export class StaffSecurityManagerController {
  constructor(
    private readonly shifts: SecurityShiftsService,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard')
  @RequireStaffPermissions('incident.read')
  dashboard(@CurrentStaff() me: AuthenticatedStaff) {
    return this.shifts.dashboard(me.propertyId);
  }

  @Get('roster')
  @RequireStaffPermissions('staff.attendance.read')
  roster(@CurrentStaff() me: AuthenticatedStaff) {
    return this.shifts.roster(me.propertyId);
  }

  @Get('shifts')
  @RequireStaffPermissions('shift.read')
  listShifts(@CurrentStaff() me: AuthenticatedStaff, @Query() q: ShiftFilterDto) {
    return this.shifts.list(me.propertyId, q);
  }

  @Post('shifts')
  @RequireStaffPermissions('shift.assign')
  async createShift(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateShiftDto) {
    const row = await this.shifts.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.security.shift.created',
      entity: 'security_shift',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch('shifts/:id')
  @RequireStaffPermissions('shift.assign')
  async updateShift(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateShiftStatusDto,
  ) {
    const { before, after } = await this.shifts.setStatus(
      me.propertyId,
      id,
      dto.status as SecurityShiftStatus,
    );
    await this.audit.record({
      action: 'staff.security.shift.updated',
      entity: 'security_shift',
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
}
