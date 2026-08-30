-- Operations domains — Accounts, Inventory/Store, Sales (CRM), Travel Desk and
-- Driver. Sits beside rooms (0008), reservations (0009) and restaurant (0015).
--
-- DESIGN NOTES:
--   1. MONEY IS PAISE, integer, everywhere — like reservations.rate_paise.
--   2. Everything is PROPERTY-SCOPED: every row resolves by
--      (id, property_id = the caller's own); a foreign id 404s.
--   3. Stock on-hand (inventory_items.current_qty) only ever changes together
--      with a stock_movements row, in one transaction (service-enforced).
--   4. A received purchase order creates IN movements for its lines in one tx.

-- ================================ Accounts ================================

CREATE TABLE IF NOT EXISTS "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"category" varchar(24) NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"vendor" varchar(200),
	"incurred_on" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_hotel_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_property_idx" ON "expenses" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_property_status_idx" ON "expenses" USING btree ("property_id","status");
--> statement-breakpoint

-- ============================ Inventory / Store ============================

CREATE TABLE IF NOT EXISTS "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"sku" varchar(64) NOT NULL,
	"unit" varchar(24) DEFAULT 'pcs' NOT NULL,
	"category" varchar(64),
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"current_qty" integer DEFAULT 0 NOT NULL,
	"unit_cost_paise" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_property_idx" ON "inventory_items" USING btree ("property_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_items_property_sku_unique" ON "inventory_items" USING btree ("property_id","sku") WHERE "deleted_at" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact" varchar(120),
	"phone" varchar(32),
	"email" varchar(200),
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppliers_property_idx" ON "suppliers" USING btree ("property_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_property_name_unique" ON "suppliers" USING btree ("property_id","name") WHERE "deleted_at" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"type" varchar(16) NOT NULL,
	"qty" integer NOT NULL,
	"qty_delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" text,
	"purchase_order_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_hotel_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_property_idx" ON "stock_movements" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_item_idx" ON "stock_movements" USING btree ("item_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"po_number" varchar(24) NOT NULL,
	"supplier_id" uuid,
	"supplier_name" varchar(200),
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"note" text,
	"received_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_hotel_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_property_idx" ON "purchase_orders" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_property_status_idx" ON "purchase_orders" USING btree ("property_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_property_number_unique" ON "purchase_orders" USING btree ("property_id","po_number");
--> statement-breakpoint

-- ================================= Sales =================================

CREATE TABLE IF NOT EXISTS "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"company" varchar(200),
	"contact" varchar(120),
	"source" varchar(64),
	"stage" varchar(16) DEFAULT 'LEAD' NOT NULL,
	"value_paise" integer DEFAULT 0 NOT NULL,
	"owner_staff_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_staff_id_hotel_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_property_idx" ON "leads" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_property_stage_idx" ON "leads" USING btree ("property_id","stage");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" varchar(16) NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_created_by_hotel_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_activities_property_idx" ON "sales_activities" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_activities_lead_idx" ON "sales_activities" USING btree ("lead_id");
--> statement-breakpoint

-- ========================= Travel Desk + Driver =========================

CREATE TABLE IF NOT EXISTS "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"plate" varchar(32) NOT NULL,
	"seats" integer DEFAULT 4 NOT NULL,
	"status" varchar(16) DEFAULT 'AVAILABLE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_property_idx" ON "vehicles" USING btree ("property_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_property_plate_unique" ON "vehicles" USING btree ("property_id","plate") WHERE "deleted_at" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "transport_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"guest_name" varchar(200) NOT NULL,
	"reservation_id" uuid,
	"type" varchar(16) NOT NULL,
	"pickup_at" timestamp with time zone NOT NULL,
	"from_location" varchar(300),
	"to_location" varchar(300),
	"vehicle_id" uuid,
	"driver_staff_id" uuid,
	"status" varchar(16) DEFAULT 'REQUESTED' NOT NULL,
	"driver_stage" varchar(16),
	"fare_paise" integer,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_driver_staff_id_hotel_staff_id_fk" FOREIGN KEY ("driver_staff_id") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_created_by_hotel_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_requests_property_idx" ON "transport_requests" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_requests_property_status_idx" ON "transport_requests" USING btree ("property_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_requests_driver_idx" ON "transport_requests" USING btree ("driver_staff_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_requests_pickup_idx" ON "transport_requests" USING btree ("property_id","pickup_at");
