-- Date-ranged rate overrides (Phase 4, item 4.2 — first cut of rate plans).
--
-- Pricing was a single room_types.base_rate with no way to charge more at peak
-- season or on weekends. A rate override sets a per-night rate for a room type
-- over a closed date range [start_date, end_date]; a booking whose arrival
-- falls in the range is quoted at the override instead of the base rate.

CREATE TABLE IF NOT EXISTS "rate_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"label" varchar(120),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"rate_paise" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_overrides" ADD CONSTRAINT "rate_overrides_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_overrides" ADD CONSTRAINT "rate_overrides_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_overrides_type_range_idx" ON "rate_overrides" USING btree ("room_type_id","start_date","end_date");
