import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, jsonb, index, text } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    actorId: uuid('actor_id'),
    actorEmail: varchar('actor_email', { length: 255 }),
    actorRole: varchar('actor_role', { length: 128 }),
    action: varchar('action', { length: 128 }).notNull(),
    entity: varchar('entity', { length: 128 }),
    entityId: varchar('entity_id', { length: 128 }),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 512 }),
    requestId: varchar('request_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index('audit_actor_idx').on(t.actorId),
    entityIdx: index('audit_entity_idx').on(t.entity, t.entityId),
    createdIdx: index('audit_created_idx').on(t.createdAt),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
