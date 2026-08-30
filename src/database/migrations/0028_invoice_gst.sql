-- Phase 7.5: Indian GST (CGST/SGST/IGST) on invoices, plus tax columns on folio
-- line items for a future folio-GST pass. Idempotent; safe to re-run.
-- The existing invoices.tax column is retained as the total-tax figure
-- (cgst + sgst + igst) for backward compatibility.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cgst_paise" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "sgst_paise" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "igst_paise" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "place_of_supply" varchar(64);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "hsn_code" varchar(16);
--> statement-breakpoint
-- Folio: columns are made available now with 0 defaults. Wiring folio posting to
-- actually compute per-line GST is a future step (see folio.service.ts).
ALTER TABLE "folio_line_items" ADD COLUMN IF NOT EXISTS "tax_paise" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "folio_line_items" ADD COLUMN IF NOT EXISTS "hsn_code" varchar(16);
