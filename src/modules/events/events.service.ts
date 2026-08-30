import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  eventTasks,
  events,
  hotelStaff,
  type EventRow,
  type EventStatus,
  type EventTask,
} from '../../database/schema';
import {
  CreateEventDto,
  CreateEventTaskDto,
  EventFilterDto,
  UpdateEventDto,
  UpdateEventTaskDto,
} from './dto';
import { EventErrors } from './events-errors';
import { ACTIVE_EVENT_STATUSES, assertEventTransition } from './events-rules';

/** Any transaction handle or the pool itself. */
export type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

const MAX_LIMIT = 200;

/**
 * Events / Banquets, per property.
 *
 * TENANT ISOLATION runs through every method: an event, a task, an assignee is
 * only ever resolved by (id, propertyId = the caller's own). Cross-property
 * 404s. The lifecycle state machine lives in events-rules.ts. Money is paise.
 */
@Injectable()
export class EventsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(e: EventRow) {
    return {
      id: e.id,
      propertyId: e.propertyId,
      name: e.name,
      clientName: e.clientName,
      type: e.type,
      venue: e.venue,
      startAt: e.startAt,
      endAt: e.endAt,
      guestCount: e.guestCount,
      package: e.package,
      status: e.status,
      revenuePaise: e.revenuePaise,
      roomBlock: e.roomBlock,
      notes: e.notes,
      cancelledAt: e.cancelledAt,
      completedAt: e.completedAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  static taskToDto(t: EventTask) {
    return {
      id: t.id,
      eventId: t.eventId,
      title: t.title,
      assigneeStaffId: t.assigneeStaffId,
      dueAt: t.dueAt,
      done: t.done,
      doneAt: t.doneAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async require(propertyId: string, id: string, tx: Tx = this.db): Promise<EventRow> {
    const [row] = await tx
      .select()
      .from(events)
      .where(and(eq(events.id, id), eq(events.propertyId, propertyId)))
      .limit(1);
    if (!row) throw EventErrors.notFound();
    return row;
  }

  private async requireAssignee(propertyId: string, staffId: string, tx: Tx = this.db) {
    const [row] = await tx
      .select({ id: hotelStaff.id })
      .from(hotelStaff)
      .where(and(eq(hotelStaff.id, staffId), eq(hotelStaff.propertyId, propertyId)))
      .limit(1);
    if (!row) throw EventErrors.assigneeNotFound();
    return row;
  }

  // ---------- Events ----------

  async list(propertyId: string, params: EventFilterDto) {
    const limit = Math.min(params.limit ?? 50, MAX_LIMIT);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [eq(events.propertyId, propertyId)];
    if (params.status) conds.push(eq(events.status, params.status));
    const where = and(...conds);
    const rows = await this.db
      .select()
      .from(events)
      .where(where)
      .orderBy(desc(events.startAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(events)
      .where(where);
    return { items: rows.map(EventsService.toDto), total: count, limit, offset };
  }

  async get(propertyId: string, id: string) {
    const event = await this.require(propertyId, id);
    const tasks = await this.tasksFor(id);
    return { ...EventsService.toDto(event), tasks: tasks.map(EventsService.taskToDto) };
  }

  async create(propertyId: string, dto: CreateEventDto) {
    const [row] = await this.db
      .insert(events)
      .values({
        propertyId,
        name: dto.name,
        clientName: dto.clientName,
        type: dto.type ?? null,
        venue: dto.venue ?? null,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : null,
        guestCount: dto.guestCount ?? 0,
        package: dto.package ?? null,
        revenuePaise: dto.revenuePaise ?? 0,
        roomBlock: dto.roomBlock ?? null,
        notes: dto.notes ?? null,
      })
      .returning();
    return EventsService.toDto(row);
  }

  async update(propertyId: string, id: string, dto: UpdateEventDto) {
    const before = await this.require(propertyId, id);
    const [row] = await this.db
      .update(events)
      .set({
        name: dto.name ?? before.name,
        clientName: dto.clientName ?? before.clientName,
        type: dto.type ?? before.type,
        venue: dto.venue ?? before.venue,
        startAt: dto.startAt ? new Date(dto.startAt) : before.startAt,
        endAt: dto.endAt ? new Date(dto.endAt) : before.endAt,
        guestCount: dto.guestCount ?? before.guestCount,
        package: dto.package ?? before.package,
        revenuePaise: dto.revenuePaise ?? before.revenuePaise,
        roomBlock: dto.roomBlock ?? before.roomBlock,
        notes: dto.notes ?? before.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, id), eq(events.propertyId, propertyId)))
      .returning();
    return { before, after: EventsService.toDto(row) };
  }

  async setStatus(propertyId: string, id: string, to: EventStatus, reason?: string) {
    const before = await this.require(propertyId, id);
    assertEventTransition(before.status, to);
    const [row] = await this.db
      .update(events)
      .set({
        status: to,
        cancelledAt: to === 'CANCELLED' ? new Date() : before.cancelledAt,
        completedAt: to === 'COMPLETED' ? new Date() : before.completedAt,
        notes: to === 'CANCELLED' && reason ? reason : before.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, id), eq(events.propertyId, propertyId)))
      .returning();
    return { before, after: EventsService.toDto(row) };
  }

  // ---------- Tasks ----------

  private async tasksFor(eventId: string, tx: Tx = this.db): Promise<EventTask[]> {
    return tx
      .select()
      .from(eventTasks)
      .where(eq(eventTasks.eventId, eventId))
      .orderBy(asc(eventTasks.createdAt));
  }

  async listTasks(propertyId: string, eventId: string) {
    await this.require(propertyId, eventId);
    const rows = await this.tasksFor(eventId);
    return { items: rows.map(EventsService.taskToDto), total: rows.length };
  }

  async addTask(propertyId: string, eventId: string, dto: CreateEventTaskDto) {
    await this.require(propertyId, eventId);
    if (dto.assigneeStaffId) await this.requireAssignee(propertyId, dto.assigneeStaffId);
    const [row] = await this.db
      .insert(eventTasks)
      .values({
        propertyId,
        eventId,
        title: dto.title,
        assigneeStaffId: dto.assigneeStaffId ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      })
      .returning();
    return EventsService.taskToDto(row);
  }

  private async requireTask(propertyId: string, taskId: string): Promise<EventTask> {
    const [row] = await this.db
      .select()
      .from(eventTasks)
      .where(and(eq(eventTasks.id, taskId), eq(eventTasks.propertyId, propertyId)))
      .limit(1);
    if (!row) throw EventErrors.taskNotFound();
    return row;
  }

  async updateTask(propertyId: string, taskId: string, dto: UpdateEventTaskDto) {
    const before = await this.requireTask(propertyId, taskId);
    if (dto.assigneeStaffId) await this.requireAssignee(propertyId, dto.assigneeStaffId);
    const done = dto.done ?? before.done;
    const [row] = await this.db
      .update(eventTasks)
      .set({
        title: dto.title ?? before.title,
        assigneeStaffId: dto.assigneeStaffId ?? before.assigneeStaffId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : before.dueAt,
        done,
        doneAt: done && !before.done ? new Date() : done ? before.doneAt : null,
        updatedAt: new Date(),
      })
      .where(and(eq(eventTasks.id, taskId), eq(eventTasks.propertyId, propertyId)))
      .returning();
    return { before, after: EventsService.taskToDto(row) };
  }

  async removeTask(propertyId: string, taskId: string) {
    const before = await this.requireTask(propertyId, taskId);
    await this.db
      .delete(eventTasks)
      .where(and(eq(eventTasks.id, taskId), eq(eventTasks.propertyId, propertyId)));
    return { id: taskId, deleted: true, before };
  }

  // ---------- Dashboard ----------

  /**
   * The manager's dashboard, one call: today's events, upcoming (confirmed /
   * in-progress) count and their contracted revenue, and pending (not-done)
   * tasks across the property.
   */
  async dashboard(propertyId: string, since: Date, until: Date) {
    const todayRows = await this.db
      .select()
      .from(events)
      .where(
        and(
          eq(events.propertyId, propertyId),
          gte(events.startAt, since),
          lt(events.startAt, until),
        ),
      )
      .orderBy(asc(events.startAt));

    const [upcoming] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${events.revenuePaise}), 0)::int`,
      })
      .from(events)
      .where(
        and(eq(events.propertyId, propertyId), inArray(events.status, [...ACTIVE_EVENT_STATUSES])),
      );

    const [pending] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventTasks)
      .where(and(eq(eventTasks.propertyId, propertyId), eq(eventTasks.done, false)));

    return {
      todayCount: todayRows.length,
      today: todayRows.map(EventsService.toDto),
      upcomingCount: upcoming?.count ?? 0,
      upcomingRevenuePaise: upcoming?.revenue ?? 0,
      pendingTasks: pending?.count ?? 0,
    };
  }
}
