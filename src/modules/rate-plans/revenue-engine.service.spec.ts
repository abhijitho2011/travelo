import { RevenueEngineService } from './revenue-engine.service';

const rule = (over: Record<string, unknown> = {}) =>
  ({
    id: 'rule-1',
    propertyId: 'p',
    roomTypeId: 't1',
    trigger: 'OCCUPANCY',
    comparator: 'GTE',
    threshold: 80,
    startDate: null,
    endDate: null,
    adjustmentKind: 'PERCENT',
    adjustmentValue: 2000,
    enabled: true,
    priority: 0,
    name: 'High demand',
    ...over,
  }) as never;

describe('RevenueEngineService — pure rule maths', () => {
  it('occupancy compares against the night', () => {
    expect(RevenueEngineService.matches(rule(), '2026-09-10', 85)).toBe(true);
    expect(RevenueEngineService.matches(rule(), '2026-09-10', 50)).toBe(false);
    expect(
      RevenueEngineService.matches(rule({ comparator: 'LT', threshold: 30 }), '2026-09-10', 10),
    ).toBe(true);
  });

  it('day of week is ISO: 1 = Monday, 7 = Sunday', () => {
    // 2026-09-12 is a Saturday, 2026-09-13 a Sunday.
    expect(
      RevenueEngineService.matches(rule({ trigger: 'DAY_OF_WEEK', threshold: 6 }), '2026-09-12', 0),
    ).toBe(true);
    expect(
      RevenueEngineService.matches(rule({ trigger: 'DAY_OF_WEEK', threshold: 7 }), '2026-09-13', 0),
    ).toBe(true);
    expect(
      RevenueEngineService.matches(rule({ trigger: 'DAY_OF_WEEK', threshold: 7 }), '2026-09-12', 0),
    ).toBe(false);
  });

  it('a season needs its dates and matches inside them only', () => {
    const season = rule({ trigger: 'SEASON', startDate: '2026-12-20', endDate: '2027-01-05' });
    expect(RevenueEngineService.matches(season, '2026-12-25', 0)).toBe(true);
    expect(RevenueEngineService.matches(season, '2026-11-25', 0)).toBe(false);
    expect(RevenueEngineService.matches(rule({ trigger: 'SEASON' }), '2026-12-25', 0)).toBe(false);
  });

  it('applies percent in basis points (negative is a discount) and fixed in paise, never below zero', () => {
    expect(
      RevenueEngineService.apply(300_000, { adjustmentKind: 'PERCENT', adjustmentValue: 2000 }),
    ).toBe(360_000);
    expect(
      RevenueEngineService.apply(300_000, { adjustmentKind: 'PERCENT', adjustmentValue: -1500 }),
    ).toBe(255_000);
    expect(
      RevenueEngineService.apply(300_000, { adjustmentKind: 'FIXED', adjustmentValue: -400_000 }),
    ).toBe(0);
  });

  it('booking-time rules pick the highest-priority match on nights or lead time', () => {
    const los = rule({
      id: 'los',
      trigger: 'LENGTH_OF_STAY',
      comparator: 'GTE',
      threshold: 3,
      priority: 1,
      adjustmentValue: -1000,
    });
    const adv = rule({
      id: 'adv',
      trigger: 'ADVANCE_BOOKING',
      comparator: 'GTE',
      threshold: 30,
      priority: 5,
      adjustmentValue: -500,
    });
    expect(RevenueEngineService.quoteAdjustment([los, adv], 3, 40)?.id).toBe('adv');
    expect(RevenueEngineService.quoteAdjustment([los, adv], 3, 2)?.id).toBe('los');
    expect(RevenueEngineService.quoteAdjustment([los, adv], 1, 2)).toBeNull();
  });
});

