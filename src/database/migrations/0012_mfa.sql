-- Admin TOTP MFA (opt-in, per admin).
--
-- `admins.mfa_enabled` and `admins.mfa_secret` already exist and were unused;
-- this migration finally puts them to work. `mfa_secret` now holds an
-- AES-256-GCM ciphertext ("v1:<iv>:<tag>:<ct>", base64 parts) keyed by the
-- MFA_SECRET_KEY environment variable — never a plaintext TOTP secret. Without
-- that key enrolment is refused rather than degraded, so nothing here needs to
-- widen the column.
--
-- What is new is the recovery-code table. Ten codes are issued once at
-- enrolment and only their argon2id hashes are kept; `used_at` enforces
-- single use, which is the whole point of a recovery code.

CREATE TABLE IF NOT EXISTS "admin_mfa_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_id" uuid NOT NULL,
  "code_hash" varchar(512) NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "admin_mfa_recovery_codes"
    ADD CONSTRAINT "admin_mfa_recovery_codes_admin_id_admins_id_fk"
    FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_mfa_recovery_admin_idx"
  ON "admin_mfa_recovery_codes" USING btree ("admin_id");
