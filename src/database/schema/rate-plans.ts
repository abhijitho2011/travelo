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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { properties } from './phase2';
import { roomTypes } from './rooms';

/**
 * Rate plans, taxes/fees and dynamic pricing rules — the commercial layer on
 * top of a room type.
 *
 * A room type says WHAT the unit is; a rate plan says what it COSTS and on what
 * terms. One room type sells under several plans ("Room Only", "Breakfast
 * Included", "Non-refundable"), so plans hang off the type rather than
 * replacing its `baseRate`.
 *
 * TWO INTEGER UNITS LIVE IN HERE AND THEY ARE NEVER MIXED:
 *   - MONEY is integer PAISE, like every other money column in this schema.
 *   - PERCENTAGES are integer BASIS POINTS — 1250 = 12.50%.
 * Basis points exist because 12.5% is not representable in paise and a float
 * tax rate is how rounding bugs get into invoices. Every percent computation
 * in this module stays integer arithmetic.
 */

// ---------- Rate plans ----------

export const mealPlanValues = [
  'ROOM_ONLY',
  'BREAKFAST',
  'HALF_BOARD',
  'FULL_BOARD',
  'ALL_INCLUSIVE',
] as const;
export type MealPlan = (typeof mealPlanValues)[number];

export const cancellationPolicyValues = ['FLEXIBLE', 'NON_REFUNDABLE', 'CUSTOM'] as const;
export type CancellationPolicy = (typeof cancellationPolicyValues)[number];

export const paymentPolicyValues = ['PAY_AT_PROPERTY', 'PREPAID', 'PARTIAL', 'CUSTOM'] as const;
export type PaymentPolicy = (typeof paymentPolicyValues)[number];

export const ratePlanStatusValues = ['ACTIVE', 'INACTIVE'] as const;
export type RatePlanStatus = (typeof ratePlanStatusValues)[number];

