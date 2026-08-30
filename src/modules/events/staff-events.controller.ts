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
import { EventsService } from './events.service';
import {
  CancelEventDto,
  CreateEventDto,
  CreateEventTaskDto,
  EventFilterDto,
  EventStatusDto,
  UpdateEventDto,
  UpdateEventTaskDto,
} from './dto';

function todayBounds(now: Date = new Date()): { since: Date; until: Date } {
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  const until = new Date(since.getTime() + 24 * 60 * 60 * 1000);
  return { since, until };
}

/**
 * Events / Banquets, per property, under `/api/v1/staff/events/*` for the
 * EVENT_MANAGER. Every route resolves against the caller's own propertyId, so a
 * foreign id 404s. Reads use `event.read`; mutations `event.update`; cancelling
 * is the separate `event.cancel`, the one destructive act (mirrors
 * `reservation.cancel`). Creating is `event.create`.
 */
@ApiTags('Staff Events')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/events', version: VERSION_NEUTRAL })
export class StaffEventsController {
  constructor(
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  // Static route declared before ':id' so `/events/dashboard` never resolves as
  // an event id.
  @Get('dashboard')
  @RequireStaffPermissions('event.read')
  dashboard(@CurrentStaff() me: AuthenticatedStaff) {
    const { since, until } = todayBounds();
    return this.events.dashboard(me.propertyId, since, until);
  }

  @Get()
  @RequireStaffPermissions('event.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: EventFilterDto) {
    return this.events.list(me.propertyId, q);
  }

  @Get(':id')
  @RequireStaffPermissions('event.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.events.get(me.propertyId, id);
  }

  @Post()
  @RequireStaffPermissions('event.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateEventDto) {
    const row = await this.events.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.event.created',
      entity: 'event',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch(':id')
  @RequireStaffPermissions('event.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    const { before, after } = await this.events.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.event.updated',
      entity: 'event',
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
  @RequireStaffPermissions('event.update')
  async setStatus(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: EventStatusDto,
  ) {
    const { before, after } = await this.events.setStatus(me.propertyId, id, dto.status);
    await this.audit.record({
      action: 'staff.event.status',
      entity: 'event',
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

  @Post(':id/cancel')
  @RequireStaffPermissions('event.cancel')
  async cancel(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CancelEventDto,
  ) {
    const { before, after } = await this.events.setStatus(
      me.propertyId,
      id,
      'CANCELLED',
      dto.reason,
    );
    await this.audit.record({
      action: 'staff.event.cancelled',
      entity: 'event',
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

  // ---------- Tasks ----------

  @Get(':id/tasks')
  @RequireStaffPermissions('event.read')
  listTasks(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.events.listTasks(me.propertyId, id);
  }

  @Post(':id/tasks')
  @RequireStaffPermissions('event.update')
  async addTask(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CreateEventTaskDto,
  ) {
    const row = await this.events.addTask(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.event.task.created',
      entity: 'event_task',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch('tasks/:taskId')
  @RequireStaffPermissions('event.update')
  async updateTask(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateEventTaskDto,
  ) {
    const { before, after } = await this.events.updateTask(me.propertyId, taskId, dto);
    await this.audit.record({
      action: 'staff.event.task.updated',
      entity: 'event_task',
      entityId: taskId,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Delete('tasks/:taskId')
  @RequireStaffPermissions('event.update')
  async removeTask(@CurrentStaff() me: AuthenticatedStaff, @Param('taskId') taskId: string) {
    const res = await this.events.removeTask(me.propertyId, taskId);
    await this.audit.record({
      action: 'staff.event.task.deleted',
      entity: 'event_task',
      entityId: taskId,
      before: res.before,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return { id: res.id, deleted: res.deleted };
  }
}
