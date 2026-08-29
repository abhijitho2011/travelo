-- Channex channel-manager integration.
--
-- Channex is the wholesaler between a hotel and the OTAs: Tavelo pushes what
-- is free and what it costs, Channex pushes back what got sold. This migration
-- adds the three things that conversation needs and nothing else — the
-- connection row itself already exists (integration_connections, phase 2), and
-- its `config` jsonb now carries, by convention:
--
--     { "channexPropertyId": "...",
--       "roomTypeMap":  { "<tavelo room_type id>": "<channex room_type id>" },
--       "ratePlanMap":  { "<tavelo room_type id>": "<channex rate_plan id>" } }
--
-- Kept as jsonb rather than promoted to columns because every provider in that
-- table needs a different shape; the typed accessors live in
-- src/modules/integrations/channex.config.ts and tolerate a malformed row
-- rather than crashing a sync run.

-- ---------------------------------------------------------------------------
-- 1. external_ref on reservations — THE idempotency key for inbound bookings.
--
-- A channel manager redelivers. It redelivers on its own retry schedule, it
-- redelivers when a booking is modified, and it redelivers the whole window
-- when a poll and a webhook race. Without a stable local record of "we already
-- took this Channex booking", every one of those creates a duplicate
-- reservation and the hotel oversells a room it never sold.
--
-- NULLABLE, because it is only ever set on OTA-sourced rows. The unique index
-- is therefore PARTIAL and scoped PER PROPERTY: two hotels on the same channel
-- account can legitimately hold different bookings, and NULLs must not collide.
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "external_ref" varchar(191);

CREATE UNIQUE INDEX IF NOT EXISTS "reservations_property_external_ref_unique"
  ON "reservations" ("property_id", "external_ref")
  WHERE "external_ref" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. channex_sync_log — one row per attempted exchange, success OR failure.
--
-- Deliberately a SUMMARY table, not a request/response archive. The outbound
-- request carries `Authorization: user-api-key <key>`, and a log table is the
-- single easiest place in a system to leak a credential into, so what lands
-- here is counts, ids and the reason — never headers and never the raw body.
CREATE TABLE IF NOT EXISTS "channex_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	-- PUSH = Tavelo -> Channex, PULL = Channex -> Tavelo.
	"direction" varchar(8) NOT NULL,
	-- AVAILABILITY | RATES | BOOKING | PROPERTY
	"entity" varchar(16) NOT NULL,
	-- SUCCESS | FAILED
	"status" varchar(8) NOT NULL,
	"request_summary" text,
	"response_summary" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "channex_sync_log" ADD CONSTRAINT "channex_sync_log_connection_id_fk"
		FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The only read this table gets: "the last N lines for this connection".
CREATE INDEX IF NOT EXISTS "channex_sync_log_connection_created_idx"
  ON "channex_sync_log" ("connection_id", "created_at");

-- ---------------------------------------------------------------------------
-- 3. channex_webhook_events — idempotency for the inbound hook.
--
-- Same pattern, and for the same reason, as `webhook_events` in billing: the
-- unique index is claimed BEFORE the booking is processed, so the fifth
-- redelivery of one event loses the insert race and becomes a no-op instead of
-- a fifth reservation. A failed event keeps its row, unprocessed, with the
-- reason on it — visible, and safely retryable by hand.
CREATE TABLE IF NOT EXISTS "channex_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(191) NOT NULL,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "channex_webhook_events_event_id_unique"
  ON "channex_webhook_events" ("event_id");

-- ---------------------------------------------------------------------------
-- 4. The `integration.sync` permission.
--
-- Triggering a sync WRITES to a live channel manager, so it is a separate
-- permission from `integration.view` rather than a free rider on it.
-- SUPER_ADMIN already holds it through its `*` grant; Operations Admin, who
-- owns integration health day to day, gets it explicitly. Idempotent so the
-- seed and this migration can both run, in either order.
INSERT INTO "permissions" ("key", "group", "description")
VALUES ('integration.sync', 'Integration', 'sync integration')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r.id, 'integration.sync' FROM "roles" r WHERE r.key = 'operations_admin'
ON CONFLICT DO NOTHING;
