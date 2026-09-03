import { FolioReceiptService, type FolioReceiptData } from './folio-receipt.service';

function data(over: Partial<FolioReceiptData> = {}): FolioReceiptData {
  return {
    property: { name: 'The Backwater Retreat', city: 'Kochi', state: 'Kerala' },
    guest: { name: 'Meera Nair', phone: '9876543210', email: 'meera@example.com' },
    reservationNumber: 'RSV-000008',
    checkIn: '2026-03-14',
    checkOut: '2026-03-17',
    currency: 'INR',
    issuedAt: new Date('2026-03-17T09:00:00Z'),
    folio: {
      reservationId: 'res-1',
      roomChargePaise: 1_350_000,
      ancillaryPaise: 200_000,
      chargesPaise: 1_550_000,
      paymentsPaise: 1_550_000,
      refundsPaise: 0,
      netPaidPaise: 1_550_000,
      balancePaise: 0,
      lineItems: [
        {
          id: 'l1',
          reservationId: 'res-1',
          propertyId: 'p1',
          kind: 'RESTAURANT',
          description: 'Restaurant ORD-00012',
          amountPaise: 120_000,
          taxPaise: 0,
          hsnCode: null,
        discountPaise: 0,
        taxRateBp: 0,
        taxExempt: false,
        taxCategory: null,
        quantity: 1,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
          sourceType: 'restaurant_order',
          sourceId: 'ord-12',
          postedBy: null,
          postedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'l2',
          reservationId: 'res-1',
          propertyId: 'p1',
          kind: 'SPA',
          description: 'Spa — Deep Tissue',
          amountPaise: 80_000,
          taxPaise: 0,
          hsnCode: null,
        discountPaise: 0,
        taxRateBp: 0,
        taxExempt: false,
        taxCategory: null,
        quantity: 1,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
          sourceType: 'spa_bill',
          sourceId: 'bill-9',
          postedBy: null,
          postedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      payments: [
        {
          id: 'p1',
          reservationId: 'res-1',
          propertyId: 'p1',
          direction: 'PAYMENT',
          method: 'CARD',
          amountPaise: 1_550_000,
          reference: 'txn-1',
          note: null,
          collectedBy: null,
          collectedAt: new Date(),
          idempotencyKey: null,
          createdAt: new Date(),
        },
      ],
    },
    ...over,
  };
}

describe('FolioReceiptService.render', () => {
  it('renders a non-empty PDF for a settled folio', async () => {
    const buf = await FolioReceiptService.render(data());
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('renders a receipt that shows a balance due when the folio is unpaid', async () => {
    const buf = await FolioReceiptService.render(
      data({
        folio: {
          ...data().folio,
          netPaidPaise: 0,
          paymentsPaise: 0,
          payments: [],
          balancePaise: 1_550_000,
        },
      }),
    );
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
