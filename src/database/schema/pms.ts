import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { properties } from './phase2';
import { ratePlans } from './rate-plans';
import { roomTypes } from './rooms';
import { reservations } from './reservations';

/*
 * PMS foundation (migrations 0034 + 0035): property configuration, the folio
 * log, and the per-day rates & inventory table. See each migration for the
 * reasoning behind the shapes; the comments here are about how the code uses
 * them.
 */

// ------------------------------------------------------------ settings ----

export const checkinModelValues = ['SINGLE', 'THREE_SLOT', 'HOURLY'] as const;
export type CheckinModel = (typeof checkinModelValues)[number];

/** A check-in window for THREE_SLOT / HOURLY properties. */
export interface CheckinSlot {
  label: string;
  /** Local HH:MM. */
  start: string;
  end: string;
  /** Basis-point multiplier on the nightly rate; 10000 = full rate. */
  rateBp?: number;
}

/** Which events notify whom, by channel. Absent key = channel default. */
export type NotificationPrefs = Record<
  string,
  { email?: boolean; sms?: boolean; whatsapp?: boolean; push?: boolean }
>;

/**
 * One row per property. Read on nearly every folio, booking-engine and
 * calendar request, so it is keyed on property_id and never joined.
 */
export const propertySettings = pgTable('property_settings', {
  propertyId: uuid('property_id')
    .primaryKey()
    .references(() => properties.id, { onDelete: 'cascade' }),
  gstin: varchar('gstin', { length: 15 }),
  gstStateCode: varchar('gst_state_code', { length: 2 }),
  pricesIncludeTax: boolean('prices_include_tax').notNull().default(false),
  invoicePrefix: varchar('invoice_prefix', { length: 12 }).notNull().default('INV'),
  invoiceNextNumber: integer('invoice_next_number').notNull().default(1),
  invoiceFooter: text('invoice_footer'),
  invoiceShowGstin: boolean('invoice_show_gstin').notNull().default(true),
  invoiceShowHsn: boolean('invoice_show_hsn').notNull().default(true),
  invoiceShowBreakup: boolean('invoice_show_breakup').notNull().default(true),
  checkinModel: varchar('checkin_model', { length: 12 })
    .notNull()
    .default('SINGLE')
    .$type<CheckinModel>(),
  checkinTime: varchar('checkin_time', { length: 5 }).notNull().default('14:00'),
  checkoutTime: varchar('checkout_time', { length: 5 }).notNull().default('11:00'),
  slots: jsonb('slots').$type<CheckinSlot[]>(),
  holdExpiryMinutes: integer('hold_expiry_minutes'),
  bookingEngineEnabled: boolean('booking_engine_enabled').notNull().default(false),
  bookingEngineSlug: varchar('booking_engine_slug', { length: 80 }),
  brandColor: varchar('brand_color', { length: 9 }),
  brandLogoKey: varchar('brand_logo_key', { length: 512 }),
  bookingTerms: text('booking_terms'),
  guestNotifications: jsonb('guest_notifications').notNull().default({}).$type<NotificationPrefs>(),
  hotelierNotifications: jsonb('hotelier_notifications')
    .notNull()
    .default({})
    .$type<NotificationPrefs>(),
  currency: varchar('currency', { length: 8 }).notNull().default('INR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --------------------------------------------------------------- taxes ----

export const taxCalculationValues = ['PERCENT', 'FIXED'] as const;
export const taxBasisValues = ['PER_NIGHT', 'PER_STAY', 'PER_GUEST'] as const;
export const taxAppliesToValues = ['ROOM', 'RESTAURANT', 'SPA', 'ADDON', 'ALL'] as const;

/**
 * Hotel-defined taxes and fees on top of statutory GST (which lives in
 * billing/gst.ts because it is law, not configuration).
 */
export const propertyTaxes = pgTable(
  'property_taxes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    calculation: varchar('calculation', { length: 8 })
      .notNull()
      .default('PERCENT')
      .$type<(typeof taxCalculationValues)[number]>(),
    /** Basis points for PERCENT; paise for FIXED. */
    value: integer('value').notNull(),
    basis: varchar('basis', { length: 12 })
      .notNull()
      .default('PER_STAY')
      .$type<(typeof taxBasisValues)[number]>(),
    appliesTo: varchar('applies_to', { length: 12 })
      .notNull()
      .default('ROOM')
      .$type<(typeof taxAppliesToValues)[number]>(),
    hsnCode: varchar('hsn_code', { length: 16 }),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({ propertyIdx: index('property_taxes_property_idx').on(t.propertyId) }),
);

// ------------------------------------------------------------ policies ----

export const policyKindValues = ['CANCELLATION', 'NO_SHOW', 'EARLY_CHECKOUT', 'DEPOSIT'] as const;
export const policyChargeKindValues = ['NONE', 'FIRST_NIGHT', 'PERCENT', 'FIXED'] as const;

export const propertyPolicies = pgTable(
  'property_policies',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 16 }).notNull().$type<(typeof policyKindValues)[number]>(),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description'),
    hoursBefore: integer('hours_before'),
    chargeKind: varchar('charge_kind', { length: 12 })
      .notNull()
      .default('NONE')
      .$type<(typeof policyChargeKindValues)[number]>(),
    /** Basis points for PERCENT; paise for FIXED. */
    value: integer('value').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyKindIdx: index('property_policies_property_kind_idx').on(t.propertyId, t.kind),
  }),
);

