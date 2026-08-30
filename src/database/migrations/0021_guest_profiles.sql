-- Guest CRM overlay (Phase 4, item 4.3).
--
-- Guest identity was denormalised text on each reservation, so there was no
-- repeat-guest lookup, no stay history, no blacklist. The stay HISTORY stays in
-- reservations (grouped by phone); this overlay carries the CRM fields that are
-- ABOUT the guest rather than one stay — notes and the blacklist — keyed by
-- (property, phone).

CREATE TABLE IF NOT EXISTS "guest_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"phone" varchar(32) NOT NULL,
	"name" varchar(160),
	"email" varchar(254),
	"id_type" varchar(32),
	"id_number" varchar(64),
	"notes" text,
	"blacklisted" boolean DEFAULT false NOT NULL,
	"blacklist_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "guest_profiles_property_phone_unique" ON "guest_profiles" USING btree ("property_id","phone");
