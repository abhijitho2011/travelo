import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService.computeNewExpiry', () => {
  it('extends from future expiry when not yet expired', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const currentEnd = new Date('2026-03-01T00:00:00Z');
    const result = SubscriptionsService.computeNewExpiry(currentEnd, 30, now, 'expiry');
    expect(result.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('extends from now when subscription already expired', () => {
    const now = new Date('2026-04-01T00:00:00Z');
    const currentEnd = new Date('2026-03-01T00:00:00Z');
    const result = SubscriptionsService.computeNewExpiry(currentEnd, 15, now, 'expiry');
    expect(result.toISOString()).toBe('2026-04-16T00:00:00.000Z');
  });

  it('extendFrom=now uses max(now, currentEnd)', () => {
    const now = new Date('2026-04-01T00:00:00Z');
    const currentEnd = new Date('2026-05-01T00:00:00Z');
    const result = SubscriptionsService.computeNewExpiry(currentEnd, 10, now, 'now');
    expect(result.toISOString()).toBe('2026-05-11T00:00:00.000Z');
  });

  it('renewal still extends from the later of (now, currentPeriodEnd)', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    expect(
      SubscriptionsService.computeNewExpiry(
        new Date('2026-01-01T00:00:00Z'),
        30,
        now,
        'expiry',
      ).toISOString(),
    ).toBe('2026-07-15T00:00:00.000Z');
  });

  it('rejects zero or negative days', () => {
    expect(() =>
      SubscriptionsService.computeNewExpiry(new Date(), 0, new Date(), 'expiry'),
    ).toThrow();
    expect(() =>
      SubscriptionsService.computeNewExpiry(new Date(), -5, new Date(), 'expiry'),
    ).toThrow();
  });
});

describe('SubscriptionsService.computePeriodEnd', () => {
  it('uses the plan duration, not a hard-coded month or year', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    expect(SubscriptionsService.computePeriodEnd(start, 1).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
    expect(SubscriptionsService.computePeriodEnd(start, 3).toISOString()).toBe(
      '2026-04-01T00:00:00.000Z',
    );
    expect(SubscriptionsService.computePeriodEnd(start, 6).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
    expect(SubscriptionsService.computePeriodEnd(start, 12).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });

  it('clamps the day-of-month rather than overflowing', () => {
    expect(
      SubscriptionsService.computePeriodEnd(new Date('2026-01-31T00:00:00Z'), 1).toISOString(),
    ).toBe('2026-02-28T00:00:00.000Z');
    expect(
      SubscriptionsService.computePeriodEnd(new Date('2023-08-31T00:00:00Z'), 6).toISOString(),
    ).toBe('2024-02-29T00:00:00.000Z');
  });

  it('rejects durations outside 1..120', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    expect(() => SubscriptionsService.computePeriodEnd(start, 0)).toThrow();
    expect(() => SubscriptionsService.computePeriodEnd(start, 121)).toThrow();
    expect(() => SubscriptionsService.computePeriodEnd(start, 1.5)).toThrow();
  });
});

describe('SubscriptionsService.computeProration', () => {
  const P = SubscriptionsService.computeProration;

  it('credits the unused half of the period against an equal-priced new plan', () => {
    // 30-day period, 15 days used → half remains. Both plans cost 300000.
    const r = P({
      now: new Date('2026-01-16T00:00:00Z'),
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-01-31T00:00:00Z'),
      currentPeriodTotalPaise: 300000,
      newMonthlyPaise: 300000,
      newDurationMonths: 1,
    });
    expect(r.creditPaise).toBe(150000); // half of 300000
    expect(r.newCostPaise).toBe(300000);
    expect(r.amountDuePaise).toBe(150000); // 300000 - 150000
  });

  it('charges the full new cost when nothing remains on the old period', () => {
    const r = P({
      now: new Date('2026-02-01T00:00:00Z'),
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-01-31T00:00:00Z'),
      currentPeriodTotalPaise: 300000,
      newMonthlyPaise: 800000,
      newDurationMonths: 1,
    });
    expect(r.creditPaise).toBe(0);
    expect(r.amountDuePaise).toBe(800000);
  });

  it('extends the new period with leftover credit instead of charging or refunding', () => {
    // Downgrade: big credit, cheap new plan. Credit exceeds new cost → 0 due,
    // and the period is pushed out by the extra days the credit buys.
    const r = P({
      now: new Date('2026-01-02T00:00:00Z'),
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-12-31T00:00:00Z'), // ~1 year left
      currentPeriodTotalPaise: 3_600_000,
      newMonthlyPaise: 100000,
      newDurationMonths: 1,
    });
    expect(r.amountDuePaise).toBe(0);
    expect(r.creditPaise).toBeGreaterThan(r.newCostPaise);
    // The new period end is pushed well past a single month.
    const oneMonth = new Date('2026-02-02T00:00:00Z');
    expect(r.newPeriodEnd.getTime()).toBeGreaterThan(oneMonth.getTime());
  });
});
