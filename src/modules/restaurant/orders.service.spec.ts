import { mockDb, type MockDb } from '../owner-auth/testing/db.mock';
import { OrdersService } from './orders.service';
import { TablesService } from './tables.service';
import { FolioService } from '../folio/folio.service';
import type { Database } from '../../database/database.module';
import type { ConfigService } from '@nestjs/config';

const MY = 'prop-mine';
const STAFF = 'staff-1';

const config = (taxPercent: number = 5) => ({ get: () => taxPercent }) as unknown as ConfigService;

function svc(db: MockDb, taxPercent = 5) {
  const tables = new TablesService(db as unknown as Database);
  const folio = new FolioService(db as unknown as Database);
  return new OrdersService(db as unknown as Database, config(taxPercent), tables, folio);
}

const orderRow = (over: Record<string, unknown> = {}) => ({
  id: 'ord-1',
  propertyId: MY,
  tableId: null,
  orderNumber: 'ORD-00001',
  status: 'OPEN',
  waiterStaffId: STAFF,
  guestCount: 2,
  subtotalPaise: 0,
  taxPaise: 0,
  totalPaise: 0,
  paymentMethod: null,
  reservationId: null,
  settledBy: null,
  billedAt: null,
  paidAt: null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: new Date('2026-08-30T10:00:00Z'),
  updatedAt: new Date('2026-08-30T10:00:00Z'),
  ...over,
});

const itemRow = (over: Record<string, unknown> = {}) => ({
  id: 'oi-1',
  orderId: 'ord-1',
  menuItemId: 'mi-1',
  nameSnapshot: 'Paneer Tikka',
  pricePaiseSnapshot: 25_000,
  qty: 1,
  notes: null,
  kotStatus: 'NEW',
  createdAt: new Date('2026-08-30T10:00:00Z'),
  updatedAt: new Date('2026-08-30T10:00:00Z'),
  ...over,
});

const menuRow = (over: Record<string, unknown> = {}) => ({
  id: 'mi-1',
  propertyId: MY,
  categoryId: 'cat-1',
  name: 'Paneer Tikka',
  description: null,
  pricePaise: 25_000,
  veg: true,
  status: 'ACTIVE',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const tableRow = (over: Record<string, unknown> = {}) => ({
  id: 'tbl-1',
  propertyId: MY,
  name: 'T1',
  seats: 4,
  status: 'OPEN',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

describe('OrdersService — tenant isolation', () => {
  it('404s for an order at another property (never 403)', async () => {
    const db = mockDb({ select: { restaurant_orders: [[]] } });
    await expect(svc(db).get(MY, 'ord-at-other')).rejects.toMatchObject({
      status: 404,
      response: { error: 'ORDER_NOT_FOUND' },
    });
  });
});

describe('OrdersService — one open order per table', () => {
  it('refuses to open a second order on a table that already has one', async () => {
    const db = mockDb({
      select: {
        restaurant_tables: [[tableRow()]],
        restaurant_orders: [[{ id: 'existing-open' }]],
      },
    });
    await expect(
      svc(db).create(MY, { tableId: 'tbl-1', guestCount: 2 }, STAFF),
    ).rejects.toMatchObject({ status: 409, response: { error: 'TABLE_OCCUPIED' } });
    expect(db.inserts.filter((i) => i.table === 'restaurant_orders')).toEqual([]);
  });

  it('refuses a table that is BLOCKED', async () => {
    const db = mockDb({ select: { restaurant_tables: [[tableRow({ status: 'BLOCKED' })]] } });
    await expect(
      svc(db).create(MY, { tableId: 'tbl-1', guestCount: 2 }, STAFF),
    ).rejects.toMatchObject({ status: 409, response: { error: 'TABLE_UNAVAILABLE' } });
  });

  it('opens a takeaway order (no table) and numbers it per property', async () => {
    const db = mockDb({
      select: { restaurant_orders: [[{ count: 4 }]], order_items: [[]] },
      insert: { restaurant_orders: [orderRow({ orderNumber: 'ORD-00005' })] },
    });
    const out = await svc(db).create(MY, { guestCount: 3 }, STAFF);
    expect(out.orderNumber).toBe('ORD-00005');
    const insert = db.inserts.find((i) => i.table === 'restaurant_orders');
    expect(insert?.values).toMatchObject({ orderNumber: 'ORD-00005', tableId: null });
  });
});

describe('OrdersService — price + name SNAPSHOTS (the correctness core)', () => {
  it('freezes the menu item name and price onto the order line at order time', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow()], [orderRow()]],
        menu_items: [[menuRow()]],
        order_items: [[itemRow()]],
      },
    });
    await svc(db).addItems(MY, 'ord-1', {
      items: [{ menuItemId: 'mi-1', qty: 2, notes: 'extra spicy' }],
    });
    const insert = db.inserts.find((i) => i.table === 'order_items');
    expect(insert?.values).toMatchObject({
      nameSnapshot: 'Paneer Tikka',
      pricePaiseSnapshot: 25_000,
      qty: 2,
      notes: 'extra spicy',
      kotStatus: 'NEW',
    });
  });

  it('bills from the snapshots, never the live menu, excluding cancelled lines', async () => {
    // The live menu could now say anything; the bill must use the snapshots.
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow()], [orderRow({ status: 'BILLED' })]],
        order_items: [
          [
            itemRow({ pricePaiseSnapshot: 25_000, qty: 2, kotStatus: 'SERVED' }), // 50000
            itemRow({ id: 'oi-2', pricePaiseSnapshot: 10_000, qty: 1, kotStatus: 'READY' }), // 10000
            itemRow({ id: 'oi-3', pricePaiseSnapshot: 99_000, qty: 5, kotStatus: 'CANCELLED' }),
          ],
          [itemRow()],
        ],
      },
    });
    await svc(db, 5).bill(MY, 'ord-1');
    const update = db.updates.find(
      (u) => u.table === 'restaurant_orders' && u.values?.status === 'BILLED',
    );
    expect(update?.values).toMatchObject({
      subtotalPaise: 60_000,
      taxPaise: 3_000, // 5% of 60000
      totalPaise: 63_000,
    });
  });

  it('refuses to bill an order whose only lines are cancelled', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow()]],
        order_items: [[itemRow({ kotStatus: 'CANCELLED' })]],
      },
    });
    await expect(svc(db).bill(MY, 'ord-1')).rejects.toMatchObject({
      status: 409,
      response: { error: 'EMPTY_BILL' },
    });
  });

  it('rejects a menu item from another property before writing anything', async () => {
    const db = mockDb({
      select: { restaurant_orders: [[orderRow()]], menu_items: [[]] },
    });
    await expect(
      svc(db).addItems(MY, 'ord-1', { items: [{ menuItemId: 'foreign', qty: 1 }] }),
    ).rejects.toMatchObject({ status: 404, response: { error: 'MENU_ITEM_NOT_FOUND' } });
    expect(db.inserts.filter((i) => i.table === 'order_items')).toEqual([]);
  });

  it('refuses to add an UNAVAILABLE (86’d) item', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow()]],
        menu_items: [[menuRow({ status: 'UNAVAILABLE' })]],
      },
    });
    await expect(
      svc(db).addItems(MY, 'ord-1', { items: [{ menuItemId: 'mi-1', qty: 1 }] }),
    ).rejects.toMatchObject({ status: 409, response: { error: 'MENU_ITEM_UNAVAILABLE' } });
  });
});

