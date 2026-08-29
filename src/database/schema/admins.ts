import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';

export const adminStatusValues = ['Active', 'Inactive', 'Blocked'] as const;
export type AdminStatus = (typeof adminStatusValues)[number];

export const admins = pgTable(
  'admins',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: varchar('email', { length: 255 }).notNull().unique(),
    /** Normalised (digits-only) mobile used for OTP sign-in. */
    mobile: varchar('mobile', { length: 32 }),
    name: varchar('name', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 512 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('Active').$type<AdminStatus>(),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecret: varchar('mfa_secret', { length: 255 }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    lastLoginIp: varchar('last_login_ip', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: index('admins_email_idx').on(t.email),
    mobileIdx: index('admins_mobile_idx').on(t.mobile),
    statusIdx: index('admins_status_idx').on(t.status),
  }),
);

/**
 * One-time passcodes for super-admin mobile sign-in. Only ever populated for
 * the mobile currently allowlisted through SUPER_ADMIN_MOBILE; the OTP itself
 * is stored argon2-hashed and never logged or returned.
 */
export const adminOtps = pgTable(
  'admin_otps',
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
    mobileIdx: index('admin_otps_mobile_idx').on(t.mobile),
  }),
);

/**
 * One-time recovery codes for admin TOTP MFA.
 *
 * Ten are minted at enrolment and shown exactly once. Only the argon2id hash is
 * stored, so a database read cannot recover a usable code, and `used_at` makes
 * each one strictly single-use — a replayed code is dead on arrival.
 */
export const adminMfaRecoveryCodes = pgTable(
  'admin_mfa_recovery_codes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    codeHash: varchar('code_hash', { length: 512 }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    adminIdx: index('admin_mfa_recovery_admin_idx').on(t.adminId),
  }),
);

export type Admin = typeof admins.$inferSelect;
export type AdminMfaRecoveryCode = typeof adminMfaRecoveryCodes.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;
export type AdminOtp = typeof adminOtps.$inferSelect;
