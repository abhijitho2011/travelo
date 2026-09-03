-- PMS foundation, part 2: per-room-type-per-date price, availability and
-- restrictions — the table the rates grid, bulk update, channel push, the
-- booking engine and the revenue engine all read and write.
--
-- Why a new table rather than growing rate_overrides: an override is a
-- date-RANGE price and nothing else. Every consumer above needs the day as the
-- unit — "close Tuesday", "two left on the 14th", "min stay 3 over Diwali" —
-- and a range row cannot say any of that without being split on every edit.
-- rate_overrides stays for what it is and is read as a fallback until a
-- property moves to the grid (RatesService resolves day → override → base).

CREATE TABLE IF NOT EXISTS "rate_inventory_days" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"           uuid NOT NULL,
  "room_type_id"          uuid NOT NULL,
  -- NULL = the room type's base sell rate; a plan id = that plan's price for
  -- the day. Both rows may exist; the plan row wins for that plan.
  "rate_plan_id"          uuid,
  "date"                  date NOT NULL,
  -- NULL means "not set for the day": fall back to override, then base rate.
  "price_paise"           integer,
  -- Rooms available to sell. NULL = derive from physical rooms minus bookings.
  -- A number caps below that: "we have 10 but sell only 6 online".
  "available"             integer,
  "min_los"               integer,
  "max_los"               integer,
  -- stop_sell closes the day entirely; CTA/CTD refuse arrivals/departures on
  -- it while letting stay-throughs pass.
  "stop_sell"             boolean NOT NULL DEFAULT false,
  "closed_to_arrival"     boolean NOT NULL DEFAULT false,
  "closed_to_departure"   boolean NOT NULL DEFAULT false,
  -- Per-channel deltas, keyed by integration_connection id:
  --   { "<connId>": { "priceDeltaBp": 1000, "available": 4 } }
  "channel_overrides"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Set by the revenue engine when a rule wrote the price, so auto-revert can
  -- tell a rule's price from a hand-typed one and put only the former back.
  "pricing_rule_id"       uuid,
  "updated_by"            uuid,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "updated_at"            timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_inventory_days" ADD CONSTRAINT "rate_inventory_days_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_inventory_days" ADD CONSTRAINT "rate_inventory_days_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_inventory_days" ADD CONSTRAINT "rate_inventory_days_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- One row per (type, plan, day). Two partial uniques because NULL never equals
-- NULL in a plain unique index and the base-rate row would duplicate freely.
CREATE UNIQUE INDEX IF NOT EXISTS "rate_inventory_days_type_plan_date_unique"
  ON "rate_inventory_days" ("room_type_id", "rate_plan_id", "date") WHERE "rate_plan_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_inventory_days_type_base_date_unique"
  ON "rate_inventory_days" ("room_type_id", "date") WHERE "rate_plan_id" IS NULL;
--> statement-breakpoint
-- The grid reads a property × date window; the resolver reads one type × day.
CREATE INDEX IF NOT EXISTS "rate_inventory_days_property_date_idx"
  ON "rate_inventory_days" ("property_id", "date");
--> statement-breakpoint

-- ---------- rate_change_log: every price/availability/restriction change ----------
--
-- The spec's "full change history": who changed what, from what, to what, on
-- which day, and whether a person or a pricing rule did it. Append-only.
CREATE TABLE IF NOT EXISTS "rate_change_log" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"     uuid NOT NULL,
  "room_type_id"    uuid NOT NULL,
  "rate_plan_id"    uuid,
  "date"            date NOT NULL,
  -- price | available | min_los | max_los | stop_sell | cta | ctd | channel
  "field"           varchar(16) NOT NULL,
  "before"          jsonb,
  "after"           jsonb,
  -- STAFF | RULE | CHANNEL | IMPORT
  "actor_kind"      varchar(8) NOT NULL DEFAULT 'STAFF',
  "actor_staff_id"  uuid,
  "pricing_rule_id" uuid,
  -- One id per bulk operation so a 400-cell update reads as one act, not 400.
  "batch_id"        uuid,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_change_log" ADD CONSTRAINT "rate_change_log_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_change_log_property_created_idx"
  ON "rate_change_log" ("property_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_change_log_type_date_idx"
  ON "rate_change_log" ("room_type_id", "date");
