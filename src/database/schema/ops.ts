import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  text,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { properties } from './phase2';
import { hotelStaff } from './owner';
import { reservations } from './reservations';

/**
 * Operations domains — Accounts, Inventory/Store, Sales (CRM), Travel Desk and
 * Driver. One schema file, one migration (0016), all PROPERTY-SCOPED exactly
 * like rooms/reservations/restaurant: every row is resolved by
 * (id, property_id = the caller's own); a foreign id 404s, never 403.
 *
 * MONEY IS PAISE, integer, everywhere — like room_types.base_rate and
 * reservations.rate_paise. No floats touch a rupee.
 */

// ======================================================================
//  Accounts — expense register (no double-entry ledger; a simple register
//  plus the revenue rollup the summary endpoint computes read-only from
//  reservations and restaurant orders).
// ======================================================================

export const expenseCategoryValues = [
  'UTILITIES',
  'SUPPLIES',
  'MAINTENANCE',
  'SALARY',
  'MARKETING',
  'TRAVEL',
  'FOOD_BEVERAGE',
  'RENT',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof expenseCategoryValues)[number];

/** DRAFT → APPROVED → PAID is the register lifecycle. See ops-rules.ts. */
export const expenseStatusValues = ['DRAFT', 'APPROVED', 'PAID'] as const;
export type ExpenseStatus = (typeof expenseStatusValues)[number];

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 24 }).notNull().$type<ExpenseCategory>(),
    /** Paise, integer, always non-negative. */
    amountPaise: integer('amount_paise').notNull().default(0),
    vendor: varchar('vendor', { length: 200 }),
    /** The date the expense was incurred (date-only semantics, stored as tz). */
    incurredOn: timestamp('incurred_on', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
    status: varchar('status', { length: 16 }).notNull().default('DRAFT').$type<ExpenseStatus>(),
    createdBy: uuid('created_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('expenses_property_idx').on(t.propertyId),
    propertyStatusIdx: index('expenses_property_status_idx').on(t.propertyId, t.status),
  }),
);
export type Expense = typeof expenses.$inferSelect;

// ======================================================================
//  Inventory / Store
// ======================================================================

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    sku: varchar('sku', { length: 64 }).notNull(),
    /** Unit of measure — "kg", "L", "pcs", "box". */
    unit: varchar('unit', { length: 24 }).notNull().default('pcs'),
    category: varchar('category', { length: 64 }),
    /** At or below this on-hand quantity the item shows on the low-stock list. */
    reorderLevel: integer('reorder_level').notNull().default(0),
    /** Live on-hand quantity. Only ever changed through a stock movement, in-tx. */
    currentQty: integer('current_qty').notNull().default(0),
    /**
     * Last known purchase cost per unit, integer paise. Set when a PO is
     * received (or as an opening value) and used to value on-hand stock. Not a
     * moving average — the simplest honest basis for a store dashboard.
     */
    unitCostPaise: integer('unit_cost_paise').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('inventory_items_property_idx').on(t.propertyId),
    // A deleted SKU frees the code for a new item, like room numbers.
    skuUnique: uniqueIndex('inventory_items_property_sku_unique')
      .on(t.propertyId, t.sku)
      .where(sql`deleted_at IS NULL`),
  }),
);
export type InventoryItem = typeof inventoryItems.$inferSelect;

export const stockMovementTypeValues = ['IN', 'OUT', 'ADJUST', 'WASTAGE'] as const;
export type StockMovementType = (typeof stockMovementTypeValues)[number];

/**
 * An immutable ledger line. Every change to `inventory_items.current_qty` is
 * accompanied by exactly one movement row, written in the SAME transaction, so
 * the on-hand quantity can always be reconciled against the movements.
 *
 * `qtyDelta` is the SIGNED effect on current_qty: IN and a positive ADJUST are
 * positive, OUT and WASTAGE are negative. `qty` is the magnitude the operator
 * entered, kept for display.
 */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 16 }).notNull().$type<StockMovementType>(),
    /** Magnitude entered by the operator (always positive). */
    qty: integer('qty').notNull(),
    /** Signed effect on current_qty. */
    qtyDelta: integer('qty_delta').notNull(),
    /** On-hand quantity AFTER this movement, snapshotted for the audit trail. */
    balanceAfter: integer('balance_after').notNull(),
    reason: text('reason'),
    /** Set when the movement was generated by receiving a purchase order. */
    purchaseOrderId: uuid('purchase_order_id'),
    createdBy: uuid('created_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('stock_movements_property_idx').on(t.propertyId),
    itemIdx: index('stock_movements_item_idx').on(t.itemId),
  }),
);
export type StockMovement = typeof stockMovements.$inferSelect;

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    contact: varchar('contact', { length: 120 }),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 200 }),
    address: text('address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('suppliers_property_idx').on(t.propertyId),
    nameUnique: uniqueIndex('suppliers_property_name_unique')
      .on(t.propertyId, t.name)
      .where(sql`deleted_at IS NULL`),
  }),
);
export type Supplier = typeof suppliers.$inferSelect;

/** DRAFT → SENT → RECEIVED; DRAFT/SENT → CANCELLED. See ops-rules.ts. */
export const purchaseOrderStatusValues = ['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED'] as const;
export type PurchaseOrderStatus = (typeof purchaseOrderStatusValues)[number];

/**
 * A single PO line. Stored in `lines` jsonb so a PO is one row. `itemId` links
 * to an inventory item (so receiving can create the IN movement); name and unit
 * are SNAPSHOTTED like restaurant order items, so a later item rename never
 * rewrites a PO that was already raised.
 */
