-- Reservations and their transition trail.
--
-- The foundation under reception, occupancy and revenue. Rooms (0008) answered
-- "what does this hotel have"; this answers "who is in it, and when".
--
-- MODELLING NOTES, because they are the whole design:
--
--  1. A reservation points at a ROOM TYPE (NOT NULL) and, only once one is
--     actually assigned, at a ROOM (NULLABLE). Hotels sell "a Deluxe on the
--     14th", not "room 304"; reception picks the physical room at check-in.
--     Forcing room_id at booking time is what makes front offices fight PMS
--     software, so the column is nullable and ON DELETE SET NULL.
--
--  2. check_in / check_out are DATE, not timestamptz. A night is a night
--     whether the guest walks in at 14:00 or 23:00, and a hotel's day rolls
--     over on its own local calendar, not on UTC. check_out is EXCLUSIVE:
--     14th -> 15th is ONE night and the room is free on the 15th.
--
--     OVERLAP, therefore, is:
--         a.check_in < b.check_out AND b.check_in < a.check_out
--     which makes same-day turnover (a.check_out = b.check_in) legal. Any
--     rule using <= here would refuse half the bookings a busy hotel takes.
--
--  3. Only CONFIRMED and CHECKED_IN occupy a room. PENDING is a soft hold and
--     deliberately does NOT block one; CANCELLED/NO_SHOW/CHECKED_OUT free it.
--
--  4. Money is paise, like every other money column here. rate_paise is PER
--     NIGHT and SNAPSHOTTED from room_types.base_rate at booking time, and
--     total_paise is stored rather than derived — a rate change next week must
--     not silently rewrite last week's revenue.
--
--  5. NO database-level exclusion constraint on the overlap. It would need
--     btree_gist and a daterange expression, and it could not express "only
--     when status in (CONFIRMED, CHECKED_IN)" cheaply across the status
--     transitions we actually perform. The rule is enforced in ONE place, in
--     the service, inside a transaction that takes SELECT ... FOR UPDATE on the
--     candidate rows for that room. Indexes below make that probe an index scan.

CREATE TABLE IF NOT EXISTS "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"room_id" uuid,
	"reservation_number" varchar(32) NOT NULL,
	"guest_name" varchar(160) NOT NULL,
	"guest_phone" varchar(32) NOT NULL,
	"guest_email" varchar(254),
	"guest_id_type" varchar(32),
	"guest_id_number" varchar(64),
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"rate_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"paid_paise" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"source" varchar(16) DEFAULT 'WALK_IN' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	-- A stay must cover at least one night. Enforced here as well as in the
	-- service because a zero- or negative-length stay makes every nights,
	-- revenue and occupancy calculation downstream meaningless.
	CONSTRAINT "reservations_dates_ordered" CHECK ("check_out" > "check_in")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_hotel_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- The arrivals/departures board: one property, one date window.
CREATE INDEX IF NOT EXISTS "reservations_property_check_in_idx" ON "reservations" USING btree ("property_id","check_in");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservations_property_status_idx" ON "reservations" USING btree ("property_id","status");
--> statement-breakpoint
-- The double-booking probe: candidate rows for ONE room, by arrival date.
CREATE INDEX IF NOT EXISTS "reservations_room_check_in_idx" ON "reservations" USING btree ("room_id","check_in");
--> statement-breakpoint
-- NOT partial on deleted_at: a reservation number is a receipt a guest may be
-- holding, so it must never be handed out twice even after a soft delete.
CREATE UNIQUE INDEX IF NOT EXISTS "reservations_property_number_unique" ON "reservations" USING btree ("property_id","reservation_number");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"type" varchar(48) NOT NULL,
	"actor_staff_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_actor_staff_id_hotel_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_events_reservation_idx" ON "reservation_events" USING btree ("reservation_id");
