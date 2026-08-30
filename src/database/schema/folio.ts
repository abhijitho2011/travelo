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
 * The guest folio — the running bill for a stay.
 *
 * A reservation is already the folio HEADER: it carries the room total
 * (`total_paise`, snapshotted per the rate) and a denormalised `paid_paise`
 * cache. These two child tables make the rest of the bill real, so a guest can
 * no longer eat and spa on ROOM_CHARGE and walk out having paid only for the
 * room.
 *
 * The authoritative stay balance is:
 *   (reservation.total_paise + Σ folio_line_items.amount_paise)
 *   − (Σ payments where PAYMENT − Σ payments where REFUND)
 *
 * ROOM CHARGES ARE NOT DUPLICATED HERE. The room total lives on the reservation
 * (the per-night itemisation is the night-audit's job, later). `folio_line_items`
 * holds only the ANCILLARY charges — restaurant, spa, and manual adjustments —
 * that were previously stranded on their own order/bill records.
 */

export const folioLineKindValues = ['RESTAURANT', 'SPA', 'MISC', 'ADJUSTMENT'] as const;
export type FolioLineKind = (typeof folioLineKindValues)[number];

export const folioLineItems = pgTable(
  'folio_line_items',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 16 }).notNull().$type<FolioLineKind>(),
    /** Human line, e.g. "Restaurant ORD-00012" or "Spa — Deep Tissue". */
    description: varchar('description', { length: 200 }).notNull(),
    /** Paise. Positive = charged to the guest; negative = a credit/adjustment. */
    amountPaise: integer('amount_paise').notNull(),
    /**
     * GST on this line, in paise. Future step: folio posting does not yet
     * compute per-line GST — the column is available now with a 0 default.
     */
    taxPaise: integer('tax_paise').notNull().default(0),
    /** SAC/HSN code for the line, when folio GST is wired up. */
    hsnCode: varchar('hsn_code', { length: 16 }),
    /**
     * What produced this line — `restaurant_order` / `spa_bill` / `manual`.
     * With `source_id` it is the idempotency key for posting: a restaurant order
     * settled on ROOM_CHARGE posts to the folio exactly once, however many times
     * settle is retried.
     */
    sourceType: varchar('source_type', { length: 32 }),
    sourceId: uuid('source_id'),
    postedBy: uuid('posted_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reservationIdx: index('folio_line_items_reservation_idx').on(t.reservationId),
    propertyIdx: index('folio_line_items_property_idx').on(t.propertyId),
    // Idempotent posting: at most one folio line per source record.
    sourceUnique: uniqueIndex('folio_line_items_source_unique')
      .on(t.sourceType, t.sourceId)
      .where(sql`source_id IS NOT NULL`),
  }),
);

export const folioPaymentDirectionValues = ['PAYMENT', 'REFUND'] as const;
export type FolioPaymentDirection = (typeof folioPaymentDirectionValues)[number];

export const folioPaymentMethodValues = ['CASH', 'CARD', 'UPI', 'BANK', 'ONLINE'] as const;
export type FolioPaymentMethod = (typeof folioPaymentMethodValues)[number];

export const folioPayments = pgTable(
  'folio_payments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** PAYMENT collects from the guest; REFUND returns money to them. */
    direction: varchar('direction', { length: 8 })
      .notNull()
      .default('PAYMENT')
      .$type<FolioPaymentDirection>(),
    method: varchar('method', { length: 16 }).notNull().$type<FolioPaymentMethod>(),
    /** Paise, ALWAYS positive. `direction` carries the sign. */
    amountPaise: integer('amount_paise').notNull(),
    /** Gateway/txn reference or receipt number, free text. */
    reference: varchar('reference', { length: 120 }),
    note: text('note'),
    collectedBy: uuid('collected_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Optional client-supplied key. A tablet double-tap on a flaky connection
     * must not take the guest's money twice — a repeat with the same key is a
     * no-op that returns the first row. Unique PER RESERVATION.
     */
    idempotencyKey: varchar('idempotency_key', { length: 80 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reservationIdx: index('folio_payments_reservation_idx').on(t.reservationId),
    propertyIdx: index('folio_payments_property_idx').on(t.propertyId),
    idemUnique: uniqueIndex('folio_payments_idempotency_unique')
      .on(t.reservationId, t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
  }),
);

export type FolioLineItem = typeof folioLineItems.$inferSelect;
export type FolioPayment = typeof folioPayments.$inferSelect;
