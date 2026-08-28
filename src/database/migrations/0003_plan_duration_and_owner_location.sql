ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "duration_months" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP CONSTRAINT IF EXISTS "subscription_plans_duration_months_check";--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_duration_months_check" CHECK ("duration_months" > 0 AND "duration_months" <= 120);--> statement-breakpoint
INSERT INTO "permissions" ("key", "group", "description") VALUES ('owner.delete', 'Owner', 'delete owner') ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "state_id" uuid;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "district_id" uuid;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "pin_code" varchar(6);--> statement-breakpoint
ALTER TABLE "owners" DROP CONSTRAINT IF EXISTS "owners_state_id_location_states_id_fk";--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_state_id_location_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."location_states"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "owners" DROP CONSTRAINT IF EXISTS "owners_district_id_location_districts_id_fk";--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_district_id_location_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."location_districts"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owners_state_idx" ON "owners" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owners_district_idx" ON "owners" USING btree ("district_id");