// -------------------------------------------------------------- add-ons ----

export const addonUnitValues = ['PER_STAY', 'PER_NIGHT', 'PER_GUEST', 'PER_GUEST_NIGHT'] as const;

export const addonServices = pgTable(
  'addon_services',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    pricePaise: integer('price_paise').notNull(),
    unit: varchar('unit', { length: 16 })
      .notNull()
      .default('PER_STAY')
      .$type<(typeof addonUnitValues)[number]>(),
    taxCategory: varchar('tax_category', { length: 16 }).notNull().default('other'),
    hsnCode: varchar('hsn_code', { length: 16 }),
    sellOnline: boolean('sell_online').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({ propertyIdx: index('addon_services_property_idx').on(t.propertyId) }),
);

// ------------------------------------------------------ booking sources ----

export const bookingSources = pgTable(
  'booking_sources',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    /** The coarse reservations.source channel this rolls up to. */
    channel: varchar('channel', { length: 16 }).notNull().default('OTHER'),
    commissionBp: integer('commission_bp').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({ propertyIdx: index('booking_sources_property_idx').on(t.propertyId) }),
);

// ---------------------------------------------------------- folio events ----

export const folioEvents = pgTable(
  'folio_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').notNull(),
    type: varchar('type', { length: 40 }).notNull(),
    actorStaffId: uuid('actor_staff_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reservationIdx: index('folio_events_reservation_idx').on(t.reservationId, t.createdAt),
  }),
);

// ------------------------------------------------- rate & inventory days ----

/** Per-channel delta for one day, keyed by integration_connection id. */
export interface ChannelDayOverride {
  priceDeltaBp?: number;
  available?: number;
}

/**
 * The day is the unit. NULL price/available mean "not set" and the resolver
 * falls through to rate_overrides, then the room type's base rate / physical
 * count. See 0035 for why this is not rate_overrides.
 */
export const rateInventoryDays = pgTable(
  'rate_inventory_days',
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
    ratePlanId: uuid('rate_plan_id').references(() => ratePlans.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    pricePaise: integer('price_paise'),
    available: integer('available'),
    minLos: integer('min_los'),
    maxLos: integer('max_los'),
    stopSell: boolean('stop_sell').notNull().default(false),
    closedToArrival: boolean('closed_to_arrival').notNull().default(false),
    closedToDeparture: boolean('closed_to_departure').notNull().default(false),
    channelOverrides: jsonb('channel_overrides')
      .notNull()
      .default({})
      .$type<Record<string, ChannelDayOverride>>(),
    pricingRuleId: uuid('pricing_rule_id'),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typePlanDateUnique: uniqueIndex('rate_inventory_days_type_plan_date_unique')
      .on(t.roomTypeId, t.ratePlanId, t.date)
      .where(sql`rate_plan_id is not null`),
    typeBaseDateUnique: uniqueIndex('rate_inventory_days_type_base_date_unique')
      .on(t.roomTypeId, t.date)
      .where(sql`rate_plan_id is null`),
    propertyDateIdx: index('rate_inventory_days_property_date_idx').on(t.propertyId, t.date),
  }),
);

export const rateChangeFieldValues = [
  'price',
  'available',
  'min_los',
  'max_los',
  'stop_sell',
  'cta',
  'ctd',
  'channel',
] as const;
export const rateChangeActorValues = ['STAFF', 'RULE', 'CHANNEL', 'IMPORT'] as const;

export const rateChangeLog = pgTable(
  'rate_change_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    roomTypeId: uuid('room_type_id').notNull(),
    ratePlanId: uuid('rate_plan_id'),
    date: date('date').notNull(),
    field: varchar('field', { length: 16 })
      .notNull()
      .$type<(typeof rateChangeFieldValues)[number]>(),
    before: jsonb('before'),
    after: jsonb('after'),
    actorKind: varchar('actor_kind', { length: 8 })
      .notNull()
      .default('STAFF')
      .$type<(typeof rateChangeActorValues)[number]>(),
    actorStaffId: uuid('actor_staff_id'),
    pricingRuleId: uuid('pricing_rule_id'),
    batchId: uuid('batch_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyCreatedIdx: index('rate_change_log_property_created_idx').on(t.propertyId, t.createdAt),
    typeDateIdx: index('rate_change_log_type_date_idx').on(t.roomTypeId, t.date),
  }),
);

export type PropertySettings = typeof propertySettings.$inferSelect;
export type PropertyTax = typeof propertyTaxes.$inferSelect;
export type PropertyPolicy = typeof propertyPolicies.$inferSelect;
export type AddonService = typeof addonServices.$inferSelect;
export type BookingSource = typeof bookingSources.$inferSelect;
export type FolioEvent = typeof folioEvents.$inferSelect;
export type RateInventoryDay = typeof rateInventoryDays.$inferSelect;
export type RateChange = typeof rateChangeLog.$inferSelect;
