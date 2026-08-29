import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  boolean,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { properties } from './phase2';
import { hotelStaff } from './owner';
import { reservations } from './reservations';

/**
 * Restaurant / F&B — the outlet that turns a table and a menu into a bill.
 *
 * Everything here is PROPERTY-SCOPED, exactly like rooms and reservations: a
 * table, a menu item, an order is only ever resolved by
 * (id, propertyId = the caller's own). Cross-property reads 404.
 *
 * MONEY IS PAISE, integer, like every other money column in this schema
 * (`room_types.base_rate`, `reservations.rate_paise`). No floats touch a rupee.
 *
 * THE ONE DESIGN RULE THAT MATTERS: a bill must never re-derive from the live
 * menu. Menus are edited constantly — a price rises, an item is renamed, a dish
 * is retired — and none of that may rewrite a bill that was already run. So an
 * `order_items` row SNAPSHOTS the item's name and price at the moment it is
 * ordered (`name_snapshot`, `price_paise_snapshot`) and the bill is computed
 * from those snapshots, never from `menu_items`. This mirrors how a reservation
 * snapshots `rate_paise` from the room type.
 */

// ---------- Tables ----------

/**
 * OPEN     — free, nobody seated.
 * OCCUPIED — an order is open against it.
 * BILLED   — the order has been billed but not yet settled/paid.
 * BLOCKED  — taken off the floor (reserved, maintenance) by a manager.
 */
export const restaurantTableStatusValues = ['OPEN', 'OCCUPIED', 'BILLED', 'BLOCKED'] as const;
export type RestaurantTableStatus = (typeof restaurantTableStatusValues)[number];

export const restaurantTables = pgTable(
  'restaurant_tables',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** Floor label — "T1", "T2", "Patio-3". Varchar, never an integer. */
    name: varchar('name', { length: 64 }).notNull(),
    seats: integer('seats').notNull().default(2),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('OPEN')
      .$type<RestaurantTableStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('restaurant_tables_property_idx').on(t.propertyId),
    // Partial: a deleted "T1" frees the name for a new one, like room numbers.
    nameUnique: uniqueIndex('restaurant_tables_property_name_unique')
      .on(t.propertyId, t.name)
      .where(sql`deleted_at IS NULL`),
  }),
);

// ---------- Menu ----------

export const menuCategoryStatusValues = ['ACTIVE', 'ARCHIVED'] as const;
export type MenuCategoryStatus = (typeof menuCategoryStatusValues)[number];

export const menuCategories = pgTable(
  'menu_categories',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('ACTIVE')
      .$type<MenuCategoryStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('menu_categories_property_idx').on(t.propertyId),
    nameUnique: uniqueIndex('menu_categories_property_name_unique')
      .on(t.propertyId, t.name)
      .where(sql`deleted_at IS NULL`),
  }),
);

/**
 * ACTIVE      — orderable.
 * UNAVAILABLE — "86'd": temporarily off, kept on the menu. The kitchen ran out.
 * ARCHIVED    — retired for good; kept only so old bills still resolve a name.
 */
export const menuItemStatusValues = ['ACTIVE', 'UNAVAILABLE', 'ARCHIVED'] as const;
export type MenuItemStatus = (typeof menuItemStatusValues)[number];

export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => menuCategories.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    /** Paise, integer. The LIVE price; each order snapshots its own copy. */
    pricePaise: integer('price_paise').notNull().default(0),
    veg: boolean('veg').notNull().default(true),
    status: varchar('status', { length: 16 }).notNull().default('ACTIVE').$type<MenuItemStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('menu_items_property_idx').on(t.propertyId),
    categoryIdx: index('menu_items_category_idx').on(t.categoryId),
    nameUnique: uniqueIndex('menu_items_property_name_unique')
      .on(t.propertyId, t.name)
      .where(sql`deleted_at IS NULL`),
  }),
);

// ---------- Orders ----------

/**
 * OPEN      — being taken/served; items may still be added.
 * BILLED    — the bill has been computed; totals are frozen on the row.
 * PAID       — settled and closed. The table is freed.
 * CANCELLED — voided by a manager before anything was served.
 */
