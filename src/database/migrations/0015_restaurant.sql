-- Restaurant / F&B — tables, menu, orders and their KOT lines.
--
-- The outlet layer: a table plus a menu becomes an order, an order becomes a
-- bill, a bill is settled. Sits beside rooms (0008) and reservations (0009),
-- and reads reservations (CHECKED_IN) for the ROOM_CHARGE settlement path.
--
-- DESIGN NOTES, because they are the whole point:
--
--  1. MONEY IS PAISE, integer, everywhere — like room_types.base_rate and
--     reservations.rate_paise. No floats touch a rupee.
--
--  2. A BILL NEVER RE-DERIVES FROM THE LIVE MENU. order_items snapshots the
--     item's name and price at order time (name_snapshot, price_paise_snapshot)
--     and every bill is computed from those snapshots. A menu edited next week
--     — repriced, renamed, retired — must not rewrite a bill already run. Same
--     rule as a reservation snapshotting rate_paise from its room type.
--
--  3. ONE OPEN ORDER PER TABLE. Enforced by a partial unique index
--     (status = 'OPEN' AND table_id IS NOT NULL) as well as in the service's
--     transaction: two waiters opening the same table cannot both win.
--
--  4. Everything is PROPERTY-SCOPED. Every row is resolved by
--     (id, property_id = the caller's own); a foreign id 404s.

CREATE TABLE IF NOT EXISTS "restaurant_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"seats" integer DEFAULT 2 NOT NULL,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurant_tables_property_idx" ON "restaurant_tables" USING btree ("property_id");
--> statement-breakpoint
-- Partial: a deleted "T1" frees the name for a new one, like room numbers.
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_tables_property_name_unique" ON "restaurant_tables" USING btree ("property_id","name") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_categories_property_idx" ON "menu_categories" USING btree ("property_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_categories_property_name_unique" ON "menu_categories" USING btree ("property_id","name") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"price_paise" integer DEFAULT 0 NOT NULL,
	"veg" boolean DEFAULT true NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_items_property_idx" ON "menu_items" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_items_category_idx" ON "menu_items" USING btree ("category_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_items_property_name_unique" ON "menu_items" USING btree ("property_id","name") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restaurant_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"table_id" uuid,
	"order_number" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"waiter_staff_id" uuid,
	"guest_count" integer DEFAULT 1 NOT NULL,
	"subtotal_paise" integer DEFAULT 0 NOT NULL,
	"tax_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"payment_method" varchar(16),
	"reservation_id" uuid,
	"settled_by" uuid,
	"billed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_table_id_restaurant_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_waiter_staff_id_hotel_staff_id_fk" FOREIGN KEY ("waiter_staff_id") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_settled_by_hotel_staff_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurant_orders_property_idx" ON "restaurant_orders" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurant_orders_table_idx" ON "restaurant_orders" USING btree ("table_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurant_orders_status_idx" ON "restaurant_orders" USING btree ("status");
--> statement-breakpoint
-- An order number is a receipt; never handed out twice, even per property.
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_orders_property_number_unique" ON "restaurant_orders" USING btree ("property_id","order_number");
--> statement-breakpoint
-- ONE open order per table. Partial: only OPEN dine-in orders, so a table can
-- hold at most one live order while takeaways (NULL table) are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_orders_one_open_per_table" ON "restaurant_orders" USING btree ("table_id") WHERE "status" = 'OPEN' AND "table_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid,
	"name_snapshot" varchar(160) NOT NULL,
	"price_paise_snapshot" integer NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"kot_status" varchar(16) DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_restaurant_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."restaurant_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_order_idx" ON "order_items" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_kot_status_idx" ON "order_items" USING btree ("kot_status");
