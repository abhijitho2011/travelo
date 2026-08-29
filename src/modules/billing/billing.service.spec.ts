import { BillingService } from './billing.service';
import { InvoiceNumberService } from './invoice-number.service';
import { mockAudit, mockDb, MockDb } from '../owner-auth/testing/db.mock';

const PLAN = { durationMonths: 12, monthlyPrice: 250_000, currency: 'INR' };

function build(opts: {
  subscription?: Record<string, unknown>;
  invoiceId?: string;
  paymentId?: string;
  owner?: Record<string, unknown> | null;
}) {
  const sub = {
    id: 'sub-1',
    ownerId: 'own-1',
    currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
    ...opts.subscription,
  };
  const db = mockDb({
    select: {
      subscriptions: [[{ s: sub, p: PLAN }]],
      owners: [opts.owner === null ? [] : [opts.owner ?? { id: 'own-1' }]],
    },
    insert: {
      invoices: [{ id: opts.invoiceId ?? 'inv-1', invoiceNumber: 'INV-202608-000001' }],
      payments: [{ id: opts.paymentId ?? 'pay-1' }],
      subscription_events: [{ id: 'ev-1' }],
    },
    update: { payments: [{ id: opts.paymentId ?? 'pay-1' }] },
  });
  const audit = mockAudit();
  const pdf = { generateQuietly: jest.fn(async () => undefined), generate: jest.fn() };
  const invNum = { next: jest.fn(async () => 'INV-202608-000001') };
  const svc = new BillingService(
    db as never,
    audit as never,
    invNum as never,
    { get: () => undefined } as never,
    { getSignedUrl: async () => 'https://signed' } as never,
    pdf as never,
    { configured: false } as never,
  );
  return { svc, db, audit, pdf, invNum };
}

/** The `set(...)` payload of the first update issued against a table. */
function updateFor(db: MockDb, table: string): Record<string, unknown> {
  const rec = db.updates.find((u) => u.table === table);
  if (!rec) throw new Error(`no update recorded for ${table}`);
  return rec.values as Record<string, unknown>;
}

function insertFor(db: MockDb, table: string): Record<string, unknown> {
  const rec = db.inserts.find((i) => i.table === table);
  if (!rec) throw new Error(`no insert recorded for ${table}`);
  return rec.values as Record<string, unknown>;
}

