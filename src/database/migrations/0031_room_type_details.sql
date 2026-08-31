-- Room type DETAILS — everything a GM needs to describe a sellable room type
-- beyond its name and rate: an internal code, where it sits, its smoking and
-- accessibility policy, its real size, the occupancy split (base vs max, adults
-- vs children vs infants), extra-bed availability, and the two pricing flags
-- the rate engine reads.
--
-- Three shapes, deliberately:
--   1. Scalar columns on `room_types` — one value per type, always true of every
--      unit. Same argument as `air_conditioned` in 0008 and `private_pool` in
--      0030: a boolean has two states and both are true statements, whereas
--      "AC"/"Non-AC" catalogue entries let a type carry both or neither.
--   2. `room_type_beds` — the sleeping arrangement is a LIST ("1 king + 1 sofa
--      bed"), which no pair of scalar columns can hold. The existing
--      `bed_type`/`bed_count` pair STAYS as the denormalised primary bed and is
--      kept in sync from the FIRST bed row by the service, so the rooms board,
--      the reservation screens and every existing reader keep working
--      untouched.
--   3. `room_type_photos` — mirrors `property_photos` exactly: Postgres holds
--      the object KEY, the bytes live in the object store, clients get
--      short-lived presigned URLs. There is no publicly listable directory and
--      the API never proxies image bytes.
--
-- Every column is nullable or defaulted, so existing rows stay valid rows.

-- ---------- room_types: descriptive + policy columns ----------

-- Internal code the hotel already uses on its own paperwork ("DLX-KING").
-- Optional: plenty of small properties have none.
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "code" varchar(32);
--> statement-breakpoint
-- Free text, not an integer: "Ground", "LG", "2nd — garden wing" are all real
-- answers, exactly as `rooms.floor` is a varchar.
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "floor_label" varchar(64);
--> statement-breakpoint
-- NON_SMOKING | SMOKING | BOTH. Defaulted to NON_SMOKING because that is what
-- an unanswered question means in practice for Indian hotels, and because a
-- NULL here would be indistinguishable from "we allow it".
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "smoking_policy" varchar(16) DEFAULT 'NON_SMOKING' NOT NULL;
--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "accessible" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Size, as the hotel entered it. `size_sqft` (added earlier) is NOT dropped and
-- NOT deprecated: it stays the single canonical unit every existing reader
-- already uses. `size_value` + `size_unit` record what was TYPED, and the
-- service keeps `size_sqft` in sync on every write —
--     size_unit = 'SQFT' -> size_sqft = size_value
--     size_unit = 'SQM'  -> size_sqft = round(size_value * 10.7639)
-- so a hotel that thinks in square metres never has to convert, and no reader
-- has to know which unit was used.
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "size_value" integer;
--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "size_unit" varchar(8) DEFAULT 'SQFT' NOT NULL;
--> statement-breakpoint

-- ---------- room_types: occupancy split ----------

-- Guests INCLUDED in the base rate. `max_occupancy` is the ceiling; the gap
-- between the two is what extra-person charges are computed over, so they are
-- two different numbers and collapsing them would make extra-guest pricing
-- unrepresentable. Enforced base <= max in the service (OCCUPANCY_INVALID).
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "base_occupancy" integer DEFAULT 2 NOT NULL;
--> statement-breakpoint
-- Infants are counted separately from children because almost every hotel
-- charges them differently (usually nothing) and they do not consume a bed.
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "max_infants" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- ---------- room_types: extra bed ----------

ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "extra_bed_available" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "extra_bed_type" varchar(16);
--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "extra_bed_capacity" integer;
--> statement-breakpoint
-- Paise, like every other money column in this schema.
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "extra_bed_price_paise" integer;
--> statement-breakpoint

-- ---------- room_types: pricing flags ----------

ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "dynamic_pricing_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Whether the rates entered for this type are tax-inclusive. A flag, not an
-- assumption: getting it wrong silently mis-invoices every stay.
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "prices_include_tax" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Codes are unique PER PROPERTY, and only when actually set. Partial on both
-- counts: NULL codes never collide, and a soft-deleted type frees its code for
-- a new one — the same rule `room_types_property_name_unique` already follows.
CREATE UNIQUE INDEX IF NOT EXISTS "room_types_property_code_unique"
  ON "room_types" ("property_id", "code")
  WHERE "code" IS NOT NULL AND "deleted_at" IS NULL;
--> statement-breakpoint

-- ---------- room_type_beds ----------

-- The full sleeping arrangement, one row per bed group. `room_types.bed_type`
-- and `room_types.bed_count` remain the denormalised PRIMARY bed, written from
-- the first row here (lowest sort_order) on every write, so nothing that reads
-- the old pair needs to change.
CREATE TABLE IF NOT EXISTS "room_type_beds" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_type_id" uuid NOT NULL,
  -- KING | QUEEN | DOUBLE | SINGLE | TWIN | SOFA_BED | BUNK_BED | EXTRA_BED |
  -- CRIB | OTHER (plus the legacy BUNK). Varchar rather than an enum type, as
  -- everywhere else in this schema, so adding a bed kind is a code change and
  -- not a locking DDL migration.
  "bed_type"     varchar(16) NOT NULL,
  "quantity"     integer NOT NULL DEFAULT 1,
  "sort_order"   integer NOT NULL DEFAULT 0,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_type_beds" ADD CONSTRAINT "room_type_beds_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_type_beds_room_type_idx" ON "room_type_beds" ("room_type_id");
--> statement-breakpoint

-- ---------- room_type_photos ----------

-- Mirrors `property_photos`: the row holds the object KEY and the metadata, the
-- bytes live in the object store, and clients are handed presigned URLs.
-- `property_id` is denormalised alongside `room_type_id` so a tenant-scoped
-- read never has to join back through room_types.
CREATE TABLE IF NOT EXISTS "room_type_photos" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"  uuid NOT NULL,
  "room_type_id" uuid NOT NULL,
  "storage_key"  varchar(512) NOT NULL,
  "content_type" varchar(128) NOT NULL,
  "size_bytes"   integer NOT NULL,
  -- ROOM | BATHROOM | EXTERIOR | VIEW | AMENITIES | OTHER
  "category"     varchar(24) NOT NULL DEFAULT 'ROOM',
  "is_primary"   boolean NOT NULL DEFAULT false,
  "sort_order"   integer NOT NULL DEFAULT 0,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_type_photos" ADD CONSTRAINT "room_type_photos_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_type_photos" ADD CONSTRAINT "room_type_photos_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_type_photos_room_type_idx" ON "room_type_photos" ("room_type_id");
--> statement-breakpoint
-- Exactly ONE primary photo per type, enforced by the database rather than by
-- hoping every write path remembers to clear the old one.
CREATE UNIQUE INDEX IF NOT EXISTS "room_type_photos_primary_unique"
  ON "room_type_photos" ("room_type_id")
  WHERE "is_primary";
