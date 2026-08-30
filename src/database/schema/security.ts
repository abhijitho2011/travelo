import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, text, index } from 'drizzle-orm/pg-core';
import { properties } from './phase2';
import { hotelStaff } from './owner';

/**
 * Security — the guard's ledger and the manager's oversight.
 *
 * The security STAFF app already ships gate, visitor, incident and lost-&-found
 * screens; until now they had no backend and degraded to empty. This layer
 * gives them real, PROPERTY-SCOPED tables, and adds the manager's roster
 * (`security_shifts`) and read/assign/resolve oversight on top.
 *
 * NOTHING here touches money. The security surface cannot reach a folio, a rate
 * or revenue — the role→permission invariants forbid it and there is simply no
 * column here that could.
 */

// ---------- Gate movements (the gate log) ----------

/**
 * The gate feed the staff "Gate" screen writes. It covers BOTH vehicles and
 * people through one ledger, exactly as the existing app records them — the
 * `vehicle log` and `staff movement` screens are the same feed filtered by kind.
 */
export const gateMovementValues = ['VEHICLE_IN', 'VEHICLE_OUT', 'STAFF_IN', 'STAFF_OUT'] as const;
export type GateMovementKind = (typeof gateMovementValues)[number];

export const gateMovements = pgTable(
  'gate_movements',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    movement: varchar('movement', { length: 16 }).notNull().$type<GateMovementKind>(),
    /** Registration number, or the staff member's name / employee id. */
    subject: varchar('subject', { length: 200 }).notNull(),
    detail: text('detail'),
    recordedBy: uuid('recorded_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('gate_movements_property_idx').on(t.propertyId),
    createdIdx: index('gate_movements_created_idx').on(t.createdAt),
  }),
);

// ---------- Visitor logs ----------

export const visitorLogs = pgTable(
  'visitor_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    /** Who or what they are here to see — a room, a person, a department. */
    visiting: varchar('visiting', { length: 200 }),
    purpose: varchar('purpose', { length: 200 }),
    passNumber: varchar('pass_number', { length: 64 }),
    recordedBy: uuid('recorded_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }).notNull().defaultNow(),
    departedAt: timestamp('departed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('visitor_logs_property_idx').on(t.propertyId),
    // Fast "who is on site" lookup: on-site rows have departed_at IS NULL.
    onSiteIdx: index('visitor_logs_on_site_idx')
      .on(t.propertyId)
      .where(sql`departed_at IS NULL`),
  }),
);

// ---------- Incidents ----------

export const incidentSeverityValues = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type IncidentSeverity = (typeof incidentSeverityValues)[number];

/**
 * OPEN     — reported, unassigned.
 * ASSIGNED — a guard/manager is on it.
 * RESOLVED — closed with a resolution.
 */
export const incidentStatusValues = ['OPEN', 'ASSIGNED', 'RESOLVED'] as const;
export type IncidentStatus = (typeof incidentStatusValues)[number];

export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    severity: varchar('severity', { length: 16 })
      .notNull()
      .default('MEDIUM')
      .$type<IncidentSeverity>(),
    status: varchar('status', { length: 16 }).notNull().default('OPEN').$type<IncidentStatus>(),
    location: varchar('location', { length: 200 }),
    reportedBy: uuid('reported_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    assignedTo: uuid('assigned_to').references(() => hotelStaff.id, { onDelete: 'set null' }),
    resolution: text('resolution'),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('incidents_property_idx').on(t.propertyId),
    statusIdx: index('incidents_status_idx').on(t.status),
  }),
);

// ---------- Lost & found ----------

export const lostFoundStatusValues = ['STORED', 'CLAIMED', 'DISPOSED'] as const;
export type LostFoundStatus = (typeof lostFoundStatusValues)[number];

export const lostFoundItems = pgTable(
  'lost_found_items',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    location: varchar('location', { length: 200 }),
    status: varchar('status', { length: 16 }).notNull().default('STORED').$type<LostFoundStatus>(),
    recordedBy: uuid('recorded_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    foundAt: timestamp('found_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('lost_found_items_property_idx').on(t.propertyId),
  }),
);

// ---------- Security shifts (manager roster) ----------

export const securityShiftStatusValues = ['SCHEDULED', 'ACTIVE', 'ENDED'] as const;
export type SecurityShiftStatus = (typeof securityShiftStatusValues)[number];

export const securityShifts = pgTable(
  'security_shifts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => hotelStaff.id, { onDelete: 'cascade' }),
    /** The post — "Main Gate", "Lobby", "Parking". */
    area: varchar('area', { length: 120 }).notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('SCHEDULED')
      .$type<SecurityShiftStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('security_shifts_property_idx').on(t.propertyId),
    staffIdx: index('security_shifts_staff_idx').on(t.staffId),
    statusIdx: index('security_shifts_status_idx').on(t.status),
  }),
);

// ---------- Row types ----------

export type GateMovement = typeof gateMovements.$inferSelect;
export type VisitorLog = typeof visitorLogs.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type LostFoundItem = typeof lostFoundItems.$inferSelect;
export type SecurityShift = typeof securityShifts.$inferSelect;
