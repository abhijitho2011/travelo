import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  hotelStaff,
  housekeepingTasks,
  rooms,
  type HousekeepingTask,
  type HousekeepingTaskStatus,
  type RoomStatus,
} from '../../database/schema';
import { HousekeepingErrors } from './housekeeping-errors';
import { assertTaskTransition, ROOM_STATUS_FOR_TASK } from './task-transitions';
import { AssignTaskDto, CompleteTaskDto, CreateTaskDto, InspectTaskDto, TaskFilterDto } from './dto';

const MAX_LIMIT = 200;

/** Any transaction handle or the pool itself — both expose the same query API. */
type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

/** Priority ordering used everywhere the attendant feed is sorted. */
const PRIORITY_RANK = sql`CASE ${housekeepingTasks.priority}
  WHEN 'HIGH' THEN 0 WHEN 'NORMAL' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END`;

/**
 * A task not yet inspected or rejected. These are the ones that still "count"
 * against a room, so the check-out auto-clean skips a room that already has one,
 * and the board shows one per room.
 */
export const OPEN_TASK_STATUSES: readonly HousekeepingTaskStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
];

/**
 * The actor context a mutation runs under. `isSupervisor` (holds `task.assign`)
 * decides whether the caller may act on a task that is not their own; the
 * controller resolves it from the real permission list, never the client.
 */
export interface TaskActor {
  id: string;
  email?: string;
  role?: string;
  isSupervisor: boolean;
}

/**
 * Housekeeping tasks — the cleaning loop.
 *
 * Two rules run through every method, exactly as in the rooms and reservations
 * modules:
 *  1. Tenant isolation. A task is only ever resolved by
 *     (id, propertyId = the caller's own, deletedAt IS NULL). Cross-property
 *     reads 404, indistinguishable from a miss.
 *  2. Every status change goes through `assertTaskTransition`, and a ROOM task
 *     drives its room's status through the same central `ROOM_STATUS_FOR_TASK`
 *     map — the housekeeping loop is defined in exactly one place.
 */
