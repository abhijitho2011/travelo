CREATE TABLE IF NOT EXISTS "admin_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" varchar(32) NOT NULL,
	"otp_hash" varchar(512) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "mobile" varchar(32);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_otps_mobile_idx" ON "admin_otps" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admins_mobile_idx" ON "admins" USING btree ("mobile");