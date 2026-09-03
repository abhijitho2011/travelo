import { CashService } from './cash.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('CashService', () => {
  it('inflows add to the drawer, outflows take from it', () => {
    expect(CashService.signed('FOLIO_CASH', 500)).toBe(500);
    expect(CashService.signed('POS_CASH', 500)).toBe(500);
    expect(CashService.signed('WITHDRAWAL', 500)).toBe(-500);
    expect(CashService.signed('EXPENSE', 500)).toBe(-500);
  });

  it('refuses a zero or negative movement', async () => {
    await expect(
      new CashService(mockDb({}) as never).record({
        propertyId: 'p',
        kind: 'CASH_IN',
        amountPaise: 0,
      }),
    ).rejects.toThrow(/positive/);
  });

  it('closing a shift reports the handover difference against the expected sum', async () => {
    const db = mockDb({
      select: {
        staff_shifts: [
          [{ id: 'sh-1', propertyId: 'p', staffId: 'st', openingCashPaise: 100_000, note: null }],
        ],
        cash_entries: [[{ sum: 250_000 }]],
      },
      update: {
        staff_shifts: [
          {
            id: 'sh-1',
            openingCashPaise: 100_000,
            expectedCashPaise: 350_000,
            declaredCashPaise: 340_000,
          },
        ],
      },
    });
    const res = await new CashService(db as never).closeShift('p', 'st', 340_000);
    expect(res.differencePaise).toBe(-10_000);
    expect(db.updates.find((u) => u.table === 'staff_shifts')?.values).toMatchObject({
      expectedCashPaise: 350_000,
      declaredCashPaise: 340_000,
    });
  });
});
