CREATE TABLE IF NOT EXISTS "property_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "property_photos" DROP CONSTRAINT IF EXISTS "property_photos_property_id_properties_id_fk";--> statement-breakpoint
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "property_photos" DROP CONSTRAINT IF EXISTS "property_photos_owner_id_owners_id_fk";--> statement-breakpoint
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_photos_property_idx" ON "property_photos" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_photos_owner_idx" ON "property_photos" USING btree ("owner_id");