describe('RevenueEngineService.run', () => {
  function engine(opts: {
    rules: unknown[];
    days: unknown[];
    floor?: number | null;
    grid: unknown;
  }) {
    const db = {
      select: jest.fn(() => ({
        from: (table: { _?: { name?: string } } & Record<string, unknown>) => {
          const name =
            ((table as { [k: symbol]: unknown })[Symbol.for('drizzle:Name')] as string) ?? '';
          const rows =
            name === 'property_settings'
              ? [{ floor: opts.floor ?? null }]
              : name === 'room_types'
                ? [{ id: 't1', baseRate: 300_000 }]
                : name === 'pricing_rules'
                  ? opts.rules
                  : name === 'rate_inventory_days'
                    ? opts.days
                    : [];
          const chain: Record<string, unknown> = {};
          chain.where = () => chain;
          chain.limit = () => Promise.resolve(rows);
          chain.then = (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res);
          return chain;
        },
      })),
      update: jest.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    };
    const rates = {
      grid: jest.fn(async () => opts.grid),
      bulkUpdate: jest.fn(async () => ({ batchId: 'b', cells: 1, changed: 1 })),
      nightlyPrices: jest.fn(async () => [{ date: 'x', pricePaise: 300_000, source: 'base' }]),
      list: jest.fn(async () => []),
    };
    return { s: new RevenueEngineService(db as never, rates as never), rates };
  }

  const grid = (days: { date: string; price: number; source: string; sold: number }[]) => ({
    roomTypes: [
      {
        id: 't1',
        days: days.map((d) => ({
          date: d.date,
          pricePaise: d.price,
          priceSource: d.source,
          sold: d.sold,
          physical: 10,
        })),
      },
    ],
  });

  it('prices a matching night from the base, tagged with the rule, and honours the floor', async () => {
    const { s, rates } = engine({
      rules: [rule({ adjustmentValue: -9000 })], // -90%
      days: [],
      floor: 100_000,
      grid: grid([{ date: '2026-09-10', price: 300_000, source: 'base', sold: 9 }]),
    });
    const res = await s.run('p', { days: 1 });
    expect(res.daysPriced).toBe(1);
    expect(rates.bulkUpdate).toHaveBeenCalledWith(
      'p',
      expect.objectContaining({
        set: { pricePaise: 100_000 },
        actorKind: 'RULE',
        pricingRuleId: 'rule-1',
      }),
    );
  });

  it('never overwrites a hand-typed price', async () => {
    const { s, rates } = engine({
      rules: [rule()],
      days: [{ roomTypeId: 't1', date: '2026-09-10', pricePaise: 999, pricingRuleId: null }],
      grid: grid([{ date: '2026-09-10', price: 999, source: 'day', sold: 10 }]),
    });
    const res = await s.run('p', { days: 1 });
    expect(res.daysPriced).toBe(0);
    expect(rates.bulkUpdate).not.toHaveBeenCalled();
  });

  it('auto-reverts a day the engine priced once its rule no longer matches', async () => {
    const { s, rates } = engine({
      rules: [rule()], // needs 80% occupancy
      days: [
        { roomTypeId: 't1', date: '2026-09-10', pricePaise: 360_000, pricingRuleId: 'rule-1' },
      ],
      grid: grid([{ date: '2026-09-10', price: 360_000, source: 'day', sold: 1 }]), // 10% now
    });
    const res = await s.run('p', { days: 1 });
    expect(res.daysReverted).toBe(1);
    expect(rates.bulkUpdate).toHaveBeenCalledWith(
      'p',
      expect.objectContaining({ set: { pricePaise: null }, actorKind: 'RULE' }),
    );
  });

  it('a dry run plans and writes nothing', async () => {
    const { s, rates } = engine({
      rules: [rule()],
      days: [],
      grid: grid([{ date: '2026-09-10', price: 300_000, source: 'base', sold: 9 }]),
    });
    const res = await s.run('p', { days: 1, dryRun: true });
    expect(res.plan).toHaveLength(1);
    expect(rates.bulkUpdate).not.toHaveBeenCalled();
  });
});
