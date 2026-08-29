import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { properties } from './phase2';
import { hotelStaff } from './owner';
import { rooms } from './rooms';

/**
 * Housekeeping and maintenance — the operational loop that turns a room over
 * after a guest leaves and keeps the building working.
 *
 * Two tables, two independent state machines:
 *   - `housekeeping_tasks`  — a unit of cleaning. Either a ROOM task (checkout
 *     clean, stayover, deep clean) or an AREA task (lobby, corridor, kitchen).
 *   - `work_orders`         — a maintenance job. A leaking tap, a dead AC. May
 *     take the room off the board while it is worked.
 *
 * Both are strictly per-property; every read resolves rows by
 * (id, property_id = the caller's own), so a foreign id 404s exactly like a
 * miss — the same isolation rule the rooms and reservations modules follow.
 */

// ---------- Housekeeping tasks ----------

export const housekeepingTaskTypeValues = [
  /** The turnover clean after a guest checks out. Auto-created by check-out. */
  'CHECKOUT_CLEAN',
  /** A light service while the guest is still in-house. */
  'STAYOVER',
  /** A periodic deep clean, beyond the daily turnover. */
  'DEEP_CLEAN',
  /** A non-room area — lobby, corridor, kitchen. Carries `area`, not `room_id`. */
  'AREA_CLEAN',
  /** Anything else the supervisor raises by hand. */
  'CUSTOM',
] as const;
export type HousekeepingTaskType = (typeof housekeepingTaskTypeValues)[number];

/**
 * The task lifecycle, driven by the ONE transition map in
 * `task-transitions.ts`:
 *
 *   PENDING → IN_PROGRESS → COMPLETED → INSPECTED   (the happy path)
 *                              COMPLETED → REJECTED  (inspection failed)
 *
 * A rejected task is terminal; the supervisor's inspect step raises a fresh
 * PENDING task referencing it, so the work is never silently lost.
 */
export const housekeepingTaskStatusValues = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'INSPECTED',
  'REJECTED',
] as const;
export type HousekeepingTaskStatus = (typeof housekeepingTaskStatusValues)[number];

export const housekeepingPriorityValues = ['LOW', 'NORMAL', 'HIGH'] as const;
export type HousekeepingPriority = (typeof housekeepingPriorityValues)[number];

export const housekeepingTasks = pgTable(
  'housekeeping_tasks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /**
     * NULL for an AREA task. Exactly one of `room_id` / `area` is set — the
     * CHECK below makes the other combinations unreachable.
     */
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    /** A non-room location for an AREA_CLEAN — "Lobby", "3rd floor corridor". */
    area: varchar('area', { length: 128 }),
    type: varchar('type', { length: 24 }).notNull().$type<HousekeepingTaskType>(),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('PENDING')
      .$type<HousekeepingTaskStatus>(),
    priority: varchar('priority', { length: 8 })
      .notNull()
      .default('NORMAL')
      .$type<HousekeepingPriority>(),
    /** A guest ask carried onto the task — "extra towels", "late service". */
    guestRequest: text('guest_request'),
    notes: text('notes'),
    /** The attendant/cleaner the task is assigned to. NULL = unclaimed. */
    assignedStaffId: uuid('assigned_staff_id').references(() => hotelStaff.id, {
      onDelete: 'set null',
    }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    inspectedAt: timestamp('inspected_at', { withTimezone: true }),
    /** The staff id that raised it (a supervisor, or NULL for the auto-clean). */
    createdBy: uuid('created_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyStatusIdx: index('housekeeping_tasks_property_status_idx').on(t.propertyId, t.status),
    assigneeStatusIdx: index('housekeeping_tasks_assignee_status_idx').on(
      t.assignedStaffId,
      t.status,
    ),
    // Exactly one of room_id / area. A room task names a room; an area task
    // names an area; neither-nor-both is meaningless and is refused here.
    locationCheck: check(
      'housekeeping_tasks_location_check',
      sql`(${t.roomId} IS NOT NULL AND ${t.area} IS NULL) OR (${t.roomId} IS NULL AND ${t.area} IS NOT NULL)`,
    ),
  }),
);

// ---------- Work orders ----------

export const workOrderPriorityValues = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export type WorkOrderPriority = (typeof workOrderPriorityValues)[number];

/**
 * The work-order lifecycle, driven by the ONE map in
 * `work-order-transitions.ts`:
 *
 *   OPEN → ACCEPTED → IN_PROGRESS ⇄ PAUSED → COMPLETED
 *   OPEN / ACCEPTED / IN_PROGRESS / PAUSED → CANCELLED
 *
 * COMPLETED and CANCELLED are terminal; a job that turns out to need more work
 * is raised as a new order rather than reopened.
 */
export const workOrderStatusValues = [
  'OPEN',
  'ACCEPTED',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type WorkOrderStatus = (typeof workOrderStatusValues)[number];

export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** The affected room, when there is one. NULL for a common-area job. */
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    /** `WO-XXXXX`. Unique PER PROPERTY: two hotels may both hold WO-00001. */
    workOrderNumber: varchar('work_order_number', { length: 32 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    priority: varchar('priority', { length: 8 })
      .notNull()
      .default('NORMAL')
      .$type<WorkOrderPriority>(),
    status: varchar('status', { length: 16 }).notNull().default('OPEN').$type<WorkOrderStatus>(),
    /** The staff id that reported the fault (attendant, receptionist, anyone). */
    reportedBy: uuid('reported_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    /** The technician working it. Set to self on accept if unassigned. */
    assignedStaffId: uuid('assigned_staff_id').references(() => hotelStaff.id, {
      onDelete: 'set null',
    }),
    /** Free text, REQUIRED to complete — what was actually done. */
    resolution: text('resolution'),
    /** Optional list of parts consumed, e.g. `[{ "name": "tap washer", "qty": 2 }]`. */
    partsUsed: jsonb('parts_used'),
    /**
     * When true, accepting the order sends the room to MAINTENANCE (off the
     * board) and completing it sends the room back to DIRTY for a fresh clean.
     */
    takesRoomOutOfService: boolean('takes_room_out_of_service').notNull().default(false),
    /** Reason recorded when a supervisor/GM cancels. */
    cancelReason: text('cancel_reason'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyStatusIdx: index('work_orders_property_status_idx').on(t.propertyId, t.status),
    assigneeStatusIdx: index('work_orders_assignee_status_idx').on(t.assignedStaffId, t.status),
    numberUnique: uniqueIndex('work_orders_property_number_unique')
      .on(t.propertyId, t.workOrderNumber)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type HousekeepingTask = typeof housekeepingTasks.$inferSelect;
export type WorkOrder = typeof workOrders.$inferSelect;