@Injectable()
export class HousekeepingService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ---------- Resolvers ----------

  async requireTask(propertyId: string, id: string): Promise<HousekeepingTask> {
    const [row] = await this.db
      .select()
      .from(housekeepingTasks)
      .where(
        and(
          eq(housekeepingTasks.id, id),
          eq(housekeepingTasks.propertyId, propertyId),
          isNull(housekeepingTasks.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw HousekeepingErrors.taskNotFound();
    return row;
  }

  private async requireRoom(propertyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt)))
      .limit(1);
    if (!row) throw HousekeepingErrors.roomNotFound();
    return row;
  }

  private async requireStaff(propertyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(hotelStaff)
      .where(and(eq(hotelStaff.id, id), eq(hotelStaff.propertyId, propertyId), isNull(hotelStaff.deletedAt)))
      .limit(1);
    if (!row) throw HousekeepingErrors.staffNotFound();
    return row;
  }

  // ---------- Reads ----------

  static conditions(propertyId: string, params: TaskFilterDto): SQL[] {
    const conds: SQL[] = [
      eq(housekeepingTasks.propertyId, propertyId),
      isNull(housekeepingTasks.deletedAt),
    ];
    if (params.status) conds.push(eq(housekeepingTasks.status, params.status));
    if (params.type) conds.push(eq(housekeepingTasks.type, params.type));
    if (params.assignee) conds.push(eq(housekeepingTasks.assignedStaffId, params.assignee));
    if (params.roomId) conds.push(eq(housekeepingTasks.roomId, params.roomId));
    if (params.area) conds.push(eq(housekeepingTasks.area, params.area));
    return conds;
  }

  static toDto(
    t: HousekeepingTask,
    room?: { id: string; number: string; floor: string | null; status: string },
    assignee?: { id: string; firstName: string; lastName: string },
  ) {
    return {
      id: t.id,
      propertyId: t.propertyId,
      roomId: t.roomId,
      roomNumber: room?.number ?? null,
      roomFloor: room?.floor ?? null,
      roomStatus: room?.status ?? null,
      area: t.area,
      type: t.type,
      status: t.status,
      priority: t.priority,
      guestRequest: t.guestRequest,
      notes: t.notes,
      assignedStaffId: t.assignedStaffId,
      assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}`.trim() : null,
      dueAt: t.dueAt,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      inspectedAt: t.inspectedAt,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  /** Two extra queries per page, regardless of size — rooms and assignees. */
  async hydrate(rows: HousekeepingTask[]) {
    if (rows.length === 0) return [];
    const roomIds = [...new Set(rows.map((r) => r.roomId).filter((x): x is string => !!x))];
    const roomById = new Map<string, { id: string; number: string; floor: string | null; status: string }>();
    if (roomIds.length) {
      const roomRows = await this.db
        .select({ id: rooms.id, number: rooms.number, floor: rooms.floor, status: rooms.status })
        .from(rooms)
        .where(inArray(rooms.id, roomIds));
      for (const r of roomRows) roomById.set(r.id, r);
    }

    const staffIds = [...new Set(rows.map((r) => r.assignedStaffId).filter((x): x is string => !!x))];
    const staffById = new Map<string, { id: string; firstName: string; lastName: string }>();
    if (staffIds.length) {
      const staffRows = await this.db
        .select({ id: hotelStaff.id, firstName: hotelStaff.firstName, lastName: hotelStaff.lastName })
        .from(hotelStaff)
        .where(inArray(hotelStaff.id, staffIds));
      for (const s of staffRows) staffById.set(s.id, s);
    }

    return rows.map((t) =>
      HousekeepingService.toDto(
        t,
        t.roomId ? roomById.get(t.roomId) : undefined,
        t.assignedStaffId ? staffById.get(t.assignedStaffId) : undefined,
      ),
    );
  }

  async list(propertyId: string, params: TaskFilterDto = {}) {
    const limit = Math.min(params.limit ?? 50, MAX_LIMIT);
    const offset = params.offset ?? 0;
    const where = and(...HousekeepingService.conditions(propertyId, params));

    const rows = await this.db
      .select()
      .from(housekeepingTasks)
      .orderBy(PRIORITY_RANK, asc(housekeepingTasks.dueAt), desc(housekeepingTasks.createdAt))
      .where(where)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(housekeepingTasks)
      .where(where);

    return { items: await this.hydrate(rows), total: count, limit, offset };
  }

  async get(propertyId: string, id: string) {
    const row = await this.requireTask(propertyId, id);
    const [dto] = await this.hydrate([row]);
    return dto;
  }

  /**
   * The attendant/cleaner feed: tasks assigned to me, plus unassigned tasks I
   * can claim on start. Sorted by priority then due time — the order the day is
   * meant to be worked. Terminal tasks (inspected/rejected) drop off.
   */
  async myTasks(propertyId: string, staffId: string) {
    const rows = await this.db
      .select()
      .from(housekeepingTasks)
      .where(
        and(
          eq(housekeepingTasks.propertyId, propertyId),
          isNull(housekeepingTasks.deletedAt),
          inArray(housekeepingTasks.status, ['PENDING', 'IN_PROGRESS']),
          or(
            eq(housekeepingTasks.assignedStaffId, staffId),
            isNull(housekeepingTasks.assignedStaffId),
          ),
        ),
      )
      .orderBy(PRIORITY_RANK, asc(housekeepingTasks.dueAt), desc(housekeepingTasks.createdAt));
    return this.hydrate(rows);
  }

  /**
   * The supervisor board in ONE call: every room of the property with its open
   * housekeeping task (and that task's assignee) attached, grouped by room
   * status, plus per-status counts.
   */
  async board(propertyId: string) {
    const roomRows = await this.db
      .select({
        id: rooms.id,
        number: rooms.number,
        floor: rooms.floor,
        status: rooms.status,
      })
      .from(rooms)
      .where(and(eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt)))
      .orderBy(asc(rooms.number));

    // The open task per room, newest first so the current one wins.
    const taskRows = await this.db
      .select()
      .from(housekeepingTasks)
      .where(
        and(
          eq(housekeepingTasks.propertyId, propertyId),
          isNull(housekeepingTasks.deletedAt),
          inArray(housekeepingTasks.status, [...OPEN_TASK_STATUSES]),
        ),
      )
      .orderBy(desc(housekeepingTasks.createdAt));

    const openTasks = await this.hydrate(taskRows);
    const taskByRoom = new Map<string, (typeof openTasks)[number]>();
    for (const t of openTasks) {
      if (t.roomId && !taskByRoom.has(t.roomId)) taskByRoom.set(t.roomId, t);
    }

    const grouped: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const room of roomRows) {
      counts[room.status] = (counts[room.status] ?? 0) + 1;
      (grouped[room.status] ??= []).push({ ...room, task: taskByRoom.get(room.id) ?? null });
    }

    // Area tasks (no room) surface separately so the board never hides them.
    const areaTasks = openTasks.filter((t) => !t.roomId);

    return { groups: grouped, counts, totalRooms: roomRows.length, areaTasks };
  }

  // ---------- Mutations ----------

  async create(propertyId: string, dto: CreateTaskDto, actor: TaskActor) {
    const hasRoom = !!dto.roomId;
    const hasArea = !!dto.area && dto.area.trim().length > 0;
    // Exactly one of room / area — the same rule the CHECK constraint enforces.
    if (hasRoom === hasArea) throw HousekeepingErrors.locationRequired();
    if (dto.roomId) await this.requireRoom(propertyId, dto.roomId);
    if (dto.assignedStaffId) await this.requireStaff(propertyId, dto.assignedStaffId);

    const [row] = await this.db
      .insert(housekeepingTasks)
      .values({
        propertyId,
        roomId: dto.roomId ?? null,
        area: hasArea ? dto.area!.trim() : null,
        type: dto.type,
        status: 'PENDING',
        priority: dto.priority ?? 'NORMAL',
        guestRequest: dto.guestRequest ?? null,
        notes: dto.notes ?? null,
        assignedStaffId: dto.assignedStaffId ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        createdBy: actor.id,
      })
      .returning();
    const [out] = await this.hydrate([row]);
    return out;
  }

  async assign(propertyId: string, id: string, dto: AssignTaskDto, now: Date = new Date()) {
    const before = await this.requireTask(propertyId, id);
    await this.requireStaff(propertyId, dto.staffId);
    const [row] = await this.db
      .update(housekeepingTasks)
      .set({ assignedStaffId: dto.staffId, updatedAt: now })
      .where(eq(housekeepingTasks.id, id))
      .returning();
    const [out] = await this.hydrate([row]);
    return { before, after: out };
  }

  /**
   * PENDING → IN_PROGRESS. A room task sends its room to CLEANING.
   *
   * An attendant may only start a task assigned to them OR an unassigned one,
   * which they CLAIM here (assignedStaffId := them). A supervisor may start any
   * task at the property.
   */
  async start(propertyId: string, id: string, actor: TaskActor, now: Date = new Date()) {
    const before = await this.requireTask(propertyId, id);
    this.assertMayWork(before, actor);
    assertTaskTransition(before.status, 'IN_PROGRESS');

    const claim = !before.assignedStaffId ? actor.id : before.assignedStaffId;
    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      const [updated] = await handle
        .update(housekeepingTasks)
        .set({
          status: 'IN_PROGRESS',
          assignedStaffId: claim,
          startedAt: now,
          updatedAt: now,
        })
        .where(eq(housekeepingTasks.id, id))
        .returning();
      if (before.roomId) {
        await HousekeepingService.setRoomStatus(handle, before.roomId, ROOM_STATUS_FOR_TASK.START, now);
      }
      return updated;
    });
    const [out] = await this.hydrate([row]);
    return { before, after: out };
  }

  /** IN_PROGRESS → COMPLETED. A room task sends its room to INSPECTED. */
  async complete(
    propertyId: string,
    id: string,
    dto: CompleteTaskDto,
    actor: TaskActor,
    now: Date = new Date(),
  ) {
    const before = await this.requireTask(propertyId, id);
    this.assertMayWork(before, actor);
    assertTaskTransition(before.status, 'COMPLETED');

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      const [updated] = await handle
        .update(housekeepingTasks)
        .set({
          status: 'COMPLETED',
          completedAt: now,
          notes: dto.notes ?? before.notes,
          updatedAt: now,
        })
        .where(eq(housekeepingTasks.id, id))
        .returning();
      if (before.roomId) {
        await HousekeepingService.setRoomStatus(handle, before.roomId, ROOM_STATUS_FOR_TASK.COMPLETE, now);
      }
      return updated;
    });
    const [out] = await this.hydrate([row]);
    return { before, after: out };
  }

  /**
   * Supervisor inspection.
   *   pass ⇒ COMPLETED → INSPECTED, room → READY.
   *   fail ⇒ COMPLETED → REJECTED, room → DIRTY, and a FRESH PENDING task is
   *          raised referencing the rejected one so the redo is never lost.
   */
  async inspect(
    propertyId: string,
    id: string,
    dto: InspectTaskDto,
    actor: TaskActor,
    now: Date = new Date(),
  ) {
    const before = await this.requireTask(propertyId, id);
    const target: HousekeepingTaskStatus = dto.pass ? 'INSPECTED' : 'REJECTED';
    assertTaskTransition(before.status, target);

    const result = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      const [updated] = await handle
        .update(housekeepingTasks)
        .set({
          status: target,
          inspectedAt: now,
          notes: dto.notes ?? before.notes,
          updatedAt: now,
        })
        .where(eq(housekeepingTasks.id, id))
        .returning();

      let redo: HousekeepingTask | null = null;
      if (dto.pass) {
        if (before.roomId) {
          await HousekeepingService.setRoomStatus(handle, before.roomId, ROOM_STATUS_FOR_TASK.INSPECT_PASS, now);
        }
      } else {
        if (before.roomId) {
          await HousekeepingService.setRoomStatus(handle, before.roomId, ROOM_STATUS_FOR_TASK.INSPECT_FAIL, now);
        }
        const reason = dto.notes ? ` — ${dto.notes}` : '';
        [redo] = await handle
          .insert(housekeepingTasks)
          .values({
            propertyId,
            roomId: before.roomId,
            area: before.area,
            type: before.type,
            status: 'PENDING',
            priority: before.priority,
            guestRequest: before.guestRequest,
            notes: `Re-clean after failed inspection of task ${before.id}${reason}`,
            assignedStaffId: before.assignedStaffId,
            createdBy: actor.id,
          })
          .returning();
      }
      return { updated, redo };
    });

    const [after] = await this.hydrate([result.updated]);
    const redo = result.redo ? (await this.hydrate([result.redo]))[0] : null;
    return { before, after, redo };
  }

  // ---------- The check-out hook ----------

  /**
   * Auto-create a CHECKOUT_CLEAN task for a room that has just gone DIRTY.
   *
   * Called from the reservations check-out path INSIDE its transaction, so the
   * room flip and the task creation commit together. Skips silently if the room
   * already has an open task, so a re-run or a manual clean never doubles up.
   * Returns the created task id, or null when skipped.
   */
  static async createCheckoutCleanForRoom(
    tx: Tx,
    propertyId: string,
    roomId: string,
    actorStaffId: string | null,
    now: Date = new Date(),
  ): Promise<string | null> {
    const existing = await tx
      .select({ id: housekeepingTasks.id })
      .from(housekeepingTasks)
      .where(
        and(
          eq(housekeepingTasks.propertyId, propertyId),
          eq(housekeepingTasks.roomId, roomId),
          isNull(housekeepingTasks.deletedAt),
          inArray(housekeepingTasks.status, [...OPEN_TASK_STATUSES]),
        ),
      )
      .limit(1);
    if (existing.length > 0) return null;

    const [created] = await tx
      .insert(housekeepingTasks)
      .values({
        propertyId,
        roomId,
        type: 'CHECKOUT_CLEAN',
        status: 'PENDING',
        priority: 'NORMAL',
        notes: 'Auto-created on guest check-out',
        createdBy: actorStaffId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: housekeepingTasks.id });
    return created?.id ?? null;
  }

  // ---------- helpers ----------

  private assertMayWork(task: HousekeepingTask, actor: TaskActor) {
    if (actor.isSupervisor) return;
    // Attendants: own tasks, or unassigned ones (claimed on start).
    if (task.assignedStaffId && task.assignedStaffId !== actor.id) {
      throw HousekeepingErrors.notYourTask();
    }
  }

  private static async setRoomStatus(tx: Tx, roomId: string, status: RoomStatus, now: Date) {
    await tx.update(rooms).set({ status, updatedAt: now }).where(eq(rooms.id, roomId));
  }
}