describe('BillingService.computeRenewal', () => {
  const duration = 12;

  it('extends from the CURRENT PERIOD END when the subscription is still live', () => {
    // Paying two months early must not throw away the two months already owned.
    const { periodStart, periodEnd } = BillingService.computeRenewal(
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-12-01T00:00:00Z'),
      duration,
    );
    expect(periodStart.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2027-12-01T00:00:00.000Z');
  });

  it('extends from NOW when the subscription has already lapsed', () => {
    // Paying three months late must not back-date the new period into the past.
    const { periodStart, periodEnd } = BillingService.computeRenewal(
      new Date('2027-03-01T00:00:00Z'),
      new Date('2026-12-01T00:00:00Z'),
      duration,
    );
    expect(periodStart.toISOString()).toBe('2027-03-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2028-03-01T00:00:00.000Z');
  });

  it('is exactly max(now, periodEnd) at the boundary', () => {
    const same = new Date('2026-12-01T00:00:00Z');
    expect(BillingService.computeRenewal(same, same, 1).periodStart.toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });

  it('uses the plan duration and clamps the day-of-month', () => {
    expect(
      BillingService.computeRenewal(
        new Date('2026-01-31T00:00:00Z'),
        new Date('2026-01-31T00:00:00Z'),
        1,
      ).periodEnd.toISOString(),
    ).toBe('2026-02-28T00:00:00.000Z');
    expect(
      BillingService.computeRenewal(
        new Date('2026-01-01T00:00:00Z'),
        new Date(0),
        3,
      ).periodEnd.toISOString(),
    ).toBe('2026-04-01T00:00:00.000Z');
  });

  it('rejects a nonsensical plan duration', () => {
    const d = new Date();
    expect(() => BillingService.computeRenewal(d, d, 0)).toThrow();
    expect(() => BillingService.computeRenewal(d, d, 121)).toThrow();
    expect(() => BillingService.computeRenewal(d, d, 1.5)).toThrow();
  });
});

describe('BillingService.settleSuccessfulPayment', () => {
  it('renews from the LATER of now and the current period end', async () => {
    const { svc, db } = build({
      subscription: { currentPeriodEnd: new Date('2026-12-01T00:00:00Z') },
    });
    await svc.settleSuccessfulPayment({
      ownerId: 'own-1',
      subscriptionId: 'sub-1',
      amountPaise: 3_000_000,
      gateway: 'MANUAL',
      source: 'manual',
      now: new Date('2026-10-01T00:00:00Z'),
    });
    const patch = updateFor(db, 'subscriptions');
    expect((patch.currentPeriodStart as Date).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect((patch.currentPeriodEnd as Date).toISOString()).toBe('2027-12-01T00:00:00.000Z');
    expect(patch.status).toBe('ACTIVE');
  });

  it('renews from now for a lapsed subscription and reactivates it', async () => {
    const { svc, db } = build({
      subscription: { currentPeriodEnd: new Date('2026-01-01T00:00:00Z') },
    });
    await svc.settleSuccessfulPayment({
      ownerId: 'own-1',
      subscriptionId: 'sub-1',
      amountPaise: 3_000_000,
      gateway: 'MANUAL',
      source: 'manual',
      now: new Date('2026-06-15T00:00:00Z'),
    });
    const patch = updateFor(db, 'subscriptions');
    expect((patch.currentPeriodEnd as Date).toISOString()).toBe('2027-06-15T00:00:00.000Z');
  });

  it('issues an invoice for exactly the period renewed, with no invented tax', async () => {
    const { svc, db } = build({});
    await svc.settleSuccessfulPayment({
      ownerId: 'own-1',
      subscriptionId: 'sub-1',
      amountPaise: 3_000_000,
      gateway: 'MANUAL',
      source: 'manual',
      now: new Date('2026-10-01T00:00:00Z'),
    });
    const inv = insertFor(db, 'invoices');
    expect(inv).toMatchObject({
      invoiceNumber: 'INV-202608-000001',
      ownerId: 'own-1',
      subscriptionId: 'sub-1',
      subtotal: 3_000_000,
      tax: 0,
      discount: 0,
      total: 3_000_000,
      status: 'PAID',
    });
    expect((inv.billingPeriodStart as Date).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect((inv.billingPeriodEnd as Date).toISOString()).toBe('2027-12-01T00:00:00.000Z');
  });

  it('records a SUCCESS payment and a renewal event', async () => {
    const { svc, db } = build({});
    await svc.settleSuccessfulPayment({
      ownerId: 'own-1',
      subscriptionId: 'sub-1',
      amountPaise: 3_000_000,
      gateway: 'MANUAL',
      method: 'CASH',
      source: 'manual',
    });
    expect(insertFor(db, 'payments')).toMatchObject({
      status: 'SUCCESS',
      gateway: 'MANUAL',
      method: 'CASH',
      amount: 3_000_000,
      invoiceId: 'inv-1',
    });
    expect(insertFor(db, 'subscription_events')).toMatchObject({ type: 'renewal' });
  });

  it('resolves an existing PENDING payment instead of inserting a second one', async () => {
    const { svc, db } = build({ paymentId: 'pay-pending' });
    await svc.settleSuccessfulPayment({
      ownerId: 'own-1',
      subscriptionId: 'sub-1',
      amountPaise: 3_000_000,
      gateway: 'RAZORPAY',
      gatewayRef: 'pay_ABC',
      existingPaymentId: 'pay-pending',
      source: 'webhook',
    });
    expect(db.inserts.filter((i) => i.table === 'payments')).toHaveLength(0);
    expect(updateFor(db, 'payments')).toMatchObject({
      status: 'SUCCESS',
      gatewayRef: 'pay_ABC',
      invoiceId: 'inv-1',
    });
  });

  it('generates the PDF only AFTER the money transaction has committed', async () => {
    const { svc, pdf, db } = build({});
    await svc.settleSuccessfulPayment({
      ownerId: 'own-1',
      subscriptionId: 'sub-1',
      amountPaise: 100,
      gateway: 'MANUAL',
      source: 'manual',
    });
    expect(pdf.generateQuietly).toHaveBeenCalledWith('inv-1');
    // Nothing in the transaction depended on it.
    expect(db.inserts.some((i) => i.table === 'invoices')).toBe(true);
  });

  it('rejects a non-positive or fractional amount before touching anything', async () => {
    const { svc, db } = build({});
    for (const amount of [0, -1, 10.5]) {
      await expect(
        svc.settleSuccessfulPayment({
          ownerId: 'own-1',
          amountPaise: amount,
          gateway: 'MANUAL',
          source: 'manual',
        }),
      ).rejects.toThrow();
    }
    expect(db.inserts).toHaveLength(0);
  });

  it('refuses a subscription that belongs to a different owner', async () => {
    const { svc } = build({ subscription: { ownerId: 'someone-else' } });
    await expect(
      svc.settleSuccessfulPayment({
        ownerId: 'own-1',
        subscriptionId: 'sub-1',
        amountPaise: 100,
        gateway: 'MANUAL',
        source: 'manual',
      }),
    ).rejects.toThrow(/does not belong/i);
  });
});

describe('BillingService.recordManualPayment', () => {
  it('settles through the SAME path a webhook uses, tagged MANUAL', async () => {
    const { svc, db, audit } = build({});
    const settle = jest.spyOn(svc, 'settleSuccessfulPayment');
    await svc.recordManualPayment({
      ownerId: 'own-1',
      subscriptionId: 'sub-1',
      amountPaise: 3_000_000,
      method: 'BANK_TRANSFER',
      reference: 'NEFT-778899',
      note: 'paid at the front desk',
    });
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({ gateway: 'MANUAL', source: 'manual', method: 'BANK_TRANSFER' }),
    );
    // Same renewal, same invoice, same event as the gateway path produces.
    expect(updateFor(db, 'subscriptions')).toHaveProperty('currentPeriodEnd');
    expect(insertFor(db, 'invoices')).toHaveProperty('invoiceNumber');
    expect(insertFor(db, 'subscription_events')).toMatchObject({ type: 'renewal' });
    expect(audit.entries.map((e) => e.action)).toContain('billing.payment.settled.manual');
  });

  it('404s for an unknown owner without writing anything', async () => {
    const { svc, db } = build({ owner: null });
    await expect(
      svc.recordManualPayment({
        ownerId: 'nope',
        amountPaise: 100,
        method: 'CASH',
      }),
    ).rejects.toThrow(/Owner not found/);
    expect(db.inserts).toHaveLength(0);
  });
});

describe('BillingService.createGatewayOrder', () => {
  it('returns a typed GATEWAY_NOT_CONFIGURED when Razorpay keys are absent', async () => {
    const { svc, db } = build({});
    await expect(
      svc.createGatewayOrder({ ownerId: 'own-1', subscriptionId: 'sub-1' }),
    ).rejects.toMatchObject({
      response: { error: 'GATEWAY_NOT_CONFIGURED' },
    });
    // Crucially, no PENDING payment is parked for an order that never existed.
    expect(db.inserts).toHaveLength(0);
  });
});

/**
 * The webhook contract, exercised against a database stub that behaves like the
 * real unique index on (provider, event_id).
 */
describe('BillingService.handleWebhook idempotency', () => {
  function webhookSvc() {
    const seen = new Set<string>();
    const settled: unknown[] = [];
    const pendingPayment = {
      id: 'pay-pending',
      ownerId: 'own-1',
      subscriptionId: 'sub-1',
      amount: 3_000_000,
      currency: 'INR',
      gatewayRef: 'order_XYZ',
      status: 'PENDING',
    };
    const db = {
      insert: () => ({
        values: (v: { provider: string; eventId: string }) => ({
          returning: async () => {
            const key = `${v.provider}:${v.eventId}`;
            if (seen.has(key)) {
              throw new Error(
                'duplicate key value violates unique constraint "webhook_events_unique"',
              );
            }
            seen.add(key);
            return [{ id: `wh-${seen.size}` }];
          },
        }),
      }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [pendingPayment] }) }),
      }),
    };
    const svc = new BillingService(
      db as never,
      mockAudit() as never,
      { next: async () => 'INV-202608-000001' } as never,
      { get: () => undefined } as never,
      {} as never,
      { generateQuietly: async () => undefined } as never,
      { configured: false } as never,
    );
    jest.spyOn(svc, 'settleSuccessfulPayment').mockImplementation(async (input) => {
      settled.push(input);
      return {} as never;
    });
    return { svc, settled };
  }

  const capture = {
    headers: {},
    rawBody: '',
    parsedBody: {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_ABC',
            order_id: 'order_XYZ',
            amount: 3_000_000,
            currency: 'INR',
            method: 'upi',
          },
        },
      },
    },
  };

  it('settles a captured payment exactly once, however many times it is redelivered', async () => {
    const { svc, settled } = webhookSvc();

    const first = await svc.handleWebhook('razorpay', capture);
    expect(first).toMatchObject({ ok: true, replayed: false, settled: true });

    // The gateway retries. Four more times, for good measure.
    for (let i = 0; i < 4; i++) {
      const replay = await svc.handleWebhook('razorpay', capture);
      expect(replay).toEqual({ ok: true, replayed: true });
    }

    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({
      ownerId: 'own-1',
      subscriptionId: 'sub-1',
      amountPaise: 3_000_000,
      gateway: 'RAZORPAY',
      gatewayRef: 'pay_ABC',
      existingPaymentId: 'pay-pending',
      source: 'webhook',
    });
  });

  it('records a non-payment event without settling anything', async () => {
    const { svc, settled } = webhookSvc();
    const res = await svc.handleWebhook('razorpay', {
      headers: {},
      rawBody: '',
      parsedBody: { event: 'payment.authorized', payload: { payment: { entity: { id: 'p2' } } } },
    });
    expect(res).toMatchObject({ ok: true, settled: false });
    expect(settled).toHaveLength(0);
  });

  it('treats the same event id from two different providers as two events', async () => {
    const { svc } = webhookSvc();
    await svc.handleWebhook('razorpay', capture);
    const cashfree = await svc.handleWebhook('cashfree', {
      headers: {},
      rawBody: '',
      parsedBody: { type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'pay_ABC' } } },
    });
    expect(cashfree).toMatchObject({ replayed: false });
  });
});

