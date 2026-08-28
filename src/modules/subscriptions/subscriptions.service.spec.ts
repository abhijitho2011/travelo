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
