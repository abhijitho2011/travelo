-- Group bookings (Phase 4, item 4.11 — first cut).
--
-- A group master ties many reservations together — a wedding block, a corporate
-- party — so the desk can see and act on them as one. Reservations gain a
-- nullable group_id; each stay is still its own row (its own room, dates, folio),
-- but they share the group. A single shared folio is a later refinement.

CREATE TABLE IF NOT EXISTS "booking_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"contact_name" varchar(160),
	"contact_phone" varchar(32),
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booking_groups" ADD CONSTRAINT "booking_groups_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_group_id_booking_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."booking_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_groups_property_idx" ON "booking_groups" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservations_group_idx" ON "reservations" USING btree ("group_id");
