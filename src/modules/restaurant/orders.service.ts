import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, eq, gte, inArray, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  menuItems,
  orderItems,
  reservations,
  restaurantOrders,
  restaurantTables,
  type KotStatus,
  type OrderItem,
  type RestaurantOrder,
  type RestaurantPaymentMethod,
} from '../../database/schema';
import {
  AddOrderItemsDto,
  CancelOrderDto,
  CreateOrderDto,
  OrderFilterDto,
  SettleOrderDto,
} from './dto';
import { RestaurantErrors } from './restaurant-errors';
import {
  assertKotTransition,
  assertOrderTransition,
  computeBill,
  countsTowardsBill,
  formatOrderNumber,
  KITCHEN_ACTIVE_KOT,
  resolveTaxPercent,
  roleMaySetKot,
} from './restaurant-rules';
import { TablesService, type Tx } from './tables.service';

const MAX_LIMIT = 200;
/** Order numbers are derived from a count; a concurrent create can race. */
const NUMBER_ATTEMPTS = 5;

/**
 * Orders — where a table and a menu become a bill.
 *
 * The rules that run through every method:
 *
 *  1. TENANT ISOLATION. An order, a table, a menu item, a reservation is only
 *     ever resolved by (id, propertyId = the caller's own). Cross-property 404s.
 *
 *  2. ONE OPEN ORDER PER TABLE, and opening one sets the table OCCUPIED. The
 *     check runs INSIDE the transaction, backed by a partial unique index, so
 *     two waiters opening the same table cannot both win.
 *
 *  3. PRICE + NAME SNAPSHOTS. When an item is added, its name and price are
 *     copied from the live menu onto the order line. Every bill is computed
 *     from those snapshots — never the live menu — so a later menu edit never
 *     rewrites a bill already taken.
 *
 *  4. TWO STATE MACHINES, in restaurant-rules.ts. Every order and KOT status
 *     change goes through `assertOrderTransition` / `assertKotTransition`.
 */
