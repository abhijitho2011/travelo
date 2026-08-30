-- Guest folio — the running bill for a stay.
--
-- Sits beside reservations (0009), restaurant (0015) and spa (0017). Closes the
-- revenue leak where a guest could charge food and spa to the room on
-- ROOM_CHARGE and check out having paid only the room total: those charges now
-- POST to the folio, and checkout can gate on the real balance.
--
-- DESIGN NOTES:
--  1. MONEY IS PAISE. amount_paise everywhere, integer, never a float.
--  2. ROOM CHARGES ARE NOT DUPLICATED. The room total stays on
--     reservations.total_paise; folio_line_items holds only ancillary charges
--     (restaurant, spa, manual). Authoritative balance =
--     (reservation.total_paise + Σ line_items.amount_paise)
--     − (Σ payments PAYMENT − Σ payments REFUND).
--  3. IDEMPOTENT POSTING. folio_line_items(source_type, source_id) is unique,
--     so a restaurant order or spa bill posts to the folio exactly once however
--     many times settle is retried.
--  4. IDEMPOTENT COLLECTION. folio_payments(reservation_id, idempotency_key) is
--     unique, so a tablet double-tap never takes the guest's money twice.

CREATE TABLE IF NOT EXISTS "folio_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"description" varchar(200) NOT NULL,
	"amount_paise" integer NOT NULL,
	"source_type" varchar(32),
	"source_id" uuid,
	"posted_by" uuid,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "folio_line_items" ADD CONSTRAINT "folio_line_items_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "folio_line_items" ADD CONSTRAINT "folio_line_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "folio_line_items" ADD CONSTRAINT "folio_line_items_posted_by_hotel_staff_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folio_line_items_reservation_idx" ON "folio_line_items" USING btree ("reservation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folio_line_items_property_idx" ON "folio_line_items" USING btree ("property_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "folio_line_items_source_unique" ON "folio_line_items" USING btree ("source_type","source_id") WHERE "source_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "folio_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"direction" varchar(8) DEFAULT 'PAYMENT' NOT NULL,
	"method" varchar(16) NOT NULL,
	"amount_paise" integer NOT NULL,
	"reference" varchar(120),
	"note" text,
	"collected_by" uuid,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "folio_payments" ADD CONSTRAINT "folio_payments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "folio_payments" ADD CONSTRAINT "folio_payments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "folio_payments" ADD CONSTRAINT "folio_payments_collected_by_hotel_staff_id_fk" FOREIGN KEY ("collected_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folio_payments_reservation_idx" ON "folio_payments" USING btree ("reservation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folio_payments_property_idx" ON "folio_payments" USING btree ("property_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "folio_payments_idempotency_unique" ON "folio_payments" USING btree ("reservation_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;
