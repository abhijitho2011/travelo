-- Rooms, room types and the amenity catalogue.
--
-- This is the layer under reception check-in, the housekeeping board and every
-- occupancy KPI: none of them can show a real number until rooms exist as rows.
--
-- Two levels, deliberately:
--   amenities        — one ADMIN-MANAGED catalogue, shared by every hotel, so
--                      "Wifi" means the same thing platform-wide and reporting
--                      can group on it. Mirrors location_states/districts.
--   room_types       — per property; the commercial unit (rate, occupancy).
--   rooms            — per property; the physical unit reception assigns.
--
-- NOT related to `features` / `plan_features`. Those are SUBSCRIPTION
-- entitlements. An amenity is a physical thing in a room. Keeping them apart is
-- what stops a billing change from rewriting what a hotel advertises.
--
-- AIR CONDITIONING is a BOOLEAN on room_types, not two catalogue rows.
-- "AC" and "Non-AC" as sibling amenities makes contradictory data reachable: a
-- room type could carry both (meaningless) or neither (indistinguishable from
-- "nobody filled this in"). `air_conditioned` has exactly two states and both
-- are true statements about the room.

CREATE TABLE IF NOT EXISTS "amenities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"scope" varchar(16) DEFAULT 'ROOM' NOT NULL,
	"icon" varchar(64),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amenities_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "amenities_scope_idx" ON "amenities" USING btree ("scope");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "amenities_status_idx" ON "amenities" USING btree ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"bed_type" varchar(16) DEFAULT 'DOUBLE' NOT NULL,
	"bed_count" integer DEFAULT 1 NOT NULL,
	"max_occupancy" integer DEFAULT 2 NOT NULL,
	"max_adults" integer DEFAULT 2 NOT NULL,
	"max_children" integer DEFAULT 0 NOT NULL,
	"air_conditioned" boolean DEFAULT false NOT NULL,
	"base_rate" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"size_sqft" integer,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_types" ADD CONSTRAINT "room_types_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_types_property_idx" ON "room_types" USING btree ("property_id");
--> statement-breakpoint
-- PARTIAL unique: a soft-deleted "Deluxe" frees the name for a new one, the
-- same rule hotel_staff already uses for email.
CREATE UNIQUE INDEX IF NOT EXISTS "room_types_property_name_unique" ON "room_types" USING btree ("property_id","name") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_type_amenities" (
	"room_type_id" uuid NOT NULL,
	"amenity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_type_amenities_room_type_id_amenity_id_pk" PRIMARY KEY("room_type_id","amenity_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_type_amenities_amenity_idx" ON "room_type_amenities" USING btree ("amenity_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"number" varchar(32) NOT NULL,
	"floor" varchar(16),
	"status" varchar(24) DEFAULT 'AVAILABLE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- RESTRICT, not cascade: deleting a room type that still has rooms on it would
-- silently take the rooms with it. The service soft-deletes and refuses while
-- rooms remain.
DO $$ BEGIN
 ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rooms_property_idx" ON "rooms" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rooms_room_type_idx" ON "rooms" USING btree ("room_type_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rooms_status_idx" ON "rooms" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_property_number_unique" ON "rooms" USING btree ("property_id","number") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_amenities" (
	"room_id" uuid NOT NULL,
	"amenity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_amenities_room_id_amenity_id_pk" PRIMARY KEY("room_id","amenity_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_amenities_amenity_idx" ON "room_amenities" USING btree ("amenity_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_amenities" (
	"property_id" uuid NOT NULL,
	"amenity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_amenities_property_id_amenity_id_pk" PRIMARY KEY("property_id","amenity_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_amenities_amenity_idx" ON "property_amenities" USING btree ("amenity_id");
--> statement-breakpoint
-- ---------- Starter amenity catalogue ----------
-- Keyed by slug and ON CONFLICT DO NOTHING, so re-running is inert and an
-- admin who has renamed "Wifi" to "Free Wi-Fi" keeps their edit.
--
-- There is deliberately NO 'non_ac' row AND no 'air_conditioning' row. See the
-- note at the top of this file: air conditioning is `room_types.air_conditioned`.
-- Seeding an "Air conditioning" amenity ALONGSIDE that boolean would rebuild the
-- very contradiction the boolean removes — a room type could read
-- air_conditioned = false while carrying the amenity, and neither field would be
-- believable. One fact, one column.
INSERT INTO "amenities" ("key", "name", "scope", "icon", "sort_order") VALUES
	('tv', 'TV', 'ROOM', 'tv', 20),
	('wifi', 'Wifi', 'ROOM', 'wifi', 30),
	('minibar', 'Minibar', 'ROOM', 'kitchen', 40),
	('safe', 'Safe', 'ROOM', 'lock', 50),
	('bathtub', 'Bathtub', 'ROOM', 'bathtub', 60),
	('balcony', 'Balcony', 'ROOM', 'balcony', 70),
	('sea_view', 'Sea view', 'ROOM', 'waves', 80),
	('mountain_view', 'Mountain view', 'ROOM', 'landscape', 90),
	('accessible', 'Accessible', 'ROOM', 'accessible', 100),
	('kettle', 'Kettle', 'ROOM', 'coffee', 110),
	('work_desk', 'Work desk', 'ROOM', 'desk', 120),
	('hair_dryer', 'Hair dryer', 'ROOM', 'air', 130),
	('pool', 'Pool', 'PROPERTY', 'pool', 10),
	('gym', 'Gym', 'PROPERTY', 'fitness_center', 20),
	('parking', 'Parking', 'PROPERTY', 'local_parking', 30),
	('restaurant', 'Restaurant', 'PROPERTY', 'restaurant', 40),
	('spa', 'Spa', 'PROPERTY', 'spa', 50),
	('bar', 'Bar', 'PROPERTY', 'local_bar', 60),
	('conference_hall', 'Conference hall', 'PROPERTY', 'meeting_room', 70),
	('airport_shuttle', 'Airport shuttle', 'PROPERTY', 'airport_shuttle', 80),
	('laundry', 'Laundry', 'PROPERTY', 'local_laundry_service', 90),
	('front_desk_24h', '24h front desk', 'PROPERTY', 'concierge', 100),
	('lift', 'Lift', 'PROPERTY', 'elevator', 110),
	('power_backup', 'Power backup', 'PROPERTY', 'bolt', 120)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- ---------- Super-admin permission for the catalogue ----------
INSERT INTO "permissions" ("key", "group", "description")
VALUES ('settings.amenities.manage', 'Settings', 'Manage the platform-wide room and property amenity catalogue')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- Operations Admin gets it explicitly; Super Admin already holds '*'.
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "id", 'settings.amenities.manage' FROM "roles" WHERE "key" = 'operations_admin'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- ---------- properties.room_count becomes derived ----------
-- The column stays (other code reads it), but where rooms exist it is no longer
-- a hand-typed number: RoomsService recomputes it from live room rows inside
-- the same transaction as every create/delete. This backfill aligns any
-- property that already has rooms; properties with none keep whatever the owner
-- entered at listing time.
UPDATE "properties" p
SET "room_count" = c.n
FROM (
	SELECT "property_id", count(*)::int AS n
	FROM "rooms"
	WHERE "deleted_at" IS NULL
	GROUP BY "property_id"
) c
WHERE p."id" = c."property_id" AND p."room_count" <> c.n;
