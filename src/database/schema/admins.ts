import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, boolean, index } from 'drizzle-orm/pg-core';

export const adminStatusValues = ['Active', 'Inactive', 'Blocked'] as const;
export type AdminStatus = (typeof adminStatusValues)[number];

export const admins = pgTable(
  'admins',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: varchar('email', { length: 255 }).notNull().unique(),
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
    statusIdx: index('admins_status_idx').on(t.status),
  }),
);

export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;
