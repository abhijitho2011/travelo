-- Menu-item recipes so a restaurant sale depletes stock (Phase 4, item 4.9).
--
-- Inventory never moved when food was sold — current_qty drifted from reality
-- immediately. A recipe links a menu item to the inventory items it consumes
-- and how much per serving; settling an order posts an OUT movement for each.

CREATE TABLE IF NOT EXISTS "menu_item_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"qty_per_unit" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_item_recipes" ADD CONSTRAINT "menu_item_recipes_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_item_recipes" ADD CONSTRAINT "menu_item_recipes_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_recipes_item_ingredient_unique" ON "menu_item_recipes" USING btree ("menu_item_id","inventory_item_id");
