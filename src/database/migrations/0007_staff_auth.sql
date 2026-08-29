-- Staff authentication for the unified Tavelo staff mobile app.
--
-- 1. Widen hotel_staff.role beyond GM/AGM to the full 23-role operational set
--    and hotel_staff.status beyond ACTIVE/BLOCKED to the seven-state lifecycle.
--    Both columns are plain varchar (no CHECK constraint, no enum type), so the
--    widening is purely a length change — every existing row stays valid and the
--    ACTIVE default for owner-created staff is untouched.
-- 2. Add the profile columns the staff app needs (department, employee_id) and
--    last_login_at, stamped on every successful staff sign-in.
-- 3. Index hotel_staff.mobile — staff sign in by mobile, so every OTP request
--    and verify does a lookup on it.
-- 4. Create staff_sessions (refresh-token sessions, mirrors owner_sessions) and
--    staff_otps (kept separate from owner_otps so a code minted for the owner
--    surface can never be redeemed on the staff surface, and vice versa).
--
-- The existing partial unique index hotel_staff_property_email_unique is left
-- exactly as it is.

-- 'PENDING_APPROVAL' is 16 characters, i.e. flush against the old varchar(16)
-- ceiling; widen to 32 so the status set has room.
ALTER TABLE "hotel_staff" ALTER COLUMN "status" TYPE varchar(32);
--> statement-breakpoint
ALTER TABLE "hotel_staff" ADD COLUMN IF NOT EXISTS "department" varchar(64);
--> statement-breakpoint
ALTER TABLE "hotel_staff" ADD COLUMN IF NOT EXISTS "employee_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "hotel_staff" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotel_staff_mobile_idx" ON "hotel_staff" USING btree ("mobile");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"refresh_token_hash" varchar(512) NOT NULL,
	"user_agent" varchar(512),
	"ip" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_id_hotel_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."hotel_staff"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_sessions_staff_idx" ON "staff_sessions" USING btree ("staff_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" varchar(32) NOT NULL,
	"otp_hash" varchar(512) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_otps_mobile_idx" ON "staff_otps" USING btree ("mobile");
--> statement-breakpoint
-- Platform-wide staff administration from the super-admin panel.
INSERT INTO "permissions" ("key", "group", "description")
VALUES ('staff.manage', 'Staff', 'Block, suspend or reactivate any hotel staff member platform-wide')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- Grant it to Operations Admin (Super Admin already holds the '*' wildcard).
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "id", 'staff.manage' FROM "roles" WHERE "key" = 'operations_admin'
ON CONFLICT DO NOTHING;
