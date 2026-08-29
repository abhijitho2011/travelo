import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { integrationConnections } from '../../database/schema';

/**
 * Channex-specific tables.
 *
 * They live in the integrations module rather than in `src/database/schema`
 * because nothing outside this adapter has any business reading them: a sync
 * log line and a webhook receipt are internal to the channel-manager
 * conversation. `integration_connections` stays the shared, cross-module row.
 */

export const channexDirectionValues = ['PUSH', 'PULL'] as const;
export type ChannexDirection = (typeof channexDirectionValues)[number];

export const channexEntityValues = ['AVAILABILITY', 'RATES', 'BOOKING', 'PROPERTY'] as const;
export type ChannexEntity = (typeof channexEntityValues)[number];

export const channexSyncStatusValues = ['SUCCESS', 'FAILED'] as const;
export type ChannexSyncStatus = (typeof channexSyncStatusValues)[number];

/**
 * One row per attempted exchange, success or failure. The summaries are
 * SUMMARIES on purpose — counts and ids, never headers and never the request
 * body verbatim, because the Authorization header carries the API key and a
 * log table is the easiest place in a system to leak one.
 */
export const channexSyncLog = pgTable(
  'channex_sync_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    direction: varchar('direction', { length: 8 }).notNull().$type<ChannexDirection>(),
    entity: varchar('entity', { length: 16 }).notNull().$type<ChannexEntity>(),
    status: varchar('status', { length: 8 }).notNull().$type<ChannexSyncStatus>(),
    requestSummary: text('request_summary'),
    responseSummary: text('response_summary'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    connectionCreatedIdx: index('channex_sync_log_connection_created_idx').on(
      t.connectionId,
      t.createdAt,
    ),
  }),
);

/**
 * Webhook idempotency, mirroring `webhook_events` in billing: the unique index
 * on `event_id` is what makes Channex's fifth redelivery a no-op rather than a
 * fifth reservation.
 */
export const channexWebhookEvents = pgTable(
  'channex_webhook_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    eventId: varchar('event_id', { length: 191 }).notNull(),
    payload: jsonb('payload'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({
    uniq: uniqueIndex('channex_webhook_events_event_id_unique').on(t.eventId),
  }),
);

/**
 * A NARROW VIEW of `reservations`, declared here rather than imported.
 *
 * `external_ref` is added by migration 0013 for exactly one purpose — deduping
 * an OTA booking on its Channex id — and the reservations module has no use
 * for it. Declaring the three columns this adapter touches keeps the shared
 * schema file (and the booking engine that owns it) untouched, while still
 * resolving to the same physical table.
 */
export const reservationExternalRefs = pgTable('reservations', {
  id: uuid('id').primaryKey(),
  propertyId: uuid('property_id').notNull(),
  /** The Channex booking id. NULL for every reservation Tavelo created itself. */
  externalRef: varchar('external_ref', { length: 191 }),
});

export type ChannexSyncLogRow = typeof channexSyncLog.$inferSelect;
export type ChannexWebhookEventRow = typeof channexWebhookEvents.$inferSelect;