export const restaurantOrderStatusValues = ['OPEN', 'BILLED', 'PAID', 'CANCELLED'] as const;
export type RestaurantOrderStatus = (typeof restaurantOrderStatusValues)[number];

export const restaurantPaymentMethodValues = ['CASH', 'CARD', 'UPI', 'ROOM_CHARGE'] as const;
export type RestaurantPaymentMethod = (typeof restaurantPaymentMethodValues)[number];

export const restaurantOrders = pgTable(
  'restaurant_orders',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** NULL = takeaway/counter. Otherwise the dine-in table. */
    tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'set null' }),
    /** `ORD-XXXXX`, unique PER PROPERTY: two hotels may both have ORD-00001. */
    orderNumber: varchar('order_number', { length: 32 }).notNull(),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('OPEN')
      .$type<RestaurantOrderStatus>(),
    waiterStaffId: uuid('waiter_staff_id').references(() => hotelStaff.id, { onDelete: 'set null' }),
    guestCount: integer('guest_count').notNull().default(1),
    /** All paise. Zero until the bill is run, then frozen from item snapshots. */
    subtotalPaise: integer('subtotal_paise').notNull().default(0),
    taxPaise: integer('tax_paise').notNull().default(0),
    totalPaise: integer('total_paise').notNull().default(0),
    paymentMethod: varchar('payment_method', {
      length: 16,
    }).$type<RestaurantPaymentMethod>(),
    /**
     * Set only when payment_method = ROOM_CHARGE, and only after validating the
     * reservation is CHECKED_IN at THIS property. Folio posting is deferred —
     * the charge lands on this order record, not (yet) on the room folio.
     */
    reservationId: uuid('reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    settledBy: uuid('settled_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    billedAt: timestamp('billed_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('restaurant_orders_property_idx').on(t.propertyId),
    tableIdx: index('restaurant_orders_table_idx').on(t.tableId),
    statusIdx: index('restaurant_orders_status_idx').on(t.status),
    numberUnique: uniqueIndex('restaurant_orders_property_number_unique').on(
      t.propertyId,
      t.orderNumber,
    ),
    // ONE open order per table. Partial on tableId (NULL takeaways excluded)
    // and status = OPEN, so a table can hold at most one live order at a time.
    // The service still checks in-tx; this is the belt to that suspenders.
    oneOpenPerTable: uniqueIndex('restaurant_orders_one_open_per_table')
      .on(t.tableId)
      .where(sql`status = 'OPEN' AND table_id IS NOT NULL`),
  }),
);

// ---------- Order items ----------

/**
 * The KOT (Kitchen Order Ticket) lifecycle of a single line.
 *
 * NEW       — sent to the kitchen, not yet started.
 * PREPARING — the chef is cooking it.
 * READY     — plated, waiting for the waiter.
 * SERVED    — delivered to the table.
 * CANCELLED — pulled. Allowed only while still NEW (a manager void handles the
 *             rest); a CANCELLED line is excluded from the bill.
 */
export const kotStatusValues = ['NEW', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'] as const;
export type KotStatus = (typeof kotStatusValues)[number];

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid('order_id')
      .notNull()
      .references(() => restaurantOrders.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id').references(() => menuItems.id, { onDelete: 'set null' }),
    /**
     * The correctness core. Name and price are SNAPSHOTTED from the menu item
     * at order time and the bill is computed from these — never from the live
     * `menu_items` row, which may be renamed, repriced or archived afterwards.
     */
    nameSnapshot: varchar('name_snapshot', { length: 160 }).notNull(),
    pricePaiseSnapshot: integer('price_paise_snapshot').notNull(),
    qty: integer('qty').notNull().default(1),
    notes: text('notes'),
    kotStatus: varchar('kot_status', { length: 16 }).notNull().default('NEW').$type<KotStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index('order_items_order_idx').on(t.orderId),
    kotStatusIdx: index('order_items_kot_status_idx').on(t.kotStatus),
  }),
);

// ---------- Row types ----------

export type RestaurantTable = typeof restaurantTables.$inferSelect;
export type MenuCategory = typeof menuCategories.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type RestaurantOrder = typeof restaurantOrders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