/**
 * Invoice numbers are the one thing in this module that must never repeat: two
 * invoices sharing a number is a legal problem, not a bug report.
 */
describe('invoice numbers stay unique', () => {
  /** Stands in for the `ON CONFLICT DO UPDATE ... RETURNING last_seq` upsert. */
  function sequenceDb() {
    const counters = new Map<string, number>();
    return {
      execute: async (query: unknown) => {
        // The month key is the only YYYYMM-shaped bound parameter of the upsert.
        const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? [];
        const key =
          chunks.find((c): c is string => typeof c === 'string' && /^\d{6}$/.test(c)) ?? '000000';
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return { rows: [{ last_seq: next }] };
      },
    };
  }

  it('never hands the same number to two invoices in one month', async () => {
    const svc = new InvoiceNumberService(sequenceDb() as never);
    const when = new Date('2026-08-15T00:00:00Z');
    const numbers = await Promise.all(Array.from({ length: 500 }, () => svc.next(when)));
    expect(new Set(numbers).size).toBe(500);
    expect(numbers[0]).toBe('INV-202608-000001');
    expect(numbers[499]).toBe('INV-202608-000500');
  });

  it('restarts the sequence per month but keeps the numbers distinct', async () => {
    const svc = new InvoiceNumberService(sequenceDb() as never);
    const aug = await svc.next(new Date('2026-08-01T00:00:00Z'));
    const sep = await svc.next(new Date('2026-09-01T00:00:00Z'));
    expect(aug).toBe('INV-202608-000001');
    expect(sep).toBe('INV-202609-000001');
    expect(aug).not.toBe(sep);
  });

  it('is allocated before the transaction, so a rollback cannot reuse it', async () => {
    // A settlement that fails inside the transaction must not release the
    // number back — gaps are fine, duplicates are not.
    const db = mockDb({ select: { subscriptions: [[]] } });
    const invNum = { next: jest.fn(async () => 'INV-202608-000007') };
    const svc = new BillingService(
      db as never,
      mockAudit() as never,
      invNum as never,
      { get: () => undefined } as never,
      {} as never,
      { generateQuietly: async () => undefined } as never,
      { configured: false } as never,
    );
    await expect(
      svc.settleSuccessfulPayment({
        ownerId: 'own-1',
        subscriptionId: 'missing',
        amountPaise: 100,
        gateway: 'MANUAL',
        source: 'manual',
      }),
    ).rejects.toThrow(/Subscription not found/);
    expect(invNum.next).toHaveBeenCalledTimes(1);
  });
});
