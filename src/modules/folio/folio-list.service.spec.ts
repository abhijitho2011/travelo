import { mockDb, sqlText } from '../owner-auth/testing/db.mock';
import { FolioListService } from './folio-list.service';

const MY_PROPERTY = 'prop-mine';
const UPDATED = new Date('2026-09-04T08:00:00.000Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'res-1',
  reservationNumber: 'RSV-000001',
  guestName: 'Asha Menon',
  status: 'CHECKED_IN',
  checkIn: '2026-09-03',
  checkOut: '2026-09-06',
  updatedAt: UPDATED,
  roomNumber: '101',
  ...over,
});

/** A folio stub keyed by reservation id — the tax-inclusive figures the list must echo. */
function folioWith(summaries: Record<string, { charges: number; paid: number }>) {
  return {
    summary: jest.fn(async (id: string) => {
      const s = summaries[id] ?? { charges: 0, paid: 0 };
      return {
        reservationId: id,
        chargesPaise: s.charges,
        netPaidPaise: s.paid,
        balancePaise: s.charges - s.paid,
      };
    }),
  };
}

describe('FolioListService.list', () => {
  it('lists open folios with the authoritative tax-inclusive figures and totals', async () => {
    const db = mockDb({
      select: {
        reservations: [
          [
            row(),
            row({
              id: 'res-2',
              reservationNumber: 'RSV-000002',
              guestName: 'Ravi',
              roomNumber: null,
            }),
          ],
        ],
      },
    });
    const folio = folioWith({
      'res-1': { charges: 560_000, paid: 200_000 },
      'res-2': { charges: 118_000, paid: 0 },
    });
    const res = await new FolioListService(db as never, folio as never).list(MY_PROPERTY);

    expect(res.items).toEqual([
      {
        reservationId: 'res-1',
        code: 'RSV-000001',
        guestName: 'Asha Menon',
        roomNumber: '101',
        status: 'CHECKED_IN',
        checkIn: '2026-09-03',
        checkOut: '2026-09-06',
        totalPaise: 560_000,
        paidPaise: 200_000,
        balancePaise: 360_000,
        updatedAt: UPDATED,
      },
      expect.objectContaining({
        reservationId: 'res-2',
        roomNumber: null,
        totalPaise: 118_000,
        paidPaise: 0,
        balancePaise: 118_000,
      }),
    ]);
    expect(res.totals).toEqual({ count: 2, balancePaise: 478_000 });
    // The figures come from the folio, never recomputed here.
    expect(folio.summary).toHaveBeenCalledWith('res-1');
    expect(folio.summary).toHaveBeenCalledWith('res-2');
  });

  it('open scope drops a candidate whose real (tax-inclusive) balance is settled', async () => {
    const db = mockDb({
      select: { reservations: [[row(), row({ id: 'res-2' })]] },
    });
    const folio = folioWith({
      'res-1': { charges: 100_000, paid: 100_000 },
      'res-2': { charges: 100_000, paid: 40_000 },
    });
    const res = await new FolioListService(db as never, folio as never).list(MY_PROPERTY, {
      scope: 'open',
    });
    expect(res.items.map((i) => i.reservationId)).toEqual(['res-2']);
    expect(res.totals).toEqual({ count: 1, balancePaise: 60_000 });

    const where = sqlText(db.wheresFor('reservations')[0]);
    expect(where).toContain('CHECKED_IN');
    expect(where).toContain('paid_paise');
    expect(where).toContain('total_paise');
  });

  it('inhouse and all scopes keep settled folios and filter by status only', async () => {
    const db = mockDb({ select: { reservations: [[row()], [row()]] } });
    const folio = folioWith({ 'res-1': { charges: 100_000, paid: 100_000 } });
    const svc = new FolioListService(db as never, folio as never);

    const inhouse = await svc.list(MY_PROPERTY, { scope: 'inhouse' });
    expect(inhouse.items).toHaveLength(1);
    expect(inhouse.totals).toEqual({ count: 1, balancePaise: 0 });
    const inhouseWhere = sqlText(db.wheresFor('reservations')[0]);
    expect(inhouseWhere).toContain('CHECKED_IN');
    expect(inhouseWhere).not.toContain('paid_paise');

    const all = await svc.list(MY_PROPERTY, { scope: 'all' });
    expect(all.items).toHaveLength(1);
    const allWhere = sqlText(db.wheresFor('reservations')[1]);
    expect(allWhere).toContain('CHECKED_OUT');
    expect(allWhere).not.toContain('paid_paise');
  });

  it('is scoped to the caller’s property and excludes deleted rows', async () => {
    const db = mockDb({ select: { reservations: [[]] } });
    const res = await new FolioListService(db as never, folioWith({}) as never).list(MY_PROPERTY);
    expect(res).toEqual({ items: [], totals: { count: 0, balancePaise: 0 } });

    const where = sqlText(db.wheresFor('reservations')[0]);
    expect(where).toContain(MY_PROPERTY);
    expect(where).toContain('deleted_at is null');
  });

  it('q matches guest name, booking code or room number', async () => {
    const db = mockDb({ select: { reservations: [[]] } });
    await new FolioListService(db as never, folioWith({}) as never).list(MY_PROPERTY, {
      q: '101',
    });
    const where = sqlText(db.wheresFor('reservations')[0]);
    expect(where).toContain('%101%');
    expect(where).toContain('guest_name');
    expect(where).toContain('reservation_number');
    expect(where).toContain('number');
  });
});
