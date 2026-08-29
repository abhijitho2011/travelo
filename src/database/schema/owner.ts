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
/**
 * Every operational role the unified staff app can sign in as. Owners may only
 * create the two management roles (see `ownerCreatableStaffRoleValues`); the
 * rest are created later by a GM/HR inside the property.
 */
export const hotelStaffRoleValues = [
  'GENERAL_MANAGER',
  'ASSISTANT_GENERAL_MANAGER',
  'ACCOUNTS',
  'RECEPTIONIST',
  'SALES_MANAGER',
  'TRAVEL_DESK',
  'HOUSEKEEPING_SUPERVISOR',
  'ROOM_ATTENDANT',
  'CLEANING_STAFF',
  'TECHNICIAN',
  'SPA_MANAGER',
  'SPA_ACCOUNTS',
  'SPA_STAFF',
  'RESTAURANT_MANAGER',
  'CASHIER',
  'WAITER',
  'CHEF',
  'CLEANER',
  'INVENTORY_STORE_MANAGER',
  'SECURITY_MANAGER',
  'SECURITY_STAFF',
  'DRIVER',
  'EVENT_MANAGER',
] as const;
export type HotelStaffRole = (typeof hotelStaffRoleValues)[number];

/**
 * The owner app creates hotel management only. Widening
 * `hotelStaffRoleValues` must NOT widen what an owner can create, so the owner
 * DTO validates against this narrower tuple.
 */
export const ownerCreatableStaffRoleValues = [
  'GENERAL_MANAGER',
  'ASSISTANT_GENERAL_MANAGER',
] as const;

export const hotelStaffStatusValues = [
  'INVITED',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'BLOCKED',
  'SUSPENDED',
  'DEACTIVATED',
] as const;
export type HotelStaffStatus = (typeof hotelStaffStatusValues)[number];

/** Statuses an owner may set from the owner app — unchanged by the widening. */
export const ownerAssignableStaffStatusValues = ['ACTIVE', 'BLOCKED'] as const;

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
    status: varchar('status', { length: 32 }).notNull().default('ACTIVE').$type<HotelStaffStatus>(),
    department: varchar('department', { length: 64 }),
    employeeId: varchar('employee_id', { length: 64 }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => owners.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('hotel_staff_property_idx').on(t.propertyId),
    ownerIdx: index('hotel_staff_owner_idx').on(t.ownerId),
    // Staff sign in by mobile — this index backs every OTP lookup.
    mobileIdx: index('hotel_staff_mobile_idx').on(t.mobile),
    emailUnique: uniqueIndex('hotel_staff_property_email_unique')
      .on(t.propertyId, t.email)
      .where(sql`deleted_at IS NULL`),
  }),
);

// ---------- Staff Sessions ----------
/**
 * Refresh-token sessions for the unified staff mobile app. A deliberate mirror
 * of `owner_sessions`: the staff token family is a THIRD, fully isolated one
 * (own secrets, own issuer/audience, own session table) so a staff refresh
 * token can never be rotated by the owner or admin surfaces.
 */
export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => hotelStaff.id, { onDelete: 'cascade' }),
    refreshTokenHash: varchar('refresh_token_hash', { length: 512 }).notNull(),
    userAgent: varchar('user_agent', { length: 512 }),
    ip: varchar('ip', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffIdx: index('staff_sessions_staff_idx').on(t.staffId),
  }),
);

// ---------- Staff OTPs ----------
/**
 * Separate from `owner_otps` on purpose: a person can be both an owner and a
 * staff member on the same mobile, and a code minted for one surface must not
 * be redeemable on the other.
 */
export const staffOtps = pgTable(
  'staff_otps',
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
    mobileIdx: index('staff_otps_mobile_idx').on(t.mobile),
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
export type StaffOtp = typeof staffOtps.$inferSelect;
export type StaffSession = typeof staffSessions.$inferSelect;
export type HotelStaff = typeof hotelStaff.$inferSelect;
export type LocationState = typeof locationStates.$inferSelect;
export type LocationDistrict = typeof locationDistricts.$inferSelect;