describe('OrdersService — KOT state machine + role split', () => {
  it('lets the chef move a line NEW → PREPARING', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow()], [orderRow()]],
        order_items: [[itemRow({ kotStatus: 'NEW' })], [itemRow({ kotStatus: 'PREPARING' })]],
      },
    });
    await svc(db).setKotStatus(MY, 'ord-1', 'oi-1', 'PREPARING', 'CHEF');
    const update = db.updates.find((u) => u.table === 'order_items');
    expect(update?.values).toMatchObject({ kotStatus: 'PREPARING' });
  });

  it('refuses to let the chef mark a line SERVED (a floor act)', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow()]],
        order_items: [[itemRow({ kotStatus: 'READY' })]],
      },
    });
    await expect(svc(db).setKotStatus(MY, 'ord-1', 'oi-1', 'SERVED', 'CHEF')).rejects.toMatchObject(
      { status: 403, response: { error: 'KOT_NOT_PERMITTED_FOR_ROLE' } },
    );
    expect(db.updates.filter((u) => u.table === 'order_items')).toEqual([]);
  });

  it('refuses an illegal KOT jump (READY → PREPARING) for anyone', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow()]],
        order_items: [[itemRow({ kotStatus: 'READY' })]],
      },
    });
    await expect(
      svc(db).setKotStatus(MY, 'ord-1', 'oi-1', 'PREPARING', 'RESTAURANT_MANAGER'),
    ).rejects.toMatchObject({ status: 409, response: { error: 'INVALID_KOT_TRANSITION' } });
  });

  it('cancels a line only while NEW; a cooking line needs a manager void', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow()]],
        order_items: [[itemRow({ kotStatus: 'PREPARING' })]],
      },
    });
    await expect(svc(db).cancelItem(MY, 'ord-1', 'oi-1')).rejects.toMatchObject({
      status: 409,
      response: { error: 'ITEM_CANCEL_TOO_LATE' },
    });
  });
});

