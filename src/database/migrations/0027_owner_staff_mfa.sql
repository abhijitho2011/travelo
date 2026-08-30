-- Owner + Staff TOTP MFA (opt-in, per principal).
--
-- Mirrors the admin MFA design (see 0012_mfa.sql). Each of `owners` and
-- `hotel_staff` gains `mfa_enabled` / `mfa_secret`, where `mfa_secret` holds an
-- AES-256-GCM ciphertext ("v1:<iv>:<tag>:<ct>", base64 parts) keyed by the
-- MFA_SECRET_KEY environment variable — never a plaintext TOTP secret. Without
-- that key enrolment is refused rather than degraded.
--
-- Two recovery-code tables mirror `admin_mfa_recovery_codes`: ten codes issued
-- once at enrolment, only their argon2id hashes kept, `used_at` making each one
-- strictly single-use.

ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "mfa_secret" text;
--> statement-breakpoint

ALTER TABLE "hotel_staff" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "hotel_staff" ADD COLUMN IF NOT EXISTS "mfa_secret" text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "owner_mfa_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "code_hash" varchar(512) NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "owner_mfa_recovery_codes"
    ADD CONSTRAINT "owner_mfa_recovery_codes_owner_id_owners_id_fk"
    FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "owner_mfa_recovery_owner_idx"
  ON "owner_mfa_recovery_codes" USING btree ("owner_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "staff_mfa_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "staff_id" uuid NOT NULL,
  "code_hash" varchar(512) NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "staff_mfa_recovery_codes"
    ADD CONSTRAINT "staff_mfa_recovery_codes_staff_id_hotel_staff_id_fk"
    FOREIGN KEY ("staff_id") REFERENCES "public"."hotel_staff"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "staff_mfa_recovery_staff_idx"
  ON "staff_mfa_recovery_codes" USING btree ("staff_id");
