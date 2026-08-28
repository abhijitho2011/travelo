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

  it('rejects zero or negative days', () => {
    expect(() =>
      SubscriptionsService.computeNewExpiry(new Date(), 0, new Date(), 'expiry'),
    ).toThrow();
    expect(() =>
      SubscriptionsService.computeNewExpiry(new Date(), -5, new Date(), 'expiry'),
    ).toThrow();
  });
});