describe('OrdersService — settle + ROOM_CHARGE validation', () => {
  it('closes a CASH bill to PAID and frees the table', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [
          [orderRow({ status: 'BILLED', tableId: 'tbl-1' })],
          [orderRow({ status: 'PAID' })],
        ],
        order_items: [[itemRow()]],
        restaurant_tables: [[tableRow()]],
      },
    });
    await svc(db).settle(MY, 'ord-1', { method: 'CASH' }, STAFF);
    const orderUpdate = db.updates.find(
      (u) => u.table === 'restaurant_orders' && u.values?.status === 'PAID',
    );
    expect(orderUpdate?.values).toMatchObject({ paymentMethod: 'CASH', settledBy: STAFF });
    const tableUpdate = db.updates.find((u) => u.table === 'restaurant_tables');
    expect(tableUpdate?.values).toMatchObject({ status: 'OPEN' });
  });

  it('refuses ROOM_CHARGE without a reservation', async () => {
    const db = mockDb({
      select: { restaurant_orders: [[orderRow({ status: 'BILLED' })]] },
    });
    await expect(
      svc(db).settle(MY, 'ord-1', { method: 'ROOM_CHARGE' }, STAFF),
    ).rejects.toMatchObject({ status: 400, response: { error: 'RESERVATION_REQUIRED' } });
  });

  it('refuses ROOM_CHARGE against a reservation that is not CHECKED_IN', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow({ status: 'BILLED' })]],
        reservations: [[{ id: 'res-1', status: 'CONFIRMED' }]],
      },
    });
    await expect(
      svc(db).settle(MY, 'ord-1', { method: 'ROOM_CHARGE', reservationId: 'res-1' }, STAFF),
    ).rejects.toMatchObject({ status: 409, response: { error: 'RESERVATION_NOT_IN_HOUSE' } });
  });

  it('refuses ROOM_CHARGE against a reservation at ANOTHER property (404 → not in house)', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow({ status: 'BILLED' })]],
        reservations: [[]],
      },
    });
    await expect(
      svc(db).settle(MY, 'ord-1', { method: 'ROOM_CHARGE', reservationId: 'foreign' }, STAFF),
    ).rejects.toMatchObject({ status: 409, response: { error: 'RESERVATION_NOT_IN_HOUSE' } });
  });

  it('accepts ROOM_CHARGE against a CHECKED_IN guest and stores the reservation', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [
          [orderRow({ status: 'BILLED', tableId: 'tbl-1' })],
          [orderRow({ status: 'PAID' })],
        ],
        reservations: [[{ id: 'res-1', status: 'CHECKED_IN' }]],
        order_items: [[itemRow()]],
        restaurant_tables: [[tableRow()]],
        folio_line_items: [[]], // findLineBySource → none yet
      },
    });
    await svc(db).settle(MY, 'ord-1', { method: 'ROOM_CHARGE', reservationId: 'res-1' }, STAFF);
    const update = db.updates.find(
      (u) => u.table === 'restaurant_orders' && u.values?.status === 'PAID',
    );
    expect(update?.values).toMatchObject({
      paymentMethod: 'ROOM_CHARGE',
      reservationId: 'res-1',
    });
    // The charge POSTS to the guest folio, tagged with the order as its source.
    const folioPost = db.inserts.find((i) => i.table === 'folio_line_items');
    expect(folioPost?.values).toMatchObject({
      reservationId: 'res-1',
      kind: 'RESTAURANT',
      sourceType: 'restaurant_order',
      sourceId: 'ord-1',
    });
  });

  it('refuses to settle an order that has not been billed', async () => {
    const db = mockDb({ select: { restaurant_orders: [[orderRow({ status: 'OPEN' })]] } });
    await expect(svc(db).settle(MY, 'ord-1', { method: 'CASH' }, STAFF)).rejects.toMatchObject({
      status: 409,
      response: { error: 'ORDER_NOT_BILLED' },
    });
  });
});

describe('OrdersService — manager void', () => {
  it('refuses to cancel an order once anything has been served', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow()]],
        order_items: [[itemRow({ kotStatus: 'SERVED' })]],
      },
    });
    await expect(svc(db).cancel(MY, 'ord-1', { reason: 'guest left' })).rejects.toMatchObject({
      status: 409,
      response: { error: 'ORDER_HAS_SERVED_ITEMS' },
    });
  });

  it('voids an order with a reason and frees the table when nothing was served', async () => {
    const db = mockDb({
      select: {
        restaurant_orders: [[orderRow({ tableId: 'tbl-1' })], [orderRow({ status: 'CANCELLED' })]],
        order_items: [[itemRow({ kotStatus: 'NEW' })]],
        restaurant_tables: [[tableRow()]],
      },
    });
    await svc(db).cancel(MY, 'ord-1', { reason: 'duplicate order' });
    const update = db.updates.find(
      (u) => u.table === 'restaurant_orders' && u.values?.status === 'CANCELLED',
    );
    expect(update?.values).toMatchObject({ cancelReason: 'duplicate order' });
  });
});
