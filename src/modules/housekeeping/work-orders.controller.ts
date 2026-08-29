import {
  Body,
  Controller,
  Get,
  Param,
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
import { WorkOrdersService, type WorkOrderActor } from './work-orders.service';
import {
  CancelWorkOrderDto,
  CompleteWorkOrderDto,
  CreateWorkOrderDto,
  WorkOrderFilterDto,
} from './dto';

/**
 * Maintenance work orders, per property.
 *
 * The permission split:
 *   workorder.read     — technicians and supervisors read the queue
 *   maintenance.report — anyone who finds a fault raises one (attendants,
 *                        cleaners, reception, technicians, supervisors)
 *   workorder.accept/start/pause/resume/complete — the technician's lifecycle
 *   workorder.cancel   — supervisor/GM close one out with a reason
 *
 * The property is never a client parameter; a foreign id 404s.
 */
@ApiTags('Staff Work Orders')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/work-orders', version: VERSION_NEUTRAL })
export class StaffWorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly audit: AuditService,
  ) {}

  private actor(me: AuthenticatedStaff): WorkOrderActor {
    return { id: me.id, isSupervisor: me.permissions.includes('workorder.cancel') };
  }

  @Get()
  @RequireStaffPermissions('workorder.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: WorkOrderFilterDto) {
    return this.workOrders.list(me.propertyId, q);
  }

  /** The technician's home feed. Declared BEFORE `:id`. */
  @Get('mine')
  @RequireStaffPermissions('workorder.read')
  mine(@CurrentStaff() me: AuthenticatedStaff) {
    return this.workOrders.mine(me.propertyId, me.id);
  }

  @Post()
  @RequireStaffPermissions('maintenance.report')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateWorkOrderDto) {
    const row = await this.workOrders.create(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.workorder.created',
      entity: 'work_order',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Get(':id')
  @RequireStaffPermissions('workorder.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.workOrders.get(me.propertyId, id);
  }

  @Post(':id/accept')
  @RequireStaffPermissions('workorder.accept')
  async accept(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const { before, after } = await this.workOrders.accept(me.propertyId, id, this.actor(me));
    await this.record(me, id, 'staff.workorder.accepted', before, after);
    return after;
  }

  @Post(':id/start')
  @RequireStaffPermissions('workorder.start')
  async start(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const { before, after } = await this.workOrders.start(me.propertyId, id);
    await this.record(me, id, 'staff.workorder.started', before, after);
    return after;
  }

  @Post(':id/pause')
  @RequireStaffPermissions('workorder.pause')
  async pause(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const { before, after } = await this.workOrders.pause(me.propertyId, id);
    await this.record(me, id, 'staff.workorder.paused', before, after);
    return after;
  }

  @Post(':id/resume')
  @RequireStaffPermissions('workorder.resume')
  async resume(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const { before, after } = await this.workOrders.resume(me.propertyId, id);
    await this.record(me, id, 'staff.workorder.resumed', before, after);
    return after;
  }

  @Post(':id/complete')
  @RequireStaffPermissions('workorder.complete')
  async complete(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CompleteWorkOrderDto,
  ) {
    const { before, after } = await this.workOrders.complete(me.propertyId, id, dto);
    await this.record(me, id, 'staff.workorder.completed', before, after);
    return after;
  }

  @Post(':id/cancel')
  @RequireStaffPermissions('workorder.cancel')
  async cancel(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CancelWorkOrderDto,
  ) {
    const { before, after } = await this.workOrders.cancel(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.workorder.cancelled',
      entity: 'work_order',
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

  private record(
    me: AuthenticatedStaff,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record({
      action,
      entity: 'work_order',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
  }
}