export const ratePlans = pgTable(
  'rate_plans',
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
    name: varchar('name', { length: 120 }).notNull(),
    /** Paise, per unit, per night. */
    basePricePaise: integer('base_price_paise').notNull().default(0),
    currency: varchar('currency', { length: 8 }).notNull().default('INR'),
    mealPlan: varchar('meal_plan', { length: 24 }).notNull().default('ROOM_ONLY').$type<MealPlan>(),
    cancellationPolicy: varchar('cancellation_policy', { length: 24 })
      .notNull()
      .default('FLEXIBLE')
      .$type<CancellationPolicy>(),
    /** Guest-facing text; the only place a CUSTOM policy is explained. */
    cancellationNote: text('cancellation_note'),
    paymentPolicy: varchar('payment_policy', { length: 24 })
      .notNull()
      .default('PAY_AT_PROPERTY')
      .$type<PaymentPolicy>(),
    /** Nights. NULL = no limit. */
    minStay: integer('min_stay'),
    maxStay: integer('max_stay'),
    /** Days between booking and arrival. NULL = no limit. */
    minAdvanceDays: integer('min_advance_days'),
    maxAdvanceDays: integer('max_advance_days'),
    /** Paise, per extra head, per night. */
    extraAdultPaise: integer('extra_adult_paise').notNull().default(0),
    extraChildPaise: integer('extra_child_paise').notNull().default(0),
    extraInfantPaise: integer('extra_infant_paise').notNull().default(0),
    /** INACTIVE keeps the history but stops the plan selling. */
    status: varchar('status', { length: 16 }).notNull().default('ACTIVE').$type<RatePlanStatus>(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    roomTypeIdx: index('rate_plans_room_type_idx').on(t.roomTypeId),
    // Partial, mirroring room_types: a soft-deleted plan frees its name.
    nameUnique: uniqueIndex('rate_plans_room_type_name_unique')
      .on(t.roomTypeId, t.name)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type RatePlan = typeof ratePlans.$inferSelect;

// ---------- Taxes and fees ----------

export const feeKindValues = ['TAX', 'FEE', 'SERVICE', 'CITY_TAX'] as const;
export type FeeKind = (typeof feeKindValues)[number];

export const feeCalculationValues = ['PERCENT', 'FIXED'] as const;
export type FeeCalculation = (typeof feeCalculationValues)[number];

export const feeBasisValues = ['PER_ROOM', 'PER_GUEST'] as const;
export type FeeBasis = (typeof feeBasisValues)[number];

export const feePeriodValues = ['PER_NIGHT', 'PER_STAY'] as const;
export type FeePeriod = (typeof feePeriodValues)[number];

/**
 * Taxes and fees charged on top of (or extracted from) the room rate.
 *
 * `value` IS DUAL-UNIT and `calculation` decides which:
 *   PERCENT -> BASIS POINTS (1250 = 12.5%)
 *   FIXED   -> PAISE
 * Nothing else in this table is money.
 */
export const roomTypeFees = pgTable(
  'room_type_fees',
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
    name: varchar('name', { length: 120 }).notNull(),
    kind: varchar('kind', { length: 16 }).notNull().default('TAX').$type<FeeKind>(),
    calculation: varchar('calculation', { length: 12 })
      .notNull()
      .default('PERCENT')
      .$type<FeeCalculation>(),
    /** BASIS POINTS when `calculation` is PERCENT, PAISE when FIXED. */
    value: integer('value').notNull(),
    basis: varchar('basis', { length: 12 }).notNull().default('PER_ROOM').$type<FeeBasis>(),
    period: varchar('period', { length: 12 }).notNull().default('PER_NIGHT').$type<FeePeriod>(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    roomTypeIdx: index('room_type_fees_room_type_idx').on(t.roomTypeId),
  }),
);

export type RoomTypeFee = typeof roomTypeFees.$inferSelect;

// ---------- Dynamic pricing rules ----------

export const pricingTriggerValues = [
  'OCCUPANCY',
  'DAY_OF_WEEK',
  'SEASON',
  'LENGTH_OF_STAY',
  'ADVANCE_BOOKING',
  'SPECIAL_DATE',
] as const;
export type PricingTrigger = (typeof pricingTriggerValues)[number];

export const pricingComparatorValues = ['GT', 'GTE', 'LT', 'LTE', 'EQ'] as const;
export type PricingComparator = (typeof pricingComparatorValues)[number];

export const adjustmentKindValues = ['PERCENT', 'FIXED'] as const;
export type AdjustmentKind = (typeof adjustmentKindValues)[number];

/**
 * Conditional adjustments to a room type's rate.
 *
 * `threshold` MEANS DIFFERENT THINGS per trigger, which is why it is one bare
 * integer rather than four mostly-empty columns:
 *   OCCUPANCY             -> occupancy percent (0-100)
 *   LENGTH_OF_STAY        -> nights
 *   ADVANCE_BOOKING       -> days before arrival
 *   DAY_OF_WEEK           -> ISO weekday, 1 = Monday .. 7 = Sunday
 *   SEASON / SPECIAL_DATE -> unused; the date range carries the condition
 *
 * `adjustmentValue` is BASIS POINTS for PERCENT and PAISE for FIXED, and MAY BE
 * NEGATIVE — that is a discount.
 */
export const pricingRules = pgTable(
  'pricing_rules',
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
    trigger: varchar('trigger', { length: 24 }).notNull().$type<PricingTrigger>(),
    comparator: varchar('comparator', { length: 8 })
      .notNull()
      .default('GTE')
      .$type<PricingComparator>(),
    threshold: integer('threshold'),
    /** SEASON / SPECIAL_DATE only. */
    startDate: date('start_date'),
    endDate: date('end_date'),
    adjustmentKind: varchar('adjustment_kind', { length: 12 })
      .notNull()
      .default('PERCENT')
      .$type<AdjustmentKind>(),
    adjustmentValue: integer('adjustment_value').notNull(),
    /** Optional label — 'Weekend uplift', 'Diwali'. */
    name: varchar('name', { length: 80 }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    enabled: boolean('enabled').notNull().default(true),
    /** Higher wins when two rules fire on the same night. */
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    roomTypeEnabledIdx: index('pricing_rules_room_type_enabled_idx').on(t.roomTypeId, t.enabled),
  }),
);

export type PricingRule = typeof pricingRules.$inferSelect;
