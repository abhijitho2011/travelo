DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_photos' AND column_name = 'filename'
  ) THEN
    ALTER TABLE "property_photos" RENAME COLUMN "filename" TO "storage_key";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "property_photos" ADD COLUMN IF NOT EXISTS "storage_key" varchar(512) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "property_photos" ALTER COLUMN "storage_key" TYPE varchar(512);--> statement-breakpoint
ALTER TABLE "property_photos" ALTER COLUMN "storage_key" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "storage_key" varchar(512);
