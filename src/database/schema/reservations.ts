import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  text,
  date,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { properties } from './phase2';
import { hotelStaff } from './owner';
import { rooms, roomTypes } from './rooms';

/**
 * Reservations — the missing foundation under reception, occupancy and revenue.
 *
 * A reservation is a claim on a ROOM TYPE for a date range; a ROOM is only
 * attached when one is actually assigned (at booking time if the desk picks
 * one, otherwise at check-in). That is why `room_id` is nullable: a hotel sells
 * "a Deluxe for the 14th", not "room 304", and forcing a room at booking time
 * is what makes real front offices fight the software.
 *
 * DATES, NOT TIMESTAMPS. `check_in` and `check_out` are calendar dates in the
 * hotel's own local sense — a night is a night regardless of the guest walking
 * in at 14:00 or 23:00. `check_out` is EXCLUSIVE: a stay of 14th→15th is ONE
 * night and frees the room on the 15th, so the next guest arriving on the 15th
 * is not a conflict. Every overlap query in the service depends on that.
 */

export const reservationStatusValues = [
  /** Held, not yet committed. Does not block a room. */
  'PENDING',
  /** Committed. THIS is what blocks a room and counts towards capacity. */
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
  /** Confirmed, arrival date passed, guest never came. */
  'NO_SHOW',
] as const;
export type ReservationStatus = (typeof reservationStatusValues)[number];

/**
 * The two statuses that OCCUPY a room. Kept here rather than in the service so
 * the schema, the queries and the tests all read the same list — the
 * double-booking rule is defined by exactly this set.
 */
export const OCCUPYING_STATUSES = ['CONFIRMED', 'CHECKED_IN'] as const;

export const reservationSourceValues = ['WALK_IN', 'PHONE', 'EMAIL', 'OTA', 'OTHER'] as const;
export type ReservationSource = (typeof reservationSourceValues)[number];

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'restrict' }),
    /** NULL until a room is assigned — see the note above. */
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    /** NULL unless the stay is part of a group booking (Phase 4). */
    groupId: uuid('group_id'),
    /** `RSV-XXXXXX`. Unique PER PROPERTY: two hotels may both have RSV-000001. */
    reservationNumber: varchar('reservation_number', { length: 32 }).notNull(),

    guestName: varchar('guest_name', { length: 160 }).notNull(),
    guestPhone: varchar('guest_phone', { length: 32 }).notNull(),
    guestEmail: varchar('guest_email', { length: 254 }),
    guestIdType: varchar('guest_id_type', { length: 32 }),
    guestIdNumber: varchar('guest_id_number', { length: 64 }),

    adults: integer('adults').notNull().default(1),
    children: integer('children').notNull().default(0),

    checkIn: date('check_in').notNull(),
    /** EXCLUSIVE. check_out == another stay's check_in is NOT an overlap. */
    checkOut: date('check_out').notNull(),

    status: varchar('status', { length: 16 })
      .notNull()
      .default('PENDING')
      .$type<ReservationStatus>(),

    /** Paise, PER NIGHT. Snapshotted from the room type so a later rate change
     * never rewrites a booking that was already quoted. */
    ratePaise: integer('rate_paise').notNull().default(0),
    /** rate_paise x nights, stored so revenue never re-derives from live rates. */
    totalPaise: integer('total_paise').notNull().default(0),
    paidPaise: integer('paid_paise').notNull().default(0),
    currency: varchar('currency', { length: 8 }).notNull().default('INR'),

    source: varchar('source', { length: 16 })
      .notNull()
      .default('WALK_IN')
      .$type<ReservationSource>(),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    /** The arrivals/departures board is a date-range scan per property. */
    propertyCheckInIdx: index('reservations_property_check_in_idx').on(t.propertyId, t.checkIn),
    propertyStatusIdx: index('reservations_property_status_idx').on(t.propertyId, t.status),
    /** The overlap probe: candidate rows for one room, ordered by arrival. */
    roomCheckInIdx: index('reservations_room_check_in_idx').on(t.roomId, t.checkIn),
    numberUnique: uniqueIndex('reservations_property_number_unique').on(
      t.propertyId,
      t.reservationNumber,
    ),
  }),
);

/**
 * Append-only transition trail. Every status change writes a row here inside
 * the SAME transaction as the change, so "who checked this guest in, and when"
 * is answerable from the reservation itself and not only from the global audit
 * log (which a hotel's own staff cannot read).
 */
export const reservationEvents = pgTable(
  'reservation_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    /** e.g. `created`, `confirmed`, `room_assigned`, `checked_in`, `cancelled`. */
    type: varchar('type', { length: 48 }).notNull(),
    actorStaffId: uuid('actor_staff_id').references(() => hotelStaff.id, { onDelete: 'set null' }),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reservationIdx: index('reservation_events_reservation_idx').on(t.reservationId),
  }),
);

export type Reservation = typeof reservations.$inferSelect;
export type ReservationEvent = typeof reservationEvents.$inferSelect;

/**
 * The night audit's daily close per property — arrivals/departures/occupancy
 * and no-shows for one business date. Written by the NightAuditWorker, one row
 * per (property, date). The at-a-glance history the on-the-fly desk figures
 * could never give.
 */
export const propertyDailySnapshots = pgTable(
  'property_daily_snapshots',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    businessDate: date('business_date').notNull(),
    arrivals: integer('arrivals').notNull().default(0),
    departures: integer('departures').notNull().default(0),
    inHouse: integer('in_house').notNull().default(0),
    roomsAvailable: integer('rooms_available').notNull().default(0),
    roomsSold: integer('rooms_sold').notNull().default(0),
    occupancyPct: integer('occupancy_pct').notNull().default(0),
    noShows: integer('no_shows').notNull().default(0),
    revenuePaise: integer('revenue_paise').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyDateUnique: uniqueIndex('property_daily_snapshots_property_date_unique').on(
      t.propertyId,
      t.businessDate,
    ),
  }),
);

export type PropertyDailySnapshot = typeof propertyDailySnapshots.$inferSelect;

/**
 * The guest CRM overlay — the fields that are ABOUT a guest rather than one
 * stay (notes, blacklist), keyed by (property, phone). Stay history is the
 * reservations themselves, grouped by phone; this is only what those rows
 * cannot carry.
 */
export const guestProfiles = pgTable(
  'guest_profiles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    phone: varchar('phone', { length: 32 }).notNull(),
    name: varchar('name', { length: 160 }),
    email: varchar('email', { length: 254 }),
    idType: varchar('id_type', { length: 32 }),
    idNumber: varchar('id_number', { length: 64 }),
    notes: text('notes'),
    blacklisted: boolean('blacklisted').notNull().default(false),
    blacklistReason: text('blacklist_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyPhoneUnique: uniqueIndex('guest_profiles_property_phone_unique').on(
      t.propertyId,
      t.phone,
    ),
  }),
);

export type GuestProfile = typeof guestProfiles.$inferSelect;

/**
 * A group-booking master — a wedding block, a corporate party. Many
 * reservations reference it via `reservations.group_id`; each is still its own
 * stay. Phase 4, item 4.11 (first cut — shared folio is a later refinement).
 */
export const bookingGroups = pgTable(
  'booking_groups',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    contactName: varchar('contact_name', { length: 160 }),
    contactPhone: varchar('contact_phone', { length: 32 }),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('booking_groups_property_idx').on(t.propertyId),
  }),
);

export type BookingGroup = typeof bookingGroups.$inferSelect;
