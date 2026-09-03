-- PMS milestones 6–7: revenue engine, coupons, POS depth, direct billing,
-- cash tracker and shifts. All additive and defaulted.

-- ---------- revenue: price floor, named rules, coupons ----------
ALTER TABLE "property_settings" ADD COLUMN IF NOT EXISTS "min_room_price_paise" integer;
--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD COLUMN IF NOT EXISTS "name" varchar(80);
--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD COLUMN IF NOT EXISTS "last_run_at" timestamptz;
--> statement-breakpoint
-- Promotions the booking page honours. `kind` PERCENT (basis points) or FIXED
-- (paise off the stay). Uses are counted so a "first 50 guests" code stops.
CREATE TABLE IF NOT EXISTS "coupons" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"   uuid NOT NULL,
  "code"          varchar(40) NOT NULL,
  "description"   varchar(200),
  "kind"          varchar(8) NOT NULL DEFAULT 'PERCENT',
  "value"         integer NOT NULL,
  "valid_from"    date,
  "valid_to"      date,
  "min_nights"    integer,
  "max_uses"      integer,
  "uses"          integer NOT NULL DEFAULT 0,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "deleted_at"    timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coupons" ADD CONSTRAINT "coupons_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_property_code_unique" ON "coupons" ("property_id", upper("code")) WHERE "deleted_at" IS NULL;
--> statement-breakpoint

-- ---------- POS depth: discount, service charge, partial settlement ----------
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "discount_paise" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "discount_reason" varchar(200);
--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "service_charge_paise" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "paid_paise" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "remarks" varchar(500);
--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "corporate_account_id" uuid;
--> statement-breakpoint
-- Service charge, basis points auto-added to every restaurant bill (0 = none).
ALTER TABLE "property_settings" ADD COLUMN IF NOT EXISTS "restaurant_service_charge_bp" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Each payment against an order (partial settlement): method, amount, remarks.
CREATE TABLE IF NOT EXISTS "restaurant_order_payments" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id"     uuid NOT NULL,
  "property_id"  uuid NOT NULL,
  "method"       varchar(16) NOT NULL,
  "amount_paise" integer NOT NULL,
  "reference"    varchar(120),
  "remarks"      varchar(500),
  "collected_by" uuid,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restaurant_order_payments" ADD CONSTRAINT "restaurant_order_payments_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."restaurant_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurant_order_payments_order_idx" ON "restaurant_order_payments" ("order_id");
--> statement-breakpoint

-- ---------- direct billing: corporate accounts and their ledger ----------
CREATE TABLE IF NOT EXISTS "corporate_accounts" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"        uuid NOT NULL,
  "name"               varchar(160) NOT NULL,
  "gstin"              varchar(15),
  "contact_name"       varchar(120),
  "contact_phone"      varchar(32),
  "contact_email"      varchar(254),
  "address"            text,
  "credit_limit_paise" integer,
  "is_active"          boolean NOT NULL DEFAULT true,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now(),
  "deleted_at"         timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "corporate_accounts_property_idx" ON "corporate_accounts" ("property_id");
--> statement-breakpoint
-- Append-only. CHARGE = a folio or POS bill billed to the account; PAYMENT =
-- money received against it. Balance = sum(CHARGE) - sum(PAYMENT).
CREATE TABLE IF NOT EXISTS "corporate_ledger" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id"      uuid NOT NULL,
  "property_id"     uuid NOT NULL,
  "kind"            varchar(8) NOT NULL,
  "amount_paise"    integer NOT NULL,
  "reservation_id"  uuid,
  "order_id"        uuid,
  "reference"       varchar(120),
  "note"            varchar(500),
  "recorded_by"     uuid,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "corporate_ledger" ADD CONSTRAINT "corporate_ledger_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "corporate_ledger_account_idx" ON "corporate_ledger" ("account_id", "created_at");
--> statement-breakpoint
-- A stay may be billed to an account; the folio settles by 'CORPORATE'.
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "corporate_account_id" uuid;
--> statement-breakpoint

-- ---------- cash tracker and shifts ----------
CREATE TABLE IF NOT EXISTS "staff_shifts" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"         uuid NOT NULL,
  "staff_id"            uuid NOT NULL,
  "opened_at"           timestamptz NOT NULL DEFAULT now(),
  "closed_at"           timestamptz,
  "opening_cash_paise"  integer NOT NULL DEFAULT 0,
  "declared_cash_paise" integer,
  "expected_cash_paise" integer,
  "note"                varchar(500)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_shifts_property_open_idx" ON "staff_shifts" ("property_id", "closed_at");
--> statement-breakpoint
-- Every cash movement: folio cash, POS cash, manual cash-in, owner/manager
-- withdrawal, top-up, cash expense. Running cash-in-hand is a sum.
CREATE TABLE IF NOT EXISTS "cash_entries" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"    uuid NOT NULL,
  "shift_id"       uuid,
  "kind"           varchar(16) NOT NULL,
  "amount_paise"   integer NOT NULL,
  "reservation_id" uuid,
  "order_id"       uuid,
  "expense_id"     uuid,
  "note"           varchar(500),
  "recorded_by"    uuid,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_entries_property_created_idx" ON "cash_entries" ("property_id", "created_at");
