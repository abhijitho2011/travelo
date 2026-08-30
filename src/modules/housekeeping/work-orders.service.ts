import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  hotelStaff,
  rooms,
  workOrders,
  type RoomStatus,
  type WorkOrder,
  type WorkOrderStatus,
} from '../../database/schema';
import { HousekeepingErrors } from './housekeeping-errors';
import { assertWorkOrderTransition, formatWorkOrderNumber } from './work-order-transitions';
import {
  CancelWorkOrderDto,
  CompleteWorkOrderDto,
  CreateWorkOrderDto,
  WorkOrderFilterDto,
} from './dto';

const MAX_LIMIT = 200;
const NUMBER_ATTEMPTS = 5;

type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

const PRIORITY_RANK = sql`CASE ${workOrders.priority}
  WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END`;

export interface WorkOrderActor {
  id: string;
  isSupervisor: boolean;
}

/**
 * Work orders — the maintenance loop.
 *
 * Same two invariants as every other operational module: strict per-property
 * isolation (a foreign id 404s), and a single central `canTransition` map that
 * every status change passes through. A work order that takes its room off the
 * board flips the room to MAINTENANCE on accept and back to DIRTY on complete —
 * DIRTY, not READY, because a room that was under repair still needs a clean.
 */
@Injectable()
export class WorkOrdersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ---------- Resolvers ----------

  async requireWorkOrder(propertyId: string, id: string): Promise<WorkOrder> {
    const [row] = await this.db
      .select()
      .from(workOrders)
      .where(
        and(
          eq(workOrders.id, id),
          eq(workOrders.propertyId, propertyId),
          isNull(workOrders.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw HousekeepingErrors.workOrderNotFound();
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

  // ---------- Reads ----------

  static conditions(propertyId: string, params: WorkOrderFilterDto): SQL[] {
    const conds: SQL[] = [eq(workOrders.propertyId, propertyId), isNull(workOrders.deletedAt)];
    if (params.status) conds.push(eq(workOrders.status, params.status));
    if (params.priority) conds.push(eq(workOrders.priority, params.priority));
    if (params.assignee) conds.push(eq(workOrders.assignedStaffId, params.assignee));
    if (params.roomId) conds.push(eq(workOrders.roomId, params.roomId));
    if (params.q) {
      const like = `%${params.q}%`;
      conds.push(
        or(
          sql`${workOrders.title} ILIKE ${like}`,
          sql`${workOrders.workOrderNumber} ILIKE ${like}`,
        ) as SQL,
      );
    }
    return conds;
  }

  static toDto(
    w: WorkOrder,
    room?: { id: string; number: string; status: string },
    assignee?: { id: string; firstName: string; lastName: string },
    reporter?: { id: string; firstName: string; lastName: string },
  ) {
    return {
      id: w.id,
      propertyId: w.propertyId,
      workOrderNumber: w.workOrderNumber,
      roomId: w.roomId,
      roomNumber: room?.number ?? null,
      roomStatus: room?.status ?? null,
      title: w.title,
      description: w.description,
      priority: w.priority,
      status: w.status,
      reportedBy: w.reportedBy,
      reporterName: reporter ? `${reporter.firstName} ${reporter.lastName}`.trim() : null,
      assignedStaffId: w.assignedStaffId,
      assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}`.trim() : null,
      resolution: w.resolution,
      partsUsed: w.partsUsed ?? null,
      takesRoomOutOfService: w.takesRoomOutOfService,
      cancelReason: w.cancelReason,
      acceptedAt: w.acceptedAt,
      startedAt: w.startedAt,
      completedAt: w.completedAt,
      cancelledAt: w.cancelledAt,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    };
  }

  async hydrate(rows: WorkOrder[]) {
    if (rows.length === 0) return [];
    const roomIds = [...new Set(rows.map((r) => r.roomId).filter((x): x is string => !!x))];
    const roomById = new Map<string, { id: string; number: string; status: string }>();
    if (roomIds.length) {
      const roomRows = await this.db
        .select({ id: rooms.id, number: rooms.number, status: rooms.status })
        .from(rooms)
        .where(inArray(rooms.id, roomIds));
      for (const r of roomRows) roomById.set(r.id, r);
    }

    const staffIds = [
      ...new Set(
        rows.flatMap((r) => [r.assignedStaffId, r.reportedBy]).filter((x): x is string => !!x),
      ),
    ];
    const staffById = new Map<string, { id: string; firstName: string; lastName: string }>();
    if (staffIds.length) {
      const staffRows = await this.db
        .select({
          id: hotelStaff.id,
          firstName: hotelStaff.firstName,
          lastName: hotelStaff.lastName,
        })
        .from(hotelStaff)
        .where(inArray(hotelStaff.id, staffIds));
      for (const s of staffRows) staffById.set(s.id, s);
    }

    return rows.map((w) =>
      WorkOrdersService.toDto(
        w,
        w.roomId ? roomById.get(w.roomId) : undefined,
        w.assignedStaffId ? staffById.get(w.assignedStaffId) : undefined,
        w.reportedBy ? staffById.get(w.reportedBy) : undefined,
      ),
    );
  }

  async list(propertyId: string, params: WorkOrderFilterDto = {}) {
    const limit = Math.min(params.limit ?? 50, MAX_LIMIT);
    const offset = params.offset ?? 0;
    const where = and(...WorkOrdersService.conditions(propertyId, params));

    const rows = await this.db
      .select()
      .from(workOrders)
      .orderBy(PRIORITY_RANK, desc(workOrders.createdAt))
      .where(where)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(where);

    return { items: await this.hydrate(rows), total: count, limit, offset };
  }

  async get(propertyId: string, id: string) {
    const row = await this.requireWorkOrder(propertyId, id);
    const [dto] = await this.hydrate([row]);
    return dto;
  }

  /** The technician's home feed: work orders assigned to them, still open. */
  async mine(propertyId: string, staffId: string) {
    const rows = await this.db
      .select()
      .from(workOrders)
      .where(
        and(
          eq(workOrders.propertyId, propertyId),
          isNull(workOrders.deletedAt),
          eq(workOrders.assignedStaffId, staffId),
          inArray(workOrders.status, ['ACCEPTED', 'IN_PROGRESS', 'PAUSED']),
        ),
      )
      .orderBy(PRIORITY_RANK, desc(workOrders.createdAt));
    return this.hydrate(rows);
  }

  // ---------- Mutations ----------

  async create(propertyId: string, dto: CreateWorkOrderDto, reporterId: string) {
    if (dto.roomId) await this.requireRoom(propertyId, dto.roomId);

    for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
      try {
        const row = await this.db.transaction(async (tx) => {
          const handle = tx as unknown as Tx;
          const [{ count }] = await handle
            .select({ count: sql<number>`count(*)::int` })
            .from(workOrders)
            .where(eq(workOrders.propertyId, propertyId));
          const [created] = await handle
            .insert(workOrders)
            .values({
              propertyId,
              roomId: dto.roomId ?? null,
              workOrderNumber: formatWorkOrderNumber((count ?? 0) + 1 + attempt),
              title: dto.title,
              description: dto.description ?? null,
              priority: dto.priority ?? 'NORMAL',
              status: 'OPEN',
              reportedBy: reporterId,
              takesRoomOutOfService: dto.takesRoomOutOfService ?? false,
            })
            .returning();
          // A room flagged out of service is out NOW — not once someone accepts
          // the order. Leaving it sellable in the meantime is how a guest ends
          // up handed the key to a flooded room.
          if ((dto.takesRoomOutOfService ?? false) && dto.roomId) {
            await WorkOrdersService.setRoomStatus(handle, dto.roomId, 'OUT_OF_ORDER', new Date());
          }
          return created;
        });
        const [out] = await this.hydrate([row]);
        return out;
      } catch (err) {
        if ((err as { code?: string }).code === '23505' && attempt < NUMBER_ATTEMPTS - 1) continue;
        throw err;
      }
    }
    // Unreachable: the loop either returns or throws.
    throw HousekeepingErrors.workOrderNotFound();
  }

  /**
   * OPEN → ACCEPTED. Assigns to the caller if unassigned. If the order takes
   * the room out of service, the room flips to MAINTENANCE here.
   */
  async accept(propertyId: string, id: string, actor: WorkOrderActor, now: Date = new Date()) {
    const before = await this.requireWorkOrder(propertyId, id);
    assertWorkOrderTransition(before.status, 'ACCEPTED');
    const assignee = before.assignedStaffId ?? actor.id;

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      const [updated] = await handle
        .update(workOrders)
        .set({ status: 'ACCEPTED', assignedStaffId: assignee, acceptedAt: now, updatedAt: now })
        .where(eq(workOrders.id, id))
        .returning();
      if (before.takesRoomOutOfService && before.roomId) {
        await WorkOrdersService.setRoomStatus(handle, before.roomId, 'MAINTENANCE', now);
      }
      return updated;
    });
    const [out] = await this.hydrate([row]);
    return { before, after: out };
  }

  /** ACCEPTED/PAUSED → IN_PROGRESS. */
  async start(propertyId: string, id: string, now: Date = new Date()) {
    return this.simpleTransition(propertyId, id, 'IN_PROGRESS', { startedAt: now }, now);
  }

  /** IN_PROGRESS → PAUSED. */
  async pause(propertyId: string, id: string, now: Date = new Date()) {
    return this.simpleTransition(propertyId, id, 'PAUSED', {}, now);
  }

  /** PAUSED → IN_PROGRESS. */
  async resume(propertyId: string, id: string, now: Date = new Date()) {
    return this.simpleTransition(propertyId, id, 'IN_PROGRESS', {}, now);
  }

  /**
   * IN_PROGRESS → COMPLETED. Resolution text is required. If the order took the
   * room out of service, the room returns to DIRTY (it still needs a clean).
   */
  async complete(
    propertyId: string,
    id: string,
    dto: CompleteWorkOrderDto,
    now: Date = new Date(),
  ) {
    const before = await this.requireWorkOrder(propertyId, id);
    if (!dto.resolution || dto.resolution.trim().length === 0) {
      throw HousekeepingErrors.resolutionRequired();
    }
    assertWorkOrderTransition(before.status, 'COMPLETED');

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      const [updated] = await handle
        .update(workOrders)
        .set({
          status: 'COMPLETED',
          resolution: dto.resolution.trim(),
          partsUsed: dto.partsUsed ?? before.partsUsed ?? null,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(workOrders.id, id))
        .returning();
      if (before.takesRoomOutOfService && before.roomId) {
        await WorkOrdersService.setRoomStatus(handle, before.roomId, 'DIRTY', now);
      }
      return updated;
    });
    const [out] = await this.hydrate([row]);
    return { before, after: out };
  }

  /**
   * Any non-terminal state → CANCELLED, with a reason. If the order had taken
   * the room out of service, the room is returned to DIRTY.
   */
  async cancel(propertyId: string, id: string, dto: CancelWorkOrderDto, now: Date = new Date()) {
    const before = await this.requireWorkOrder(propertyId, id);
    if (!dto.reason || dto.reason.trim().length === 0) {
      throw HousekeepingErrors.cancelReasonRequired();
    }
    assertWorkOrderTransition(before.status, 'CANCELLED');
    // The order took the room off the board (OUT_OF_ORDER on create, MAINTENANCE
    // on accept), so cancelling it must always put the room back — including a
    // cancel while still OPEN.
    const roomWasTakenOut = before.takesRoomOutOfService && !!before.roomId;

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      const [updated] = await handle
        .update(workOrders)
        .set({
          status: 'CANCELLED',
          cancelReason: dto.reason.trim(),
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(workOrders.id, id))
        .returning();
      // If the room had been taken off the board by this order, put it back.
      if (roomWasTakenOut) {
        await WorkOrdersService.setRoomStatus(handle, before.roomId!, 'DIRTY', now);
      }
      return updated;
    });
    const [out] = await this.hydrate([row]);
    return { before, after: out };
  }

  // ---------- helpers ----------

  private async simpleTransition(
    propertyId: string,
    id: string,
    target: WorkOrderStatus,
    extra: Partial<{ startedAt: Date }>,
    now: Date,
  ) {
    const before = await this.requireWorkOrder(propertyId, id);
    assertWorkOrderTransition(before.status, target);
    const set: Record<string, unknown> = { status: target, updatedAt: now, ...extra };
    // Only stamp startedAt the first time it starts.
    if (target === 'IN_PROGRESS' && !before.startedAt && extra.startedAt === undefined) {
      set.startedAt = now;
    }
    const [row] = await this.db
      .update(workOrders)
      .set(set)
      .where(eq(workOrders.id, id))
      .returning();
    const [out] = await this.hydrate([row]);
    return { before, after: out };
  }

  private static async setRoomStatus(tx: Tx, roomId: string, status: RoomStatus, now: Date) {
    await tx.update(rooms).set({ status, updatedAt: now }).where(eq(rooms.id, roomId));
  }
}
