-- Housekeeping and maintenance — the operational loop under a hotel's rooms.
--
-- Two tables, two independent state machines, both strictly per property:
--   - housekeeping_tasks — a unit of cleaning (a room turnover, a stayover
--     service, a deep clean, or a non-room area clean).
--   - work_orders        — a maintenance job, which may take a room off the
--     board while it is worked.
--
-- The reservations check-out path auto-creates a CHECKOUT_CLEAN task the moment
-- a room flips DIRTY, so the housekeeping board is never out of step with the
-- rooms that actually need turning over. See HousekeepingService.

-- ---------------------------------------------------------------------------
-- 1. housekeeping_tasks
--
-- Either a ROOM task (room_id set) or an AREA task (area set) — never both,
-- never neither. The CHECK makes the contradictory rows unreachable rather
-- than trusting every writer to remember the rule.
CREATE TABLE IF NOT EXISTS "housekeeping_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_id" uuid,
	"area" varchar(128),
	-- CHECKOUT_CLEAN | STAYOVER | DEEP_CLEAN | AREA_CLEAN | CUSTOM
	"type" varchar(24) NOT NULL,
	-- PENDING | IN_PROGRESS | COMPLETED | INSPECTED | REJECTED
	"status" varchar(16) NOT NULL DEFAULT 'PENDING',
	-- LOW | NORMAL | HIGH
	"priority" varchar(8) NOT NULL DEFAULT 'NORMAL',
	"guest_request" text,
	"notes" text,
	"assigned_staff_id" uuid,
	"due_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"inspected_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "housekeeping_tasks_location_check" CHECK (
		("room_id" IS NOT NULL AND "area" IS NULL)
		OR ("room_id" IS NULL AND "area" IS NOT NULL)
	)
);

DO $$ BEGIN
	ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_property_id_fk"
		FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_room_id_fk"
		FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_assigned_staff_id_fk"
		FOREIGN KEY ("assigned_staff_id") REFERENCES "hotel_staff"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_created_by_fk"
		FOREIGN KEY ("created_by") REFERENCES "hotel_staff"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "housekeeping_tasks_property_status_idx"
  ON "housekeeping_tasks" ("property_id", "status");

CREATE INDEX IF NOT EXISTS "housekeeping_tasks_assignee_status_idx"
  ON "housekeeping_tasks" ("assigned_staff_id", "status");

-- ---------------------------------------------------------------------------
-- 2. work_orders
--
-- work_order_number is `WO-XXXXX`, sequential PER PROPERTY — the unique index
-- is partial (deleted_at IS NULL) so a removed order frees its number, exactly
-- like room numbers and reservation numbers elsewhere.
CREATE TABLE IF NOT EXISTS "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_id" uuid,
	"work_order_number" varchar(32) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	-- LOW | NORMAL | HIGH | CRITICAL
	"priority" varchar(8) NOT NULL DEFAULT 'NORMAL',
	-- OPEN | ACCEPTED | IN_PROGRESS | PAUSED | COMPLETED | CANCELLED
	"status" varchar(16) NOT NULL DEFAULT 'OPEN',
	"reported_by" uuid,
	"assigned_staff_id" uuid,
	"resolution" text,
	"parts_used" jsonb,
	"takes_room_out_of_service" boolean NOT NULL DEFAULT false,
	"cancel_reason" text,
	"accepted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

DO $$ BEGIN
	ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_property_id_fk"
		FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_room_id_fk"
		FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_reported_by_fk"
		FOREIGN KEY ("reported_by") REFERENCES "hotel_staff"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_staff_id_fk"
		FOREIGN KEY ("assigned_staff_id") REFERENCES "hotel_staff"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "work_orders_property_status_idx"
  ON "work_orders" ("property_id", "status");

CREATE INDEX IF NOT EXISTS "work_orders_assignee_status_idx"
  ON "work_orders" ("assigned_staff_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "work_orders_property_number_unique"
  ON "work_orders" ("property_id", "work_order_number")
  WHERE "deleted_at" IS NULL;
