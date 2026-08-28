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
import { owners, properties } from './phase2';

// ---------- Owner OTPs ----------
export const ownerOtps = pgTable(
  'owner_otps',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    mobile: varchar('mobile', { length: 32 }).notNull(),
    otpHash: varchar('otp_hash', { length: 512 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    mobileIdx: index('owner_otps_mobile_idx').on(t.mobile),
  }),
);

// ---------- Owner Sessions ----------
export const ownerSessions = pgTable(
  'owner_sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'cascade' }),
    refreshTokenHash: varchar('refresh_token_hash', { length: 512 }).notNull(),
    userAgent: varchar('user_agent', { length: 512 }),
    ip: varchar('ip', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('owner_sessions_owner_idx').on(t.ownerId),
  }),
);

// ---------- Hotel Staff ----------
export const hotelStaffRoleValues = ['GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER'] as const;
export type HotelStaffRole = (typeof hotelStaffRoleValues)[number];

export const hotelStaffStatusValues = ['ACTIVE', 'BLOCKED'] as const;
export type HotelStaffStatus = (typeof hotelStaffStatusValues)[number];

export const hotelStaff = pgTable(
  'hotel_staff',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 32 }).notNull().$type<HotelStaffRole>(),
    firstName: varchar('first_name', { length: 128 }).notNull(),
    lastName: varchar('last_name', { length: 128 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    mobile: varchar('mobile', { length: 32 }).notNull(),
    address: text('address'),
    pinCode: varchar('pin_code', { length: 16 }),
    state: varchar('state', { length: 128 }),
    district: varchar('district', { length: 128 }),
    status: varchar('status', { length: 16 }).notNull().default('ACTIVE').$type<HotelStaffStatus>(),
    createdBy: uuid('created_by').references(() => owners.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('hotel_staff_property_idx').on(t.propertyId),
    ownerIdx: index('hotel_staff_owner_idx').on(t.ownerId),
    emailUnique: uniqueIndex('hotel_staff_property_email_unique')
      .on(t.propertyId, t.email)
      .where(sql`deleted_at IS NULL`),
  }),
);

// ---------- Location reference data (admin-managed) ----------
export const locationStates = pgTable('location_states', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 128 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const locationDistricts = pgTable(
  'location_districts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    stateId: uuid('state_id')
      .notNull()
      .references(() => locationStates.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stateIdx: index('location_districts_state_idx').on(t.stateId),
    uniq: uniqueIndex('location_districts_state_name_unique').on(t.stateId, t.name),
  }),
);

export type OwnerOtp = typeof ownerOtps.$inferSelect;
export type OwnerSession = typeof ownerSessions.$inferSelect;
export type HotelStaff = typeof hotelStaff.$inferSelect;
export type LocationState = typeof locationStates.$inferSelect;
export type LocationDistrict = typeof locationDistricts.$inferSelect;
