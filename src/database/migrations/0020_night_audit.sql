-- Night audit — the end-of-day close (Phase 4, item 4.1).
--
-- Two things the property PMS was missing: CONFIRMED bookings whose arrival
-- date has passed were never auto-marked NO_SHOW (they sat holding capacity),
-- and there was no per-property daily snapshot of arrivals/departures/occupancy.
-- The NightAuditWorker does the first as an UPDATE and records the second here.

CREATE TABLE IF NOT EXISTS "property_daily_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"arrivals" integer DEFAULT 0 NOT NULL,
	"departures" integer DEFAULT 0 NOT NULL,
	"in_house" integer DEFAULT 0 NOT NULL,
	"rooms_available" integer DEFAULT 0 NOT NULL,
	"rooms_sold" integer DEFAULT 0 NOT NULL,
	"occupancy_pct" integer DEFAULT 0 NOT NULL,
	"no_shows" integer DEFAULT 0 NOT NULL,
	"revenue_paise" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_daily_snapshots" ADD CONSTRAINT "property_daily_snapshots_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "property_daily_snapshots_property_date_unique" ON "property_daily_snapshots" USING btree ("property_id","business_date");
