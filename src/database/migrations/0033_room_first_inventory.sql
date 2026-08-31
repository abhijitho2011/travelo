-- Room-first inventory.
--
-- Properties on this platform are largely villas, homestays and small hotels
-- where no two rooms are alike: 201 has the garden view and the bathtub, 202
-- does not, and calling them "one type with two units" is a lie that the
-- availability maths then has to live with.
--
-- So the app becomes room-first: you add a ROOM and describe THAT room.
--
-- The `room_types` table stays, because reservations, rate plans, availability
-- and every channel-manager mapping key on it — OTAs distribute room types, not
-- individual rooms, and there is no version of this change that removes it
-- without also rewriting distribution. Instead, a room that carries its own
-- specifications gets a room type of its own holding exactly that one room, and
-- that type is marked private so no interface offers it as something to group
-- other rooms under.
--
--   1. `room_types.is_private` — this type belongs to one room; do not list it
--      as a shared type to pick from.
--   2. `room_photos` — mirrors `room_type_photos` exactly (and through it
--      `property_photos`): Postgres holds the object KEY, the bytes live in the
--      object store, clients get short-lived presigned URLs.
--
-- Existing shared types are untouched and keep working: is_private defaults to
-- false, which is what every row today means.

-- ---------- room_types.is_private ----------

ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "is_private" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- The room-type list screen filters on this on every read, and a property with
-- fifty villas has fifty private types to skip past.
CREATE INDEX IF NOT EXISTS "room_types_property_private_idx"
  ON "room_types" ("property_id", "is_private");
--> statement-breakpoint

-- ---------- room_photos ----------

-- `property_id` is denormalised alongside `room_id` so a tenant-scoped read
-- never has to join back through rooms.
CREATE TABLE IF NOT EXISTS "room_photos" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"  uuid NOT NULL,
  "room_id"      uuid NOT NULL,
  "storage_key"  varchar(512) NOT NULL,
  "content_type" varchar(128) NOT NULL,
  "size_bytes"   integer NOT NULL,
  -- ROOM | BATHROOM | EXTERIOR | VIEW | AMENITIES | OTHER — the same vocabulary
  -- as room_type_photos, so one Flutter enum serves both.
  "category"     varchar(24) NOT NULL DEFAULT 'ROOM',
  "is_primary"   boolean NOT NULL DEFAULT false,
  "sort_order"   integer NOT NULL DEFAULT 0,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_photos" ADD CONSTRAINT "room_photos_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_photos" ADD CONSTRAINT "room_photos_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_photos_room_idx" ON "room_photos" ("room_id");
--> statement-breakpoint
-- Exactly ONE primary photo per room, enforced by the database rather than by
-- hoping every write path remembers to clear the old one.
CREATE UNIQUE INDEX IF NOT EXISTS "room_photos_primary_unique"
  ON "room_photos" ("room_id")
  WHERE "is_primary";
