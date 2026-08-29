import { OwnerSubscriptionService } from './owner-subscription.service';
import { mockDb, sqlText, type Row } from './testing/db.mock';

const SUB: Row = {
  id: 'sub-1',
  ownerId: 'own-1',
  planId: 'plan-1',
  status: 'ACTIVE',
  billingCycle: 'ANNUAL',
  currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
  currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
  propertyLimitOverride: null,
  autoRenew: true,
};

const PLAN: Row = {
  id: 'plan-1',
  name: 'Growth',
  description: 'For portfolios of up to five hotels',
  monthlyPrice: 250000,
  durationMonths: 12,
  currency: 'INR',
  propertyLimit: 5,
};

function svcWith(over: { sub?: Row[]; used?: number; features?: string[] } = {}) {
  const db = mockDb({
    select: {
      subscriptions: [over.sub ?? [{ s: SUB, p: PLAN }]],
      properties: [[{ count: over.used ?? 2 }]],
    },
  });
  const entitlements = {
    resolve: async () => ({ effective: over.features ?? ['reports.basic', 'staff.manage'] }),
  };
  return { db, svc: new OwnerSubscriptionService(db as never, entitlements as never) };
}

describe('OwnerSubscriptionService.daysRemaining', () => {
  const now = new Date('2026-08-29T12:00:00Z');

  it('counts whole days left in the period', () => {
    expect(OwnerSubscriptionService.daysRemaining(new Date('2026-09-08T12:00:00Z'), now)).toBe(10);
  });

  it('rounds a part-day up, so the last day still reads as 1', () => {
    expect(OwnerSubscriptionService.daysRemaining(new Date('2026-08-29T20:00:00Z'), now)).toBe(1);
  });

  it('floors at zero once the period has lapsed', () => {
    expect(OwnerSubscriptionService.daysRemaining(new Date('2026-08-01T00:00:00Z'), now)).toBe(0);
    expect(OwnerSubscriptionService.daysRemaining(now, now)).toBe(0);
  });
});

describe('OwnerSubscriptionService.current', () => {
  it('reports the plan, the period and the derived period price', async () => {
    const { svc } = svcWith();
    await expect(svc.current('own-1')).resolves.toMatchObject({
      planName: 'Growth',
      description: 'For portfolios of up to five hotels',
      status: 'ACTIVE',
      billingCycle: 'ANNUAL',
      durationMonths: 12,
      monthlyPrice: 250000,
      // Period total is always monthly x duration.
      periodPrice: 3000000,
      currency: 'INR',
      propertyLimit: 5,
      propertiesUsed: 2,
      features: ['reports.basic', 'staff.manage'],
    });
  });

  it('counts only NON-DELETED properties towards the allowance', async () => {
    const { svc, db } = svcWith({ used: 4 });
    const res = await svc.current('own-1');
    expect(res.propertiesUsed).toBe(4);
    const where = db.wheresFor('properties').map(sqlText).join(' ');
    expect(where).toContain('owner_id');
    expect(where).toContain('deleted_at is null');
  });

  it('lets a per-subscription override replace the plan limit', async () => {
    const { svc } = svcWith({
      sub: [{ s: { ...SUB, propertyLimitOverride: 12 }, p: PLAN }],
    });
    await expect(svc.current('own-1')).resolves.toMatchObject({ propertyLimit: 12 });
  });

  it('reports effective entitlements, not raw plan features', async () => {
    const { svc } = svcWith({ features: ['reports.advanced'] });
    await expect(svc.current('own-1')).resolves.toMatchObject({
      features: ['reports.advanced'],
    });
  });

  it('404s when no subscription is on file', async () => {
    const { svc } = svcWith({ sub: [] });
    await expect(svc.current('own-1')).rejects.toMatchObject({
      status: 404,
      response: { error: 'SUBSCRIPTION_NOT_FOUND' },
    });
  });
});

describe('OwnerSubscriptionService.invoices', () => {
  function invoiceSvc(rows: Row[], total = rows.length) {
    const db = mockDb({ select: { invoices: [rows, [{ count: total }]] } });
    return {
      db,
      svc: new OwnerSubscriptionService(db as never, { resolve: async () => ({}) } as never),
    };
  }

  it('returns this owner’s invoices, newest first, with the money fields', async () => {
    const { svc } = invoiceSvc([
      {
        id: 'inv-1',
        invoiceNumber: 'TAV-202601-0001',
        billingPeriodStart: new Date('2026-01-01T00:00:00Z'),
        billingPeriodEnd: new Date('2027-01-01T00:00:00Z'),
        subtotal: 3000000,
        tax: 540000,
        discount: 0,
        total: 3540000,
        currency: 'INR',
        status: 'PAID',
        issuedAt: new Date('2026-01-02T00:00:00Z'),
        dueDate: new Date('2026-01-16T00:00:00Z'),
        paidAt: new Date('2026-01-04T00:00:00Z'),
        // Internal columns that must not reach the owner app.
        storageKey: 'invoices/inv-1.pdf',
        subscriptionId: 'sub-1',
      },
    ]);
    const res = await svc.invoices('own-1', {});
    expect(res.items[0]).toEqual({
      id: 'inv-1',
      invoiceNumber: 'TAV-202601-0001',
      billingPeriodStart: new Date('2026-01-01T00:00:00Z'),
      billingPeriodEnd: new Date('2027-01-01T00:00:00Z'),
      subtotal: 3000000,
      tax: 540000,
      discount: 0,
      total: 3540000,
      currency: 'INR',
      status: 'PAID',
      issuedAt: new Date('2026-01-02T00:00:00Z'),
      dueDate: new Date('2026-01-16T00:00:00Z'),
      paidAt: new Date('2026-01-04T00:00:00Z'),
    });
    expect(res).toMatchObject({ total: 1, limit: 25, offset: 0 });
  });

  it('scopes every invoice query to the calling owner', async () => {
    const { svc, db } = invoiceSvc([]);
    await svc.invoices('own-1', {});
    for (const where of db.wheresFor('invoices')) {
      expect(sqlText(where)).toContain('owner_id');
    }
  });

  it('caps the page size', async () => {
    const { svc } = invoiceSvc([]);
    await expect(svc.invoices('own-1', { limit: 5000 })).resolves.toMatchObject({ limit: 100 });
  });
});
