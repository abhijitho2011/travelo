import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  date,
  integer,
  boolean,
  text,
  index,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { properties } from './phase2';

/**
 * Rooms, room types and the amenity catalogue — the layer everything
 * operational sits on. Reception cannot check anybody in, housekeeping has no
 * board and occupancy has no denominator until these rows exist.
 *
 * DELIBERATELY SEPARATE FROM `features` / `plan_features`. Those are
 * SUBSCRIPTION entitlements (does this owner's plan include the Booking
 * Engine?). An amenity is a physical thing in a room or a hotel (a bathtub, a
 * pool). Merging them would let a billing change silently rewrite what a hotel
 * advertises, so they never touch.
 */

// ---------- Amenity catalogue (admin-managed) ----------

/**
 * Where an amenity can be attached. A ROOM amenity hangs off a room type (and
 * optionally off one specific room as an extra); a PROPERTY amenity hangs off
 * the hotel. The scope is what stops "Swimming pool" being offered as a
 * per-room tick box.
 */
export const amenityScopeValues = ['ROOM', 'PROPERTY'] as const;
export type AmenityScope = (typeof amenityScopeValues)[number];

export const amenityStatusValues = ['ACTIVE', 'ARCHIVED'] as const;
export type AmenityStatus = (typeof amenityStatusValues)[number];

/**
 * Archived rather than deleted, on purpose: rooms already referencing an
 * amenity keep working when the catalogue entry is retired. ARCHIVED only
 * removes it from the pickers.
 */
export const amenities = pgTable(
  'amenities',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Stable slug — the thing client code and seeds match on, never the name. */
    key: varchar('key', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 128 }).notNull(),
    scope: varchar('scope', { length: 16 }).notNull().default('ROOM').$type<AmenityScope>(),
    /** Icon NAME (e.g. "wifi"), resolved by each client to its own icon set. */
    icon: varchar('icon', { length: 64 }),
    sortOrder: integer('sort_order').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull().default('ACTIVE').$type<AmenityStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeIdx: index('amenities_scope_idx').on(t.scope),
    statusIdx: index('amenities_status_idx').on(t.status),
  }),
);

// ---------- Room types ----------

export const bedTypeValues = ['SINGLE', 'TWIN', 'DOUBLE', 'QUEEN', 'KING', 'BUNK'] as const;
export type BedType = (typeof bedTypeValues)[number];

/**
 * What one bookable unit of this type physically is. A ROOM is a single
 * hotel room; a VILLA is a standalone unit that may contain several rooms and
 * private facilities. The guest always books the WHOLE unit either way — a
 * `rooms` row is one villa, exactly as it is one room — so reservations,
 * housekeeping and occupancy need no special-casing.
 */
export const unitKindValues = ['ROOM', 'VILLA'] as const;
export type UnitKind = (typeof unitKindValues)[number];

export const roomTypeStatusValues = ['ACTIVE', 'ARCHIVED'] as const;
export type RoomTypeStatus = (typeof roomTypeStatusValues)[number];

export const roomTypes = pgTable(
  'room_types',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    unitKind: varchar('unit_kind', { length: 16 }).notNull().default('ROOM').$type<UnitKind>(),
    /**
     * Rooms inside ONE unit of this type — 1 for a normal room, 1+ for a
     * villa ("2-room private-pool villa"). NOT the number of units the hotel
     * has; that is `rooms` rows.
     */
    unitRoomCount: integer('unit_room_count').notNull().default(1),
    /**
     * A PRIVATE pool belonging to each unit. Same argument as
     * `airConditioned` below: the shared hotel pool is a PROPERTY amenity,
     * and making "private pool" a ROOM amenity would let the two contradict.
     * A boolean on the type states exactly what every unit of the type has.
     */
    privatePool: boolean('private_pool').notNull().default(false),
    bedType: varchar('bed_type', { length: 16 }).notNull().default('DOUBLE').$type<BedType>(),
    bedCount: integer('bed_count').notNull().default(1),
    maxOccupancy: integer('max_occupancy').notNull().default(2),
    maxAdults: integer('max_adults').notNull().default(2),
    maxChildren: integer('max_children').notNull().default(0),
    /**
     * Air conditioning is a PROPERTY OF THE ROOM TYPE, not an amenity.
     *
     * Modelling "AC" and "Non-AC" as two catalogue entries makes contradictory
     * data reachable — a room type could carry both, or neither, and neither
     * state means anything. A boolean has exactly two states and both are true
     * statements. See migration 0008 for the same note.
     */
    airConditioned: boolean('air_conditioned').notNull().default(false),
    /** Paise, like every other money column in this schema. */
    baseRate: integer('base_rate').notNull().default(0),
    currency: varchar('currency', { length: 8 }).notNull().default('INR'),
    sizeSqft: integer('size_sqft'),
    status: varchar('status', { length: 16 }).notNull().default('ACTIVE').$type<RoomTypeStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('room_types_property_idx').on(t.propertyId),
    // Partial: a deleted "Deluxe" frees the name for a new one, mirroring the
    // hotel_staff email rule.
    nameUnique: uniqueIndex('room_types_property_name_unique')
      .on(t.propertyId, t.name)
      .where(sql`deleted_at IS NULL`),
  }),
);

