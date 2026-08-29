-- Owner email uniqueness should apply only to LIVE owners. The original absolute
-- unique constraint kept a soft-deleted owner's email reserved forever, so an
-- email could never be reused after the owner was deleted. Replace it with a
-- partial unique index that ignores soft-deleted rows.
ALTER TABLE "owners" DROP CONSTRAINT IF EXISTS "owners_email_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "owners_email_active_unique"
  ON "owners" ("email")
  WHERE "deleted_at" IS NULL;
