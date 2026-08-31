-- Villa support on room types.
--
-- A room type can now describe a whole standalone unit (a villa) instead of a
-- single hotel room: `unit_kind` says which, `unit_room_count` is how many
-- rooms ONE unit contains (a "2-room villa"), and `private_pool` marks a pool
-- belonging to each unit. The shared hotel pool remains a PROPERTY amenity;
-- see the schema note in rooms.ts for why this is a column, like
-- `air_conditioned`, and not a ROOM amenity.
--
-- Physical `rooms` rows are unchanged — one row is one bookable unit, whether
-- that unit is a room or a villa, so reservations/housekeeping need nothing.
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "unit_kind" varchar(16) DEFAULT 'ROOM' NOT NULL;
--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "unit_room_count" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "private_pool" boolean DEFAULT false NOT NULL;