@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly tables: TablesService,
  ) {}

  private taxPercent(): number {
    return resolveTaxPercent(this.config.get<number>('RESTAURANT_TAX_PERCENT'));
  }

  // ---------- Resolution ----------

  /** The single choke point for an order: (id, propertyId) or 404. */
  async requireOrder(propertyId: string, id: string, tx: Tx = this.db): Promise<RestaurantOrder> {
    const [row] = await tx
      .select()
      .from(restaurantOrders)
      .where(and(eq(restaurantOrders.id, id), eq(restaurantOrders.propertyId, propertyId)))
      .limit(1);
    if (!row) throw RestaurantErrors.orderNotFound();
    return row;
  }

  private async itemsFor(orderId: string, tx: Tx = this.db): Promise<OrderItem[]> {
    return tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.createdAt));
  }

  static itemToDto(i: OrderItem) {
    return {
      id: i.id,
      orderId: i.orderId,
      menuItemId: i.menuItemId,
      name: i.nameSnapshot,
      pricePaise: i.pricePaiseSnapshot,
      qty: i.qty,
      lineTotalPaise: i.pricePaiseSnapshot * i.qty,
      notes: i.notes,
      kotStatus: i.kotStatus,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }

  static toDto(o: RestaurantOrder, items: OrderItem[], table?: { id: string; name: string }) {
    return {
      id: o.id,
      propertyId: o.propertyId,
      orderNumber: o.orderNumber,
      tableId: o.tableId,
      tableName: table?.name ?? null,
      status: o.status,
      waiterStaffId: o.waiterStaffId,
      guestCount: o.guestCount,
      subtotalPaise: o.subtotalPaise,
      taxPaise: o.taxPaise,
      totalPaise: o.totalPaise,
      paymentMethod: o.paymentMethod,
      reservationId: o.reservationId,
      settledBy: o.settledBy,
      billedAt: o.billedAt,
      paidAt: o.paidAt,
      cancelledAt: o.cancelledAt,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      items: items.map(OrdersService.itemToDto),
    };
  }

  private async hydrate(o: RestaurantOrder, tx: Tx = this.db) {
    const items = await this.itemsFor(o.id, tx);
    let table: { id: string; name: string } | undefined;
    if (o.tableId) {
      const [t] = await tx
        .select({ id: restaurantTables.id, name: restaurantTables.name })
        .from(restaurantTables)
        .where(eq(restaurantTables.id, o.tableId))
        .limit(1);
      table = t;
    }
    return OrdersService.toDto(o, items, table);
  }

  // ---------- Reads ----------

  async list(propertyId: string, params: OrderFilterDto, myStaffId?: string) {
    const limit = Math.min(params.limit ?? 50, MAX_LIMIT);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [eq(restaurantOrders.propertyId, propertyId)];
    if (params.status) conds.push(eq(restaurantOrders.status, params.status));
    if (params.tableId) conds.push(eq(restaurantOrders.tableId, params.tableId));
    if (params.mine && myStaffId) conds.push(eq(restaurantOrders.waiterStaffId, myStaffId));
    const where = and(...conds);

    const rows = await this.db
      .select()
      .from(restaurantOrders)
      .where(where)
      .orderBy(desc(restaurantOrders.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(restaurantOrders)
      .where(where);

    // Batch the lines and table names for the page in two queries.
    const orderIds = rows.map((r) => r.id);
    const tableIds = [...new Set(rows.map((r) => r.tableId).filter((x): x is string => !!x))];
    const lines = orderIds.length
      ? await this.db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
      : [];
    const linesByOrder = new Map<string, OrderItem[]>();
    for (const l of lines) {
      const list = linesByOrder.get(l.orderId);
      if (list) list.push(l);
      else linesByOrder.set(l.orderId, [l]);
    }
    const tableById = new Map<string, { id: string; name: string }>();
    if (tableIds.length) {
      const trows = await this.db
        .select({ id: restaurantTables.id, name: restaurantTables.name })
        .from(restaurantTables)
        .where(inArray(restaurantTables.id, tableIds));
      for (const t of trows) tableById.set(t.id, t);
    }

    const items = rows.map((o) =>
      OrdersService.toDto(
        o,
        linesByOrder.get(o.id) ?? [],
        o.tableId ? tableById.get(o.tableId) : undefined,
      ),
    );
    return { items, total: count, limit, offset };
  }

  async get(propertyId: string, id: string) {
    const order = await this.requireOrder(propertyId, id);
    return this.hydrate(order);
  }

  // ---------- Create ----------

  async create(propertyId: string, dto: CreateOrderDto, waiterStaffId: string | null) {
    for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
      try {
        const order = await this.db.transaction(async (trx) => {
          const tx = trx as unknown as Tx;

          if (dto.tableId) {
            const table = await this.tables.requireTable(propertyId, dto.tableId, tx);
            if (table.status === 'BLOCKED') {
              throw RestaurantErrors.tableUnavailable(table.name, table.status);
            }
            // One OPEN order per table. The partial unique index is the real
            // guarantee; this makes the refusal a clean typed error, not a 23505.
            const existing = await tx
              .select({ id: restaurantOrders.id })
              .from(restaurantOrders)
              .where(
                and(eq(restaurantOrders.tableId, dto.tableId), eq(restaurantOrders.status, 'OPEN')),
              )
              .limit(1);
            if (existing.length > 0) throw RestaurantErrors.tableOccupied(table.name);
          }

          const [{ count }] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(restaurantOrders)
            .where(eq(restaurantOrders.propertyId, propertyId));

          const [created] = await tx
            .insert(restaurantOrders)
            .values({
              propertyId,
              tableId: dto.tableId ?? null,
              orderNumber: formatOrderNumber((count ?? 0) + 1 + attempt),
              guestCount: dto.guestCount,
              waiterStaffId,
            })
            .returning();

          if (dto.tableId) await TablesService.setStatus(tx, dto.tableId, 'OCCUPIED');
          return created;
        });
        return this.hydrate(order);
      } catch (err) {
        if ((err as { code?: string }).code === '23505' && attempt < NUMBER_ATTEMPTS - 1) continue;
        throw err;
      }
    }
    /* istanbul ignore next — the loop returns or rethrows. */
    throw RestaurantErrors.orderNotFound();
  }

  // ---------- Add items (snapshotting) ----------

  async addItems(propertyId: string, orderId: string, dto: AddOrderItemsDto) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const order = await this.requireOrder(propertyId, orderId, tx);
      if (order.status !== 'OPEN') throw RestaurantErrors.orderNotOpen();

      // Resolve every menu item up front, scoped to this property, so a foreign
      // or missing item 404s before anything is written.
      const ids = [...new Set(dto.items.map((i) => i.menuItemId))];
      const menuRows = await tx
        .select()
        .from(menuItems)
        .where(and(eq(menuItems.propertyId, propertyId), inArray(menuItems.id, ids)));
      const byId = new Map(menuRows.map((m) => [m.id, m]));

      for (const line of dto.items) {
        const item = byId.get(line.menuItemId);
        if (!item || item.deletedAt) throw RestaurantErrors.menuItemNotFound();
        if (item.status !== 'ACTIVE') throw RestaurantErrors.itemUnavailable(item.name);
      }

      for (const line of dto.items) {
        const item = byId.get(line.menuItemId)!;
        await tx.insert(orderItems).values({
          orderId,
          menuItemId: item.id,
          // THE SNAPSHOT: name and price frozen at order time.
          nameSnapshot: item.name,
          pricePaiseSnapshot: item.pricePaise,
          qty: line.qty,
          notes: line.notes ?? null,
          kotStatus: 'NEW',
        });
      }

      await tx
        .update(restaurantOrders)
        .set({ updatedAt: new Date() })
        .where(eq(restaurantOrders.id, orderId));

      const refreshed = await this.requireOrder(propertyId, orderId, tx);
      return this.hydrate(refreshed, tx);
    });
  }

  // ---------- KOT transitions ----------

  private async requireOrderItem(
    propertyId: string,
    orderId: string,
    itemId: string,
    tx: Tx,
  ): Promise<{ order: RestaurantOrder; item: OrderItem }> {
    const order = await this.requireOrder(propertyId, orderId, tx);
    const [item] = await tx
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
      .limit(1);
    if (!item) throw RestaurantErrors.orderItemNotFound();
    return { order, item };
  }

  /**
   * Advance a KOT line. The single `kot.update` permission gates the endpoint;
   * `roleMaySetKot` is what stops a chef marking SERVED or a waiter marking
   * PREPARING — and `assertKotTransition` enforces the state machine itself.
   */
  async setKotStatus(
    propertyId: string,
    orderId: string,
    itemId: string,
    to: KotStatus,
    role: string,
  ) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const { order, item } = await this.requireOrderItem(propertyId, orderId, itemId, tx);
      if (order.status !== 'OPEN') throw RestaurantErrors.orderNotOpen();
      if (!roleMaySetKot(role, to)) throw RestaurantErrors.kotNotPermittedForRole(to);
      assertKotTransition(item.kotStatus, to);
      await tx
        .update(orderItems)
        .set({ kotStatus: to, updatedAt: new Date() })
        .where(eq(orderItems.id, itemId));
      const refreshed = await this.requireOrder(propertyId, orderId, tx);
      return this.hydrate(refreshed, tx);
    });
  }

  /** Cancel a single line. Allowed ONLY while NEW; anything cooked needs a void. */
  async cancelItem(propertyId: string, orderId: string, itemId: string) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const { order, item } = await this.requireOrderItem(propertyId, orderId, itemId, tx);
      if (order.status !== 'OPEN') throw RestaurantErrors.orderNotOpen();
      if (item.kotStatus !== 'NEW') throw RestaurantErrors.itemCancelTooLate();
      await tx
        .update(orderItems)
        .set({ kotStatus: 'CANCELLED', updatedAt: new Date() })
        .where(eq(orderItems.id, itemId));
      const refreshed = await this.requireOrder(propertyId, orderId, tx);
      return this.hydrate(refreshed, tx);
    });
  }

  // ---------- Bill ----------

  async bill(propertyId: string, orderId: string) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const order = await this.requireOrder(propertyId, orderId, tx);
      assertOrderTransition(order.status, 'BILLED');

      const lines = await this.itemsFor(orderId, tx);
      const active = lines.filter((l) => countsTowardsBill(l.kotStatus));
      if (active.length === 0) throw RestaurantErrors.emptyBill();

      const totals = computeBill(lines, this.taxPercent());
      await tx
        .update(restaurantOrders)
        .set({
          status: 'BILLED',
          subtotalPaise: totals.subtotalPaise,
          taxPaise: totals.taxPaise,
          totalPaise: totals.totalPaise,
          billedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(restaurantOrders.id, orderId));
      if (order.tableId) await TablesService.setStatus(tx, order.tableId, 'BILLED');

      const refreshed = await this.requireOrder(propertyId, orderId, tx);
      return this.hydrate(refreshed, tx);
    });
  }

  // ---------- Settle ----------

  async settle(
    propertyId: string,
    orderId: string,
    dto: SettleOrderDto,
    settledByStaffId: string | null,
  ) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const order = await this.requireOrder(propertyId, orderId, tx);
      if (order.status !== 'BILLED') throw RestaurantErrors.orderNotBilled();
      assertOrderTransition(order.status, 'PAID');

      let reservationId: string | null = null;
      if (dto.method === 'ROOM_CHARGE') {
        if (!dto.reservationId) throw RestaurantErrors.reservationRequired();
        // The room charge must land on a guest actually in-house at THIS
        // property. Anything else — wrong hotel, not yet arrived, already
        // departed — is refused. Folio posting is deferred; we store the link.
        const [res] = await tx
          .select({ id: reservations.id, status: reservations.status })
          .from(reservations)
          .where(
            and(eq(reservations.id, dto.reservationId), eq(reservations.propertyId, propertyId)),
          )
          .limit(1);
        if (!res || res.status !== 'CHECKED_IN') throw RestaurantErrors.reservationNotInHouse();
        reservationId = res.id;
      }

      await tx
        .update(restaurantOrders)
        .set({
          status: 'PAID',
          paymentMethod: dto.method as RestaurantPaymentMethod,
          reservationId,
          settledBy: settledByStaffId,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(restaurantOrders.id, orderId));
      // Settling frees the table back to OPEN for the next cover.
      if (order.tableId) await TablesService.setStatus(tx, order.tableId, 'OPEN');

      const refreshed = await this.requireOrder(propertyId, orderId, tx);
      return this.hydrate(refreshed, tx);
    });
  }

  // ---------- Cancel (manager void) ----------

  async cancel(propertyId: string, orderId: string, dto: CancelOrderDto) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const order = await this.requireOrder(propertyId, orderId, tx);
      assertOrderTransition(order.status, 'CANCELLED');

      // Refuse once anything has been served — that food left the kitchen and
      // someone ate it. Bill it; do not make it vanish.
      const lines = await this.itemsFor(orderId, tx);
      if (lines.some((l) => l.kotStatus === 'SERVED')) {
        throw RestaurantErrors.orderHasServedItems();
      }

      await tx
        .update(restaurantOrders)
        .set({
          status: 'CANCELLED',
          cancelReason: dto.reason,
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(restaurantOrders.id, orderId));
      if (order.tableId) await TablesService.setStatus(tx, order.tableId, 'OPEN');

      const refreshed = await this.requireOrder(propertyId, orderId, tx);
      return this.hydrate(refreshed, tx);
    });
  }

  // ---------- Kitchen display ----------

  /**
   * One call for the KDS: every non-SERVED, non-CANCELLED line on an OPEN
   * order, grouped by order, with table name and elapsed seconds, oldest order
   * first. No pagination — a kitchen sees everything on the pass at once.
   */
  async kitchen(propertyId: string, now: Date = new Date()) {
    const rows = await this.db
      .select({
        order: restaurantOrders,
        item: orderItems,
        tableName: restaurantTables.name,
      })
      .from(orderItems)
      .innerJoin(restaurantOrders, eq(orderItems.orderId, restaurantOrders.id))
      .leftJoin(restaurantTables, eq(restaurantOrders.tableId, restaurantTables.id))
      .where(
        and(
          eq(restaurantOrders.propertyId, propertyId),
          eq(restaurantOrders.status, 'OPEN'),
          inArray(orderItems.kotStatus, [...KITCHEN_ACTIVE_KOT]),
        ),
      )
      .orderBy(asc(restaurantOrders.createdAt), asc(orderItems.createdAt));

    const byOrder = new Map<
      string,
      {
        orderId: string;
        orderNumber: string;
        tableId: string | null;
        tableName: string | null;
        guestCount: number;
        placedAt: Date;
        elapsedSeconds: number;
        items: ReturnType<typeof OrdersService.itemToDto>[];
      }
    >();
    for (const r of rows) {
      let group = byOrder.get(r.order.id);
      if (!group) {
        group = {
          orderId: r.order.id,
          orderNumber: r.order.orderNumber,
          tableId: r.order.tableId,
          tableName: r.tableName ?? null,
          guestCount: r.order.guestCount,
          placedAt: r.order.createdAt,
          elapsedSeconds: Math.max(
            0,
            Math.floor((now.getTime() - new Date(r.order.createdAt).getTime()) / 1000),
          ),
          items: [],
        };
        byOrder.set(r.order.id, group);
      }
      group.items.push(OrdersService.itemToDto(r.item));
    }
    return { orders: [...byOrder.values()] };
  }

  // ---------- Manager / cashier summary ----------

  /**
   * Today's outlet dashboard, one call: revenue from PAID orders since the
   * given day boundary, the count of open orders, tables by status, and a
   * breakdown of revenue by payment method.
   */
  async summary(propertyId: string, since: Date) {
    const paidToday = await this.db
      .select({
        method: restaurantOrders.paymentMethod,
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${restaurantOrders.totalPaise}), 0)::int`,
      })
      .from(restaurantOrders)
      .where(
        and(
          eq(restaurantOrders.propertyId, propertyId),
          eq(restaurantOrders.status, 'PAID'),
          gte(restaurantOrders.paidAt, since),
        ),
      )
      .groupBy(restaurantOrders.paymentMethod);

    let revenuePaise = 0;
    let paidOrders = 0;
    const methodBreakdown: Record<string, { count: number; revenuePaise: number }> = {};
    for (const row of paidToday) {
      revenuePaise += row.revenue;
      paidOrders += row.count;
      if (row.method) methodBreakdown[row.method] = { count: row.count, revenuePaise: row.revenue };
    }

    const [openRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(restaurantOrders)
      .where(and(eq(restaurantOrders.propertyId, propertyId), eq(restaurantOrders.status, 'OPEN')));

    const tableRows = await this.db
      .select({
        status: restaurantTables.status,
        count: sql<number>`count(*)::int`,
      })
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.propertyId, propertyId),
          sql`${restaurantTables.deletedAt} IS NULL`,
        ),
      )
      .groupBy(restaurantTables.status);
    const tablesByStatus: Record<string, number> = {};
    for (const t of tableRows) tablesByStatus[t.status] = t.count;

    return {
      revenuePaise,
      paidOrders,
      openOrders: openRow?.count ?? 0,
      tablesByStatus,
      methodBreakdown,
    };
  }
}
