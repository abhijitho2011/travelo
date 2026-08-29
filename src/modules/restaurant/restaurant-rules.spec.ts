import {
  assertKotTransition,
  assertOrderTransition,
  canTransitionKot,
  canTransitionOrder,
  computeBill,
  countsTowardsBill,
  formatOrderNumber,
  KITCHEN_ACTIVE_KOT,
  KOT_TRANSITIONS,
  ORDER_TRANSITIONS,
  resolveTaxPercent,
  roleMaySetKot,
} from './restaurant-rules';

describe('order state machine', () => {
  it('walks the happy path OPEN → BILLED → PAID', () => {
    expect(canTransitionOrder('OPEN', 'BILLED')).toBe(true);
    expect(canTransitionOrder('BILLED', 'PAID')).toBe(true);
  });

  it('allows a void only from OPEN', () => {
    expect(canTransitionOrder('OPEN', 'CANCELLED')).toBe(true);
    expect(canTransitionOrder('BILLED', 'CANCELLED')).toBe(false);
  });

  it('has no edges out of the terminal states', () => {
    expect(ORDER_TRANSITIONS.PAID).toEqual([]);
    expect(ORDER_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('refuses to skip billing (OPEN → PAID) or reopen (BILLED → OPEN)', () => {
    expect(canTransitionOrder('OPEN', 'PAID')).toBe(false);
    expect(canTransitionOrder('BILLED', 'OPEN')).toBe(false);
  });

  it('assertOrderTransition throws INVALID_ORDER_TRANSITION on a bad move', () => {
    expect(() => assertOrderTransition('PAID', 'OPEN')).toThrow();
    try {
      assertOrderTransition('OPEN', 'PAID');
    } catch (err) {
      expect((err as { response: { error: string } }).response.error).toBe(
        'INVALID_ORDER_TRANSITION',
      );
    }
  });
});

describe('KOT (kitchen ticket) state machine', () => {
  it('walks NEW → PREPARING → READY → SERVED', () => {
    expect(canTransitionKot('NEW', 'PREPARING')).toBe(true);
    expect(canTransitionKot('PREPARING', 'READY')).toBe(true);
    expect(canTransitionKot('READY', 'SERVED')).toBe(true);
  });

  it('cancels only from NEW', () => {
    expect(canTransitionKot('NEW', 'CANCELLED')).toBe(true);
    expect(canTransitionKot('PREPARING', 'CANCELLED')).toBe(false);
    expect(canTransitionKot('READY', 'CANCELLED')).toBe(false);
  });

  it('never moves backwards or out of a terminal state', () => {
    expect(canTransitionKot('READY', 'PREPARING')).toBe(false);
    expect(KOT_TRANSITIONS.SERVED).toEqual([]);
    expect(KOT_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('assertKotTransition throws INVALID_KOT_TRANSITION on a bad move', () => {
    try {
      assertKotTransition('SERVED', 'NEW');
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as { response: { error: string } }).response.error).toBe('INVALID_KOT_TRANSITION');
    }
  });
});

describe('role gating for KOT moves — chef vs waiter', () => {
  it('lets the chef start and ready, but never serve', () => {
    expect(roleMaySetKot('CHEF', 'PREPARING')).toBe(true);
    expect(roleMaySetKot('CHEF', 'READY')).toBe(true);
    expect(roleMaySetKot('CHEF', 'SERVED')).toBe(false);
  });

  it('lets the waiter serve and cancel, but never cook', () => {
    expect(roleMaySetKot('WAITER', 'SERVED')).toBe(true);
    expect(roleMaySetKot('WAITER', 'CANCELLED')).toBe(true);
    expect(roleMaySetKot('WAITER', 'PREPARING')).toBe(false);
  });

  it('lets the manager make any move', () => {
    for (const to of ['PREPARING', 'READY', 'SERVED', 'CANCELLED'] as const) {
      expect(roleMaySetKot('RESTAURANT_MANAGER', to)).toBe(true);
    }
  });

  it('grants nothing to an unrelated role', () => {
    expect(roleMaySetKot('DRIVER', 'PREPARING')).toBe(false);
  });
});

describe('kitchen display active set', () => {
  it('shows lines still on the pass, hides served and cancelled', () => {
    expect(KITCHEN_ACTIVE_KOT).toEqual(['NEW', 'PREPARING', 'READY']);
    expect(countsTowardsBill('CANCELLED')).toBe(false);
    expect(countsTowardsBill('SERVED')).toBe(true);
  });
});

describe('tax percent resolution', () => {
  it('defaults to 5 for missing or nonsense values', () => {
    expect(resolveTaxPercent(undefined)).toBe(5);
    expect(resolveTaxPercent('not-a-number')).toBe(5);
    expect(resolveTaxPercent(-3)).toBe(5);
  });

  it('honours a configured percentage, number or string', () => {
    expect(resolveTaxPercent(12)).toBe(12);
    expect(resolveTaxPercent('18')).toBe(18);
    expect(resolveTaxPercent(0)).toBe(0);
  });
});

describe('computeBill — from snapshots, cancelled excluded', () => {
  const lines = [
    { pricePaiseSnapshot: 20_000, qty: 2, kotStatus: 'SERVED' as const }, // 40000
    { pricePaiseSnapshot: 15_000, qty: 1, kotStatus: 'READY' as const }, // 15000
    { pricePaiseSnapshot: 99_900, qty: 3, kotStatus: 'CANCELLED' as const }, // excluded
  ];

  it('subtotals only the active lines by snapshot price × qty', () => {
    const bill = computeBill(lines, 5);
    expect(bill.subtotalPaise).toBe(55_000);
    expect(bill.taxPaise).toBe(2_750); // 5% of 55000
    expect(bill.totalPaise).toBe(57_750);
  });

  it('rounds tax to the nearest paise', () => {
    const bill = computeBill([{ pricePaiseSnapshot: 3_333, qty: 1, kotStatus: 'SERVED' }], 5);
    // 5% of 3333 = 166.65 → 167
    expect(bill.taxPaise).toBe(167);
    expect(bill.totalPaise).toBe(3_500);
  });

  it('is zero across the board when every line is cancelled', () => {
    const bill = computeBill([{ pricePaiseSnapshot: 5_000, qty: 2, kotStatus: 'CANCELLED' }], 5);
    expect(bill).toEqual({ subtotalPaise: 0, taxPaise: 0, totalPaise: 0 });
  });
});

describe('order number formatting', () => {
  it('zero-pads to five and widens beyond', () => {
    expect(formatOrderNumber(1)).toBe('ORD-00001');
    expect(formatOrderNumber(42)).toBe('ORD-00042');
    expect(formatOrderNumber(123_456)).toBe('ORD-123456');
  });
});
