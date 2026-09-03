import {
  Res,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { HousekeepingService, type TaskActor } from './housekeeping.service';
import {
  AssignTaskDto,
  CompleteTaskDto,
  CreateTaskDto,
  InspectTaskDto,
  TaskFilterDto,
} from './dto';

/**
 * Housekeeping tasks, per property.
 *
 * The permission split:
 *   task.read     — everyone who needs the board or their own feed
 *   task.create   — supervisor raises an ad-hoc task
 *   task.assign   — supervisor assigns; also marks the SUPERVISOR actor, who
 *                   may act on ANY task, not only their own
 *   task.start / task.complete — the attendant works their task
 *   task.inspect  — supervisor passes or fails a finished clean
 *   housekeeping.read — the room board
 *
 * The property is never a client parameter; every route resolves against the
 * caller's own `propertyId`, so a foreign id 404s.
 */
@ApiTags('Staff Housekeeping')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/housekeeping', version: VERSION_NEUTRAL })
export class StaffHousekeepingController {
  constructor(
    private readonly housekeeping: HousekeepingService,
    private readonly audit: AuditService,
  ) {}

  private actor(me: AuthenticatedStaff): TaskActor {
    return {
      id: me.id,
      email: me.email,
      role: me.role,
      // Holding `task.assign` is what makes a caller a supervisor: it lets them
      // act on any task at the property rather than only their own.
      isSupervisor: me.permissions.includes('task.assign'),
    };
  }

  @Get('tasks')
  @RequireStaffPermissions('task.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: TaskFilterDto) {
    return this.housekeeping.list(me.propertyId, q);
  }

  /**
   * The room board in one call. Declared BEFORE `tasks/:id` is irrelevant (a
   * different prefix) but kept near the other reads.
   */
  /**
   * The housekeeping charter: every room, its status and its open task, as a
   * CSV the supervisor prints for the trolley. `@Res` bypasses the JSON
   * envelope, as the other exports do.
   */
  @Get('charter.csv')
  @RequireStaffPermissions('housekeeping.read')
  async charter(@CurrentStaff() me: AuthenticatedStaff, @Res() res: Response) {
    const board = (await this.housekeeping.board(me.propertyId)) as {
      groups: Record<
        string,
        {
          number: string;
          floor?: string | null;
          status: string;
          task?: { status?: string; assigneeName?: string | null; notes?: string | null } | null;
        }[]
      >;
    };
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['Room,Floor,Status,Task,Assigned to,Notes'];
    const rooms = Object.values(board.groups ?? {})
      .flat()
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    for (const r of rooms) {
      lines.push(
        [
          r.number,
          r.floor ?? '',
          r.status,
          r.task?.status ?? '',
          r.task?.assigneeName ?? '',
          r.task?.notes ?? '',
        ]
          .map(esc)
          .join(','),
      );
    }
    res
      .type('text/csv')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="housekeeping-charter-${new Date().toISOString().slice(0, 10)}.csv"`,
      )
      .send(lines.join('\n'));
  }

  @Get('board')
  @RequireStaffPermissions('housekeeping.read')
  board(@CurrentStaff() me: AuthenticatedStaff) {
    return this.housekeeping.board(me.propertyId);
  }

  /** The attendant/cleaner feed: my tasks plus unassigned claimable ones. */
  @Get('my-tasks')
  @RequireStaffPermissions('task.read')
  myTasks(@CurrentStaff() me: AuthenticatedStaff) {
    return this.housekeeping.myTasks(me.propertyId, me.id);
  }

  /** The assignee picker for the board. */
  @Get('staff')
  @RequireStaffPermissions('task.assign')
  assignableStaff(@CurrentStaff() me: AuthenticatedStaff) {
    return this.housekeeping.assignableStaff(me.propertyId);
  }

  @Post('tasks')
  @RequireStaffPermissions('task.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateTaskDto) {
    const row = await this.housekeeping.create(me.propertyId, dto, this.actor(me));
    await this.audit.record({
      action: 'staff.housekeeping.task.created',
      entity: 'housekeeping_task',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Get('tasks/:id')
  @RequireStaffPermissions('task.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.housekeeping.get(me.propertyId, id);
  }

  @Post('tasks/:id/assign')
  @RequireStaffPermissions('task.assign')
  async assign(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
  ) {
    const { before, after } = await this.housekeeping.assign(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.housekeeping.task.assigned',
      entity: 'housekeeping_task',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Post('tasks/:id/start')
  @RequireStaffPermissions('task.start')
  async start(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const { before, after } = await this.housekeeping.start(me.propertyId, id, this.actor(me));
    await this.audit.record({
      action: 'staff.housekeeping.task.started',
      entity: 'housekeeping_task',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Post('tasks/:id/complete')
  @RequireStaffPermissions('task.complete')
  async complete(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: CompleteTaskDto,
  ) {
    const { before, after } = await this.housekeeping.complete(
      me.propertyId,
      id,
      dto,
      this.actor(me),
    );
    await this.audit.record({
      action: 'staff.housekeeping.task.completed',
      entity: 'housekeeping_task',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Post('tasks/:id/inspect')
  @RequireStaffPermissions('task.inspect')
  async inspect(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: InspectTaskDto,
  ) {
    const { before, after, redo } = await this.housekeeping.inspect(
      me.propertyId,
      id,
      dto,
      this.actor(me),
    );
    await this.audit.record({
      action: dto.pass ? 'staff.housekeeping.task.inspected' : 'staff.housekeeping.task.rejected',
      entity: 'housekeeping_task',
      entityId: id,
      before,
      after: { ...after, redoTaskId: redo?.id ?? null },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return { ...after, redoTask: redo };
  }
}
