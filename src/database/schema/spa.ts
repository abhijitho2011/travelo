import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { properties } from './phase2';
import { hotelStaff } from './owner';
import { reservations } from './reservations';

/**
 * Spa / Wellness — the outlet that turns a service and a therapist into a bill.
 *
 * PROPERTY-SCOPED exactly like rooms, reservations and the restaurant: a
 * service, an appointment, a bill is only ever resolved by
 * (id, propertyId = the caller's own). Cross-property reads 404.
 *
 * MONEY IS PAISE, integer, like every other money column in this schema. No
 * floats touch a rupee.
 *
 * THE CORRECTNESS RULE, borrowed from the restaurant: a bill must never
 * re-derive from the live service catalogue. A price rises, a service is
 * renamed or retired, and none of that may rewrite an appointment already
 * taken. So `spa_appointments` SNAPSHOTS the service's name and price at
 * booking time (`service_name_snapshot`, `price_paise_snapshot`) and the bill
 * is computed from that snapshot, never from `spa_services`.
 */

// ---------- Services ----------

/**
 * ACTIVE   — bookable.
 * ARCHIVED — retired; kept only so old appointments still resolve a name.
 */
export const spaServiceStatusValues = ['ACTIVE', 'ARCHIVED'] as const;
export type SpaServiceStatus = (typeof spaServiceStatusValues)[number];

export const spaServices = pgTable(
  'spa_services',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    /** How long the treatment runs, in minutes. */
    durationMinutes: integer('duration_minutes').notNull().default(60),
    /** Paise, integer. The LIVE price; each appointment snapshots its own copy. */
    pricePaise: integer('price_paise').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull().default('ACTIVE').$type<SpaServiceStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('spa_services_property_idx').on(t.propertyId),
    nameUnique: uniqueIndex('spa_services_property_name_unique')
      .on(t.propertyId, t.name)
      .where(sql`deleted_at IS NULL`),
  }),
);

// ---------- Appointments ----------

/**
 * BOOKED      — on the calendar, not yet begun.
 * IN_PROGRESS — the therapist has started the treatment.
 * COMPLETED   — treatment finished; billable.
 * CANCELLED   — called off before/while booked.
 * NO_SHOW     — the guest never arrived.
 */
export const spaAppointmentStatusValues = [
  'BOOKED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type SpaAppointmentStatus = (typeof spaAppointmentStatusValues)[number];

export const spaAppointments = pgTable(
  'spa_appointments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** Free-text guest name — a spa guest need not be a hotel guest. */
    guestName: varchar('guest_name', { length: 160 }).notNull(),
    /** NULL = walk-in. Otherwise the in-house reservation this ties to. */
    reservationId: uuid('reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    serviceId: uuid('service_id').references(() => spaServices.id, { onDelete: 'set null' }),
    /** The assigned therapist. NULL until a manager assigns one. */
    staffId: uuid('staff_id').references(() => hotelStaff.id, { onDelete: 'set null' }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('BOOKED')
      .$type<SpaAppointmentStatus>(),
    /**
     * The correctness core. Name and price SNAPSHOTTED from the service at
     * booking time; the bill is computed from these, never from the live
     * `spa_services` row which may be repriced, renamed or archived afterwards.
     */
    serviceNameSnapshot: varchar('service_name_snapshot', { length: 160 }).notNull(),
    pricePaiseSnapshot: integer('price_paise_snapshot').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('spa_appointments_property_idx').on(t.propertyId),
    staffIdx: index('spa_appointments_staff_idx').on(t.staffId),
    statusIdx: index('spa_appointments_status_idx').on(t.status),
    startIdx: index('spa_appointments_start_idx').on(t.startAt),
  }),
);

// ---------- Bills ----------

/**
 * UNPAID   — billed, not yet settled.
 * PAID     — settled with a payment method.
 * REFUNDED — a record-only reversal after payment.
 */
export const spaBillStatusValues = ['UNPAID', 'PAID', 'REFUNDED'] as const;
export type SpaBillStatus = (typeof spaBillStatusValues)[number];

export const spaPaymentMethodValues = ['CASH', 'CARD', 'UPI', 'ROOM_CHARGE'] as const;
export type SpaPaymentMethod = (typeof spaPaymentMethodValues)[number];

export const spaBills = pgTable(
  'spa_bills',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => spaAppointments.id, { onDelete: 'cascade' }),
    /** All paise, frozen from the appointment's price snapshot. */
    subtotalPaise: integer('subtotal_paise').notNull().default(0),
    taxPaise: integer('tax_paise').notNull().default(0),
    totalPaise: integer('total_paise').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull().default('UNPAID').$type<SpaBillStatus>(),
    paymentMethod: varchar('payment_method', { length: 16 }).$type<SpaPaymentMethod>(),
    /**
     * Set only when payment_method = ROOM_CHARGE, and only after validating the
     * reservation is CHECKED_IN at THIS property — the same rule the restaurant
     * enforces. Folio posting is deferred; the charge lands on this bill record.
     */
    reservationId: uuid('reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    settledBy: uuid('settled_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    refundReason: text('refund_reason'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('spa_bills_property_idx').on(t.propertyId),
    statusIdx: index('spa_bills_status_idx').on(t.status),
    // One bill per appointment. The service checks in-tx; this is the belt.
    appointmentUnique: uniqueIndex('spa_bills_appointment_unique').on(t.appointmentId),
  }),
);

// ---------- Row types ----------

export type SpaService = typeof spaServices.$inferSelect;
export type SpaAppointment = typeof spaAppointments.$inferSelect;
export type SpaBill = typeof spaBills.$inferSelect;
