import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  boolean,
  text,
  index,
} from 'drizzle-orm/pg-core';
import { properties } from './phase2';
import { hotelStaff } from './owner';

/**
 * Events / Banquets — an enquiry that becomes a confirmed function with a
 * checklist behind it.
 *
 * PROPERTY-SCOPED like everything else: an event, a task is only ever resolved
 * by (id, propertyId = the caller's own). Cross-property reads 404.
 *
 * MONEY IS PAISE, integer. `revenue_paise` is the contracted value of the
 * function; no floats touch a rupee.
 */

// ---------- Events ----------

/**
 * ENQUIRY     — a lead; nothing committed.
 * CONFIRMED   — booked, deposit taken (out of scope here), on the calendar.
 * IN_PROGRESS — the function is running.
 * COMPLETED   — done and billed.
 * CANCELLED   — called off.
 */
export const eventStatusValues = [
  'ENQUIRY',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export type EventStatus = (typeof eventStatusValues)[number];

export const events = pgTable(
  'events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    clientName: varchar('client_name', { length: 200 }).notNull(),
    /** Wedding, conference, birthday — free text, the desk's own taxonomy. */
    type: varchar('type', { length: 80 }),
    venue: varchar('venue', { length: 160 }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }),
    guestCount: integer('guest_count').notNull().default(0),
    /** The chosen package label — "Gold", "Silver", a custom name. */
    package: varchar('package', { length: 120 }),
    status: varchar('status', { length: 16 }).notNull().default('ENQUIRY').$type<EventStatus>(),
    /** Contracted value, paise. Zero for a bare enquiry. */
    revenuePaise: integer('revenue_paise').notNull().default(0),
    /** Rooms held for the function's guests. NULL when no block is needed. */
    roomBlock: integer('room_block'),
    notes: text('notes'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('events_property_idx').on(t.propertyId),
    statusIdx: index('events_status_idx').on(t.status),
    startIdx: index('events_start_idx').on(t.startAt),
  }),
);

// ---------- Event tasks ----------

export const eventTasks = pgTable(
  'event_tasks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    assigneeStaffId: uuid('assignee_staff_id').references(() => hotelStaff.id, {
      onDelete: 'set null',
    }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    done: boolean('done').notNull().default(false),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('event_tasks_property_idx').on(t.propertyId),
    eventIdx: index('event_tasks_event_idx').on(t.eventId),
  }),
);

// ---------- Row types ----------

export type EventRow = typeof events.$inferSelect;
export type EventTask = typeof eventTasks.$inferSelect;