/** ROOM-scoped amenities every room of this type has. */
export const roomTypeAmenities = pgTable(
  'room_type_amenities',
  {
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'cascade' }),
    amenityId: uuid('amenity_id')
      .notNull()
      .references(() => amenities.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roomTypeId, t.amenityId] }),
    amenityIdx: index('room_type_amenities_amenity_idx').on(t.amenityId),
  }),
);

// ---------- Rooms ----------

/**
 * The housekeeping/front-office lifecycle. DIRTY → CLEANING → INSPECTED →
 * READY is the housekeeping loop; AVAILABLE/OCCUPIED is the front-office view;
 * MAINTENANCE and OUT_OF_ORDER take a room off the board entirely.
 */
export const roomStatusValues = [
  'AVAILABLE',
  'OCCUPIED',
  'DIRTY',
  'CLEANING',
  'INSPECTED',
  'READY',
  'MAINTENANCE',
  'OUT_OF_ORDER',
] as const;
export type RoomStatus = (typeof roomStatusValues)[number];

export const rooms = pgTable(
  'rooms',
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
    /** Varchar, not integer: "301", "3A" and "G-12" are all real room numbers. */
    number: varchar('number', { length: 32 }).notNull(),
    /** Varchar too — "G", "LG" and "M" are floors in plenty of hotels. */
    floor: varchar('floor', { length: 16 }),
    status: varchar('status', { length: 24 }).notNull().default('AVAILABLE').$type<RoomStatus>(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('rooms_property_idx').on(t.propertyId),
    roomTypeIdx: index('rooms_room_type_idx').on(t.roomTypeId),
    statusIdx: index('rooms_status_idx').on(t.status),
    numberUnique: uniqueIndex('rooms_property_number_unique')
      .on(t.propertyId, t.number)
      .where(sql`deleted_at IS NULL`),
  }),
);

/**
 * Per-room EXTRAS, beyond what the type already provides — "only 304 has the
 * bathtub". The effective amenity list for a room is the UNION of its type's
 * amenities and these; see `effectiveAmenities` in the rooms module, which is
 * the single implementation of that rule.
 */
export const roomAmenities = pgTable(
  'room_amenities',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    amenityId: uuid('amenity_id')
      .notNull()
      .references(() => amenities.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roomId, t.amenityId] }),
    amenityIdx: index('room_amenities_amenity_idx').on(t.amenityId),
  }),
);

/** PROPERTY-scoped amenities — what the hotel itself offers. Owner-managed. */
export const propertyAmenities = pgTable(
  'property_amenities',
  {
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    amenityId: uuid('amenity_id')
      .notNull()
      .references(() => amenities.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.propertyId, t.amenityId] }),
    amenityIdx: index('property_amenities_amenity_idx').on(t.amenityId),
  }),
);

export type Amenity = typeof amenities.$inferSelect;
export type RoomType = typeof roomTypes.$inferSelect;
export type Room = typeof rooms.$inferSelect;

/**
 * A date-ranged rate override for a room type (Phase 4). Over [start_date,
 * end_date] the type is quoted at `rate_paise` instead of its base rate. The
 * first cut of rate plans — seasonal/peak pricing without a full BAR/plan model.
 */
export const rateOverrides = pgTable(
  'rate_overrides',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 120 }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    ratePaise: integer('rate_paise').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    typeRangeIdx: index('rate_overrides_type_range_idx').on(t.roomTypeId, t.startDate, t.endDate),
  }),
);

export type RateOverride = typeof rateOverrides.$inferSelect;