export interface PurchaseOrderLine {
  itemId: string;
  nameSnapshot: string;
  unitSnapshot: string;
  qty: number;
  /** Paise per unit, integer. */
  unitPricePaise: number;
  /** qty * unitPricePaise, integer paise. */
  lineTotalPaise: number;
}

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** `PO-00001`. Per-property sequence, zero-padded to five. */
    poNumber: varchar('po_number', { length: 24 }).notNull(),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    supplierName: varchar('supplier_name', { length: 200 }),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('DRAFT')
      .$type<PurchaseOrderStatus>(),
    lines: jsonb('lines')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<PurchaseOrderLine[]>(),
    /** Sum of the line totals, integer paise. */
    totalPaise: integer('total_paise').notNull().default(0),
    note: text('note'),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('purchase_orders_property_idx').on(t.propertyId),
    propertyStatusIdx: index('purchase_orders_property_status_idx').on(t.propertyId, t.status),
    numberUnique: uniqueIndex('purchase_orders_property_number_unique').on(
      t.propertyId,
      t.poNumber,
    ),
  }),
);
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;

// ======================================================================
//  Sales — CRM
// ======================================================================

/** LEAD → CONTACTED → PROPOSAL → NEGOTIATION → CONFIRMED/LOST. See ops-rules.ts. */
export const leadStageValues = [
  'LEAD',
  'CONTACTED',
  'PROPOSAL',
  'NEGOTIATION',
  'CONFIRMED',
  'LOST',
] as const;
export type LeadStage = (typeof leadStageValues)[number];

export const leads = pgTable(
  'leads',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    company: varchar('company', { length: 200 }),
    contact: varchar('contact', { length: 120 }),
    /** Free-text acquisition source — "Website", "Referral", "OTA", ... */
    source: varchar('source', { length: 64 }),
    stage: varchar('stage', { length: 16 }).notNull().default('LEAD').$type<LeadStage>(),
    /** Estimated deal value, integer paise. */
    valuePaise: integer('value_paise').notNull().default(0),
    ownerStaffId: uuid('owner_staff_id').references(() => hotelStaff.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('leads_property_idx').on(t.propertyId),
    propertyStageIdx: index('leads_property_stage_idx').on(t.propertyId, t.stage),
  }),
);
export type Lead = typeof leads.$inferSelect;

export const salesActivityTypeValues = ['CALL', 'EMAIL', 'MEETING', 'NOTE'] as const;
export type SalesActivityType = (typeof salesActivityTypeValues)[number];

export const salesActivities = pgTable(
  'sales_activities',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 16 }).notNull().$type<SalesActivityType>(),
    note: text('note'),
    /** When the activity happened. */
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('sales_activities_property_idx').on(t.propertyId),
    leadIdx: index('sales_activities_lead_idx').on(t.leadId),
  }),
);
export type SalesActivity = typeof salesActivities.$inferSelect;

// ======================================================================
//  Travel Desk + Driver — vehicles and transport requests
// ======================================================================

export const vehicleStatusValues = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE'] as const;
export type VehicleStatus = (typeof vehicleStatusValues)[number];

export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    plate: varchar('plate', { length: 32 }).notNull(),
    seats: integer('seats').notNull().default(4),
    status: varchar('status', { length: 16 }).notNull().default('AVAILABLE').$type<VehicleStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('vehicles_property_idx').on(t.propertyId),
    plateUnique: uniqueIndex('vehicles_property_plate_unique')
      .on(t.propertyId, t.plate)
      .where(sql`deleted_at IS NULL`),
  }),
);
export type Vehicle = typeof vehicles.$inferSelect;

export const transportTypeValues = ['PICKUP', 'DROP', 'TOUR', 'RENTAL'] as const;
export type TransportType = (typeof transportTypeValues)[number];

/**
 * REQUESTED → ASSIGNED → IN_PROGRESS → COMPLETED, with CANCELLED reachable from
 * any non-terminal state. See ops-rules.ts.
 */
export const transportStatusValues = [
  'REQUESTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export type TransportStatus = (typeof transportStatusValues)[number];

/**
 * The driver's finer progress WHILE the request is IN_PROGRESS. Null until the
 * driver accepts. ACCEPTED → EN_ROUTE → ARRIVED → PICKED_UP; completing the
 * trip moves the request status to COMPLETED. See ops-rules.ts.
 */
export const driverStageValues = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP'] as const;
export type DriverStage = (typeof driverStageValues)[number];

export const transportRequests = pgTable(
  'transport_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    guestName: varchar('guest_name', { length: 200 }).notNull(),
    /** Optional link to an in-house reservation; read-only, never mutated here. */
    reservationId: uuid('reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    type: varchar('type', { length: 16 }).notNull().$type<TransportType>(),
    pickupAt: timestamp('pickup_at', { withTimezone: true }).notNull(),
    fromLocation: varchar('from_location', { length: 300 }),
    toLocation: varchar('to_location', { length: 300 }),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
    driverStaffId: uuid('driver_staff_id').references(() => hotelStaff.id, {
      onDelete: 'set null',
    }),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('REQUESTED')
      .$type<TransportStatus>(),
    driverStage: varchar('driver_stage', { length: 16 }).$type<DriverStage>(),
    /** Paise, integer. Nullable — a fare is not always known up front. */
    farePaise: integer('fare_paise'),
    note: text('note'),
    createdBy: uuid('created_by').references(() => hotelStaff.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    propertyIdx: index('transport_requests_property_idx').on(t.propertyId),
    propertyStatusIdx: index('transport_requests_property_status_idx').on(t.propertyId, t.status),
    driverIdx: index('transport_requests_driver_idx').on(t.driverStaffId),
    pickupIdx: index('transport_requests_pickup_idx').on(t.propertyId, t.pickupAt),
  }),
);
export type TransportRequest = typeof transportRequests.$inferSelect;
