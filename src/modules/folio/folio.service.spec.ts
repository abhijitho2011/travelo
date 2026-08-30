import { FolioService } from './folio.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('FolioService.summary — the authoritative balance', () => {
  it('adds ancillary charges to the room total and subtracts net payments', async () => {
    const db = mockDb({
      select: {
        reservations: [[{ totalPaise: 500_000 }]], // room = ₹5000
        folio_line_items: [
          [
            { id: 'l1', amountPaise: 120_000, kind: 'RESTAURANT', direction: undefined },
            { id: 'l2', amountPaise: 80_000, kind: 'SPA' },
          ],
        ],
        folio_payments: [
          [
            { id: 'p1', direction: 'PAYMENT', amountPaise: 300_000 },
            { id: 'p2', direction: 'REFUND', amountPaise: 20_000 },
            { id: 'p3', direction: 'PAYMENT', amountPaise: 50_000 },
          ],
        ],
      },
    });
    const svc = new FolioService(db as never);
    const s = await svc.summary('res-1');
    expect(s.roomChargePaise).toBe(500_000);
    expect(s.ancillaryPaise).toBe(200_000); // 120k + 80k
    expect(s.chargesPaise).toBe(700_000);
    expect(s.paymentsPaise).toBe(350_000); // 300k + 50k
    expect(s.refundsPaise).toBe(20_000);
    expect(s.netPaidPaise).toBe(330_000); // 350k - 20k
    expect(s.balancePaise).toBe(370_000); // 700k - 330k
  });

  it('reports the room total as the balance when nothing else is on the folio', async () => {
    const db = mockDb({
      select: {
        reservations: [[{ totalPaise: 500_000 }]],
        folio_line_items: [[]],
        folio_payments: [[]],
      },
    });
    const svc = new FolioService(db as never);
    const s = await svc.summary('res-1');
    expect(s.balancePaise).toBe(500_000);
    expect(s.netPaidPaise).toBe(0);
  });
});

describe('FolioService.postCharge — idempotent by source', () => {
  it('returns the existing line without inserting when the source already posted', async () => {
    const existing = { id: 'l1', sourceType: 'restaurant_order', sourceId: 'ord-1' };
    const db = mockDb({ select: { folio_line_items: [[existing]] } });
    const svc = new FolioService(db as never);
    const row = await svc.postCharge({
      reservationId: 'res-1',
      propertyId: 'prop-1',
      kind: 'RESTAURANT',
      description: 'Restaurant ORD-00001',
      amountPaise: 120_000,
      sourceType: 'restaurant_order',
      sourceId: 'ord-1',
    });
    expect(row).toBe(existing);
    expect(db.inserts.find((i) => i.table === 'folio_line_items')).toBeUndefined();
  });

  it('inserts a new line when the source has not posted yet', async () => {
    const fresh = { id: 'l2', sourceType: 'spa_bill', sourceId: 'bill-9' };
    const db = mockDb({
      select: { folio_line_items: [[]] }, // no existing line
      insert: { folio_line_items: [fresh] },
    });
    const svc = new FolioService(db as never);
    const row = await svc.postCharge({
      reservationId: 'res-1',
      propertyId: 'prop-1',
      kind: 'SPA',
      description: 'Spa — Deep Tissue',
      amountPaise: 80_000,
      sourceType: 'spa_bill',
      sourceId: 'bill-9',
    });
    expect(row).toBe(fresh);
    expect(db.inserts.find((i) => i.table === 'folio_line_items')).toBeTruthy();
  });
});

describe('FolioService.recordPayment', () => {
  it('records a payment and refreshes the reservation net-paid cache', async () => {
    const payment = { id: 'p1', direction: 'PAYMENT', amountPaise: 200_000 };
    const db = mockDb({
      insert: { folio_payments: [payment] },
      select: { folio_payments: [[{ net: 200_000 }]] },
    });
    const svc = new FolioService(db as never);
    const out = await svc.recordPayment({
      reservationId: 'res-1',
      propertyId: 'prop-1',
      method: 'CASH',
      amountPaise: 200_000,
    });
    expect(out.payment).toBe(payment);
    expect(out.netPaidPaise).toBe(200_000);
    const upd = db.updates.find((u) => u.table === 'reservations');
    expect(upd?.values).toMatchObject({ paidPaise: 200_000 });
  });

  it('is a no-op that returns the first payment when the idempotency key repeats', async () => {
    const first = { id: 'p1', direction: 'PAYMENT', amountPaise: 200_000, idempotencyKey: 'k1' };
    const db = mockDb({
      select: {
        folio_payments: [
          [first], // findPaymentByKey hit
          [{ net: 200_000 }], // netPaid
        ],
      },
    });
    const svc = new FolioService(db as never);
    const out = await svc.recordPayment({
      reservationId: 'res-1',
      propertyId: 'prop-1',
      method: 'CASH',
      amountPaise: 200_000,
      idempotencyKey: 'k1',
    });
    expect(out.payment).toBe(first);
    expect(db.inserts.find((i) => i.table === 'folio_payments')).toBeUndefined();
  });
});
