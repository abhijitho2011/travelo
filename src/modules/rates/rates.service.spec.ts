import { RatesService } from './rates.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('RatesService', () => {
  it('refuses an override whose end is before its start', async () => {
    const db = mockDb({});
    await expect(
      new RatesService(db as never).create('p1', {
        roomTypeId: 't1',
        startDate: '2026-12-31',
        endDate: '2026-12-01',
        ratePaise: 900000,
      }),
    ).rejects.toThrow(/endDate/);
  });

  it('404s when the room type is not at this property', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(
      new RatesService(db as never).create('p1', {
        roomTypeId: 't1',
        startDate: '2026-12-20',
        endDate: '2027-01-05',
        ratePaise: 900000,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('RatesService — the day table, resolved', () => {
  const PROP = 'prop-1';
  const T = 'type-1';

  it('resolves day → override → base, night by night', async () => {
    const db = mockDb({
      select: {
        room_types: [[{ baseRate: 300_000 }]],
        rate_inventory_days: [[{ roomTypeId: T, date: '2026-09-11', pricePaise: 500_000 }]],
        rate_overrides: [[{ startDate: '2026-09-12', endDate: '2026-09-20', ratePaise: 400_000 }]],
      },
    });
    const nights = await new RatesService(db as never).nightlyPrices(
      PROP,
      T,
      '2026-09-10',
      '2026-09-13',
    );
    expect(nights).toEqual([
      { date: '2026-09-10', pricePaise: 300_000, source: 'base' },
      { date: '2026-09-11', pricePaise: 500_000, source: 'day' },
      { date: '2026-09-12', pricePaise: 400_000, source: 'override' },
    ]);
  });

  it('the grid caps availability at the day cap and zeroes it on stop-sell', async () => {
    const db = mockDb({
      select: {
        room_types: [[{ id: T, name: 'Deluxe', baseRate: 300_000, isPrivate: false }]],
        rooms: [[{ roomTypeId: T, count: 10 }]],
        rate_inventory_days: [
          [
            {
              roomTypeId: T,
              date: '2026-09-10',
              available: 4,
              stopSell: false,
              channelOverrides: {},
            },
            { roomTypeId: T, date: '2026-09-11', stopSell: true, channelOverrides: {} },
          ],
        ],
        rate_overrides: [[]],
        reservations: [[{ roomTypeId: T, checkIn: '2026-09-10', checkOut: '2026-09-12' }]],
      },
    });
    const g = await new RatesService(db as never).grid(PROP, '2026-09-10', '2026-09-12');
    const [d10, d11] = g.roomTypes[0].days;
    expect(d10).toMatchObject({ physical: 10, sold: 1, cap: 4, available: 4 });
    expect(d11).toMatchObject({ stopSell: true, available: 0 });
  });

  it('bulk update writes only cells that change, all under one batch id', async () => {
    const db = mockDb({
      select: {
        room_types: [[{ id: T }]],
        rate_inventory_days: [
          [{ id: 'd1', roomTypeId: T, date: '2026-09-10', pricePaise: 500_000, minLos: 2 }],
        ],
      },
      insert: { rate_inventory_days: [{}], rate_change_log: [{}] },
      update: { rate_inventory_days: [] },
    });
    const res = await new RatesService(db as never).bulkUpdate(PROP, {
      roomTypeIds: [T],
      ranges: [{ from: '2026-09-10', to: '2026-09-11' }],
      set: { minLos: 2, stopSell: true }, // minLos unchanged on the 10th; stopSell new on both
      actorStaffId: 'st-1',
    });
    expect(res.cells).toBe(2);
    expect(res.changed).toBe(2);
    expect(res.batchId).toEqual(expect.any(String));
    // The 10th existed → updated; the 11th did not → inserted.
    expect(db.updates.filter((u) => u.table === 'rate_inventory_days')).toHaveLength(1);
    expect(db.inserts.filter((i) => i.table === 'rate_inventory_days')).toHaveLength(1);
    // Only the stop_sell change is logged for the 10th — minLos was already 2.
    const logs = db.inserts.filter((i) => i.table === 'rate_change_log');
    const first = logs[0].values as unknown as { field: string }[];
    expect(first.map((l) => l.field)).toEqual(['stop_sell']);
  });

  it('refuses a window longer than a year, or that ends before it starts', () => {
    expect(() => RatesService.assertWindow('2026-09-10', '2026-09-10')).toThrow();
    expect(() => RatesService.assertWindow('2026-01-01', '2027-06-01')).toThrow(/at most/);
    expect(() => RatesService.assertWindow('2026-01-01', '2026-12-31')).not.toThrow();
  });
});
