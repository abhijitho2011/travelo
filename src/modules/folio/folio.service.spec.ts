import { FolioService } from './folio.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('FolioService.summary — the authoritative, tax-inclusive balance', () => {
  // A 2-night ₹2,500 stay: ₹5,000 room. Slab on the NIGHT (₹2,500 → 12%).
  const stay = {
    propertyId: 'prop-1',
    totalPaise: 500_000,
    ratePaise: 250_000,
    checkIn: '2026-09-10',
    checkOut: '2026-09-12',
    adults: 2,
    children: 0,
    companyGstin: null,
  };

  it('adds ancillary charges and tax to the room total and subtracts net payments', async () => {
    const db = mockDb({
      select: {
        reservations: [[stay]],
        folio_line_items: [
          [
            { id: 'l1', amountPaise: 120_000, kind: 'RESTAURANT', taxPaise: 6_000, voidedAt: null },
            { id: 'l2', amountPaise: 80_000, kind: 'SPA', taxPaise: 14_400, voidedAt: null },
          ],
        ],
        folio_payments: [
          [
            { id: 'p1', direction: 'PAYMENT', amountPaise: 300_000 },
            { id: 'p2', direction: 'REFUND', amountPaise: 20_000 },
            { id: 'p3', direction: 'PAYMENT', amountPaise: 50_000 },
          ],
        ],
        property_taxes: [[]],
      },
    });
    const svc = new FolioService(db as never);
    const s = await svc.summary('res-1');
    expect(s.roomChargePaise).toBe(500_000);
    expect(s.roomTaxRatePercent).toBe(12); // chosen on ₹2,500/night, not ₹5,000
    expect(s.roomTaxPaise).toBe(60_000);
    expect(s.ancillaryPaise).toBe(200_000);
    expect(s.lineTaxPaise).toBe(20_400);
    expect(s.subtotalPaise).toBe(700_000);
    expect(s.taxPaise).toBe(80_400);
    expect(s.chargesPaise).toBe(780_400);
    expect(s.netPaidPaise).toBe(330_000);
    expect(s.balancePaise).toBe(450_400);
  });

  it('a voided line is on the folio but counts for nothing', async () => {
    const db = mockDb({
      select: {
        reservations: [[{ ...stay, totalPaise: 0, ratePaise: 0 }]],
        folio_line_items: [
          [
            { id: 'l1', amountPaise: 100_000, kind: 'MISC', taxPaise: 18_000, voidedAt: null },
            { id: 'l2', amountPaise: 999_999, kind: 'MISC', taxPaise: 1, voidedAt: new Date() },
          ],
        ],
        folio_payments: [[]],
        property_taxes: [[]],
      },
    });
    const s = await new FolioService(db as never).summary('res-1');
    expect(s.ancillaryPaise).toBe(100_000);
    expect(s.balancePaise).toBe(118_000);
    expect(s.lineItems.map((l) => l.id)).toEqual(['l1']);
  });

  it('a property fee rides on the room: percent of the charge, or fixed per night', async () => {
    const db = mockDb({
      select: {
        reservations: [[stay]],
        folio_line_items: [[]],
        folio_payments: [[]],
        property_taxes: [
          [
            { calculation: 'PERCENT', value: 500, basis: 'PER_STAY', appliesTo: 'ROOM' }, // 5% service
            { calculation: 'FIXED', value: 10_000, basis: 'PER_NIGHT', appliesTo: 'ALL' }, // ₹100/night levy
            { calculation: 'FIXED', value: 50_000, basis: 'PER_STAY', appliesTo: 'RESTAURANT' }, // not the room
          ],
        ],
      },
    });
    const s = await new FolioService(db as never).summary('res-1');
    expect(s.propertyTaxPaise).toBe(25_000 + 20_000);
    expect(s.taxPaise).toBe(60_000 + 45_000);
  });

  it('a corporate guest registered in another state is billed IGST', async () => {
    const db = mockDb({
      select: {
        reservations: [[{ ...stay, companyGstin: '27AAAAA0000A1Z5' }]],
        folio_line_items: [[]],
        folio_payments: [[]],
        property_settings: [[{ gstStateCode: '32' }]], // Kerala hotel, Maharashtra company
        property_taxes: [[]],
      },
    });
    const s = await new FolioService(db as never).summary('res-1');
    expect(s.intraState).toBe(false);
    expect(s.roomTaxPaise).toBe(60_000); // same money, different split
  });
});

describe('FolioService adjustments', () => {
  it('a discount is its own negative, tax-free line — the charge is never edited', async () => {
    const db = mockDb({
      select: { folio_line_items: [[]] },
      insert: {
        folio_line_items: [{ id: 'l9', amountPaise: -50_000, taxPaise: 0, kind: 'ADJUSTMENT' }],
        folio_events: [{ id: 'e1' }],
      },
    });
    const line = await new FolioService(db as never).applyDiscount({
      reservationId: 'res-1',
      propertyId: 'prop-1',
      amountPaise: 50_000,
      reason: 'Loyal guest',
      actorStaffId: 'st-1',
    });
    expect(line.amountPaise).toBe(-50_000);
    const written = db.inserts.find((i) => i.table === 'folio_line_items')?.values;
    expect(written).toMatchObject({
      kind: 'ADJUSTMENT',
      amountPaise: -50_000,
      taxPaise: 0,
      taxExempt: true,
    });
    expect(db.inserts.find((i) => i.table === 'folio_events')?.values).toMatchObject({
      type: 'discount_applied',
    });
  });

  it('a restaurant posting is taxed at 5% and stored with its rate', async () => {
    const db = mockDb({
      select: { reservations: [[{ propertyId: 'prop-1', companyGstin: null }]] },
      insert: { folio_line_items: [{ id: 'l1' }] },
    });
    await new FolioService(db as never).postCharge({
      reservationId: 'res-1',
      propertyId: 'prop-1',
      kind: 'RESTAURANT',
      description: 'Dinner',
      amountPaise: 100_000,
    });
    expect(db.inserts.find((i) => i.table === 'folio_line_items')?.values).toMatchObject({
      taxPaise: 5_000,
      taxRateBp: 500,
      taxCategory: 'restaurant',
    });
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
