import { RatePlansService, type PreviewFee } from './rate-plans.service';
import { mockDb, sqlText } from '../owner-auth/testing/db.mock';

const ROOM_TYPE = [{ id: 't1' }];

function planRow(over: Record<string, unknown> = {}) {
  return {
    id: 'rp1',
    propertyId: 'p1',
    roomTypeId: 't1',
    name: 'Room Only',
    basePricePaise: 500000,
    currency: 'INR',
    mealPlan: 'ROOM_ONLY',
    cancellationPolicy: 'FLEXIBLE',
    cancellationNote: null,
    paymentPolicy: 'PAY_AT_PROPERTY',
    minStay: null,
    maxStay: null,
    minAdvanceDays: null,
    maxAdvanceDays: null,
    extraAdultPaise: 0,
    extraChildPaise: 0,
    extraInfantPaise: 0,
    status: 'ACTIVE',
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

function feeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    propertyId: 'p1',
    roomTypeId: 't1',
    name: 'GST',
    kind: 'TAX',
    calculation: 'PERCENT',
    value: 1250,
    basis: 'PER_ROOM',
    period: 'PER_NIGHT',
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

function ruleRow(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    propertyId: 'p1',
    roomTypeId: 't1',
    trigger: 'OCCUPANCY',
    comparator: 'GTE',
    threshold: 80,
    startDate: null,
    endDate: null,
    adjustmentKind: 'PERCENT',
    adjustmentValue: 1500,
    enabled: true,
    priority: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

describe('RatePlansService — rate plans', () => {
  it('creates a plan under a room type the caller owns', async () => {
    const db = mockDb({
      select: { room_types: [ROOM_TYPE], rate_plans: [[]] },
      insert: { rate_plans: [planRow()] },
    });
    const plan = await new RatePlansService(db as never).createPlan('p1', {
      roomTypeId: 't1',
      name: 'Room Only',
      basePricePaise: 500000,
    });
    expect(plan).toMatchObject({ id: 'rp1', name: 'Room Only', basePricePaise: 500000 });
    expect(db.inserts[0].values).toMatchObject({ propertyId: 'p1', roomTypeId: 't1' });
  });

  it('404s when the room type belongs to another property', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(
      new RatePlansService(db as never).createPlan('p1', { roomTypeId: 'other', name: 'X' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('scopes the room-type lookup to the caller property', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(new RatePlansService(db as never).listPlans('p1', 't1')).rejects.toMatchObject({
      status: 404,
    });
    expect(sqlText(db.wheresFor('room_types')[0])).toContain('property_id');
  });

  it('409s with RATE_PLAN_NAME_TAKEN on a duplicate name in the same room type', async () => {
    const db = mockDb({ select: { room_types: [ROOM_TYPE], rate_plans: [[{ id: 'other' }]] } });
    await expect(
      new RatePlansService(db as never).createPlan('p1', { roomTypeId: 't1', name: 'Room Only' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'RATE_PLAN_NAME_TAKEN' },
    });
  });

  it('translates a 23505 from the unique index into the same typed 409', async () => {
    const db = mockDb({ select: { room_types: [ROOM_TYPE], rate_plans: [[]] } });
    db.insert = () => ({
      values: () => ({
        returning: () => Promise.reject({ code: '23505' }),
        then: (_r: unknown, j: (e: unknown) => void) => j({ code: '23505' }),
      }),
    });
    await expect(
      new RatePlansService(db as never).createPlan('p1', { roomTypeId: 't1', name: 'Room Only' }),
    ).rejects.toMatchObject({ response: { error: 'RATE_PLAN_NAME_TAKEN' } });
  });

  it('lets a soft-deleted plan free its name (the lookup excludes deleted rows)', async () => {
    // The only stored "Room Only" is soft-deleted, so the name query returns [].
    const db = mockDb({
      select: { room_types: [ROOM_TYPE], rate_plans: [[]] },
      insert: { rate_plans: [planRow({ id: 'rp2' })] },
    });
    const plan = await new RatePlansService(db as never).createPlan('p1', {
      roomTypeId: 't1',
      name: 'Room Only',
    });
    expect(plan.id).toBe('rp2');
    expect(sqlText(db.wheresFor('rate_plans')[0])).toContain('deleted_at');
  });

  it('soft-deletes rather than removing the row', async () => {
    const db = mockDb({
      select: { rate_plans: [[planRow()]] },
      update: { rate_plans: [planRow({ deletedAt: new Date() })] },
    });
    const out = await new RatePlansService(db as never).removePlan('p1', 'rp1');
    expect(out).toEqual({ deleted: true, id: 'rp1' });
    expect(db.updates[0].values).toHaveProperty('deletedAt');
    expect(db.deletes).toHaveLength(0);
  });

  it('404s deleting a plan that is not at this property', async () => {
    const db = mockDb({ select: { rate_plans: [[]] } });
    await expect(new RatePlansService(db as never).removePlan('p1', 'rp1')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('toggles status', async () => {
    const db = mockDb({
      select: { rate_plans: [[planRow()]] },
      update: { rate_plans: [planRow({ status: 'INACTIVE' })] },
    });
    const plan = await new RatePlansService(db as never).setPlanStatus('p1', 'rp1', 'INACTIVE');
    expect(plan.status).toBe('INACTIVE');
  });

  it('updates only the fields that were sent', async () => {
    const db = mockDb({
      select: { rate_plans: [[planRow()]] },
      update: { rate_plans: [planRow({ basePricePaise: 700000 })] },
    });
    await new RatePlansService(db as never).updatePlan('p1', 'rp1', { basePricePaise: 700000 });
    expect(Object.keys(db.updates[0].values ?? {}).sort()).toEqual(['basePricePaise', 'updatedAt']);
  });

  it('validates a patch against the MERGED row, not the patch alone', async () => {
    const db = mockDb({ select: { rate_plans: [[planRow({ minStay: 5 })]] } });
    await expect(
      new RatePlansService(db as never).updatePlan('p1', 'rp1', { maxStay: 2 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  describe('validation', () => {
    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      ['an empty name', { name: '   ' }, /name/],
      ['a negative base price', { basePricePaise: -1 }, /basePricePaise/],
      ['a negative extra adult charge', { extraAdultPaise: -1 }, /extraAdultPaise/],
      ['a negative extra child charge', { extraChildPaise: -1 }, /extraChildPaise/],
      ['a negative extra infant charge', { extraInfantPaise: -1 }, /extraInfantPaise/],
      ['minStay below 1', { minStay: 0 }, /minStay/],
      ['maxStay below minStay', { minStay: 3, maxStay: 2 }, /maxStay/],
      ['negative advance days', { minAdvanceDays: -1 }, /minAdvanceDays/],
      [
        'maxAdvanceDays below minAdvanceDays',
        { minAdvanceDays: 30, maxAdvanceDays: 7 },
        /maxAdvanceDays/,
      ],
    ];
    it.each(cases)('rejects %s', async (_label, patch, message) => {
      const db = mockDb({ select: { room_types: [ROOM_TYPE], rate_plans: [[]] } });
      await expect(
        new RatePlansService(db as never).createPlan('p1', {
          roomTypeId: 't1',
          name: 'Plan',
          ...patch,
        } as never),
      ).rejects.toMatchObject({
        status: 400,
        response: { message: expect.stringMatching(message) },
      });
    });
  });
});

describe('RatePlansService — fees', () => {
  it('lists a room type’s fees', async () => {
    const db = mockDb({ select: { room_types: [ROOM_TYPE], room_type_fees: [[feeRow()]] } });
    const out = await new RatePlansService(db as never).listFees('p1', 't1');
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ name: 'GST', calculation: 'PERCENT', value: 1250 });
  });

  it('404s listing fees for another property’s room type', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(new RatePlansService(db as never).listFees('p1', 't1')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('creates a fee', async () => {
    const db = mockDb({
      select: { room_types: [ROOM_TYPE] },
      insert: { room_type_fees: [feeRow()] },
    });
    const fee = await new RatePlansService(db as never).createFee('p1', 't1', {
      name: 'GST',
      value: 1250,
    });
    expect(fee.value).toBe(1250);
  });

  it('rejects a negative fee value and a percent above 100%', async () => {
    const svc = () =>
      new RatePlansService(mockDb({ select: { room_types: [ROOM_TYPE] } }) as never);
    await expect(svc().createFee('p1', 't1', { name: 'Bad', value: -1 })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      svc().createFee('p1', 't1', { name: 'Bad', calculation: 'PERCENT', value: 10001 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('soft-deletes a fee and 404s on a foreign one', async () => {
    const db = mockDb({
      select: { room_type_fees: [[feeRow()]] },
      update: { room_type_fees: [feeRow({ deletedAt: new Date() })] },
    });
    expect(await new RatePlansService(db as never).removeFee('p1', 'f1')).toEqual({
      deleted: true,
      id: 'f1',
    });
    const empty = mockDb({ select: { room_type_fees: [[]] } });
    await expect(new RatePlansService(empty as never).removeFee('p1', 'f1')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('RatePlansService — pricing rules', () => {
  it('creates a rule', async () => {
    const db = mockDb({
      select: { room_types: [ROOM_TYPE] },
      insert: { pricing_rules: [ruleRow()] },
    });
    const rule = await new RatePlansService(db as never).createPricingRule('p1', 't1', {
      trigger: 'OCCUPANCY',
      threshold: 80,
      adjustmentValue: 1500,
    });
    expect(rule).toMatchObject({ trigger: 'OCCUPANCY', threshold: 80, adjustmentValue: 1500 });
  });

  it('allows a NEGATIVE adjustment — that is a discount', async () => {
    const db = mockDb({
      select: { room_types: [ROOM_TYPE] },
      insert: { pricing_rules: [ruleRow({ adjustmentValue: -1000 })] },
    });
    const rule = await new RatePlansService(db as never).createPricingRule('p1', 't1', {
      trigger: 'LENGTH_OF_STAY',
      adjustmentValue: -1000,
    });
    expect(rule.adjustmentValue).toBe(-1000);
  });

  it('rejects a season whose end precedes its start', async () => {
    const db = mockDb({ select: { room_types: [ROOM_TYPE] } });
    await expect(
      new RatePlansService(db as never).createPricingRule('p1', 't1', {
        trigger: 'SEASON',
        startDate: '2026-12-31',
        endDate: '2026-12-01',
        adjustmentValue: 2000,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('404s creating a rule under another property’s room type', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(
      new RatePlansService(db as never).createPricingRule('p1', 't1', {
        trigger: 'OCCUPANCY',
        adjustmentValue: 100,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('soft-deletes a rule', async () => {
    const db = mockDb({
      select: { pricing_rules: [[ruleRow()]] },
      update: { pricing_rules: [ruleRow({ deletedAt: new Date() })] },
    });
    expect(await new RatePlansService(db as never).removePricingRule('p1', 'r1')).toEqual({
      deleted: true,
      id: 'r1',
    });
    expect(db.updates[0].values).toHaveProperty('deletedAt');
  });
});

// ---------------------------------------------------------------------------
// The money math. Pure, so no database appears anywhere below.
// ---------------------------------------------------------------------------

const gst: PreviewFee = {
  name: 'GST 12.5%',
  calculation: 'PERCENT',
  value: 1250,
  basis: 'PER_ROOM',
  period: 'PER_NIGHT',
};

describe('RatePlansService.previewPricing', () => {
  it('adds a percent tax on top when prices are exclusive', () => {
    const out = RatePlansService.previewPricing({
      basePricePaise: 100000, // Rs 1000/night
      fees: [gst],
      nights: 2,
      guests: 2,
      pricesIncludeTax: false,
    });
    expect(out.basePaise).toBe(200000);
    expect(out.feeLines).toEqual([{ name: 'GST 12.5%', amountPaise: 25000 }]);
    expect(out.taxTotalPaise).toBe(25000);
    expect(out.guestTotalPaise).toBe(225000);
  });

  it('extracts the tax from the base when prices are inclusive', () => {
    const out = RatePlansService.previewPricing({
      basePricePaise: 112500, // Rs 1125 inclusive of 12.5%
      fees: [gst],
      nights: 1,
      guests: 1,
      pricesIncludeTax: true,
    });
    expect(out.basePaise).toBe(100000);
    expect(out.taxTotalPaise).toBe(12500);
    // The guest pays exactly the advertised price.
    expect(out.guestTotalPaise).toBe(112500);
  });

  it('keeps the inclusive total equal to the advertised price even when it does not divide evenly', () => {
    for (const price of [99999, 100001, 12345, 7, 1]) {
      const out = RatePlansService.previewPricing({
        basePricePaise: price,
        fees: [gst],
        nights: 3,
        guests: 2,
        pricesIncludeTax: true,
      });
      expect(out.guestTotalPaise).toBe(price * 3);
      expect(out.basePaise + out.taxTotalPaise).toBe(out.guestTotalPaise);
    }
  });

  it('multiplies a FIXED PER_GUEST PER_NIGHT fee by both guests and nights', () => {
    const out = RatePlansService.previewPricing({
      basePricePaise: 100000,
      fees: [
        {
          name: 'City tax',
          calculation: 'FIXED',
          value: 5000, // Rs 50 per guest per night
          basis: 'PER_GUEST',
          period: 'PER_NIGHT',
        },
      ],
      nights: 3,
      guests: 2,
      pricesIncludeTax: false,
    });
    expect(out.taxTotalPaise).toBe(5000 * 2 * 3);
    expect(out.guestTotalPaise).toBe(300000 + 30000);
  });

  it('charges a PER_STAY fee exactly once', () => {
    const out = RatePlansService.previewPricing({
      basePricePaise: 100000,
      fees: [
        {
          name: 'Cleaning',
          calculation: 'FIXED',
          value: 25000,
          basis: 'PER_ROOM',
          period: 'PER_STAY',
        },
      ],
      nights: 4,
      guests: 2,
      pricesIncludeTax: false,
    });
    expect(out.taxTotalPaise).toBe(25000);
  });

  it('mixes percent and fixed fees and keeps the lines summing to the total', () => {
    const out = RatePlansService.previewPricing({
      basePricePaise: 123456,
      fees: [
        gst,
        {
          name: 'Service 10%',
          calculation: 'PERCENT',
          value: 1000,
          basis: 'PER_ROOM',
          period: 'PER_NIGHT',
        },
        {
          name: 'Resort fee',
          calculation: 'FIXED',
          value: 20000,
          basis: 'PER_ROOM',
          period: 'PER_STAY',
        },
      ],
      nights: 2,
      guests: 3,
      pricesIncludeTax: false,
    });
    // 12.5% of 123456 rounds to 15432, 10% to 12346 — per night, times 2.
    expect(out.feeLines.map((l) => l.amountPaise)).toEqual([15432 * 2, 12346 * 2, 20000]);
    expect(out.taxTotalPaise).toBe(out.feeLines.reduce((s, l) => s + l.amountPaise, 0));
    expect(out.guestTotalPaise).toBe(out.basePaise + out.taxTotalPaise);
  });

  it('reconciles inclusive pricing with a mix of percent and fixed fees', () => {
    const input = {
      basePricePaise: 150000,
      fees: [
        gst,
        {
          name: 'Resort fee',
          calculation: 'FIXED' as const,
          value: 10000,
          basis: 'PER_ROOM' as const,
          period: 'PER_STAY' as const,
        },
      ],
      nights: 2,
      guests: 2,
      pricesIncludeTax: true,
    };
    const out = RatePlansService.previewPricing(input);
    expect(out.guestTotalPaise).toBe(300000);
    expect(out.basePaise + out.taxTotalPaise).toBe(300000);
    // The fixed part is not taxed and comes out whole.
    expect(out.feeLines[1].amountPaise).toBe(10000);
  });

  it('rounds a percent line half away from zero, once, before multiplying', () => {
    const out = RatePlansService.previewPricing({
      basePricePaise: 4, // 12.5% of 4 paise = 0.5 -> 1
      fees: [gst],
      nights: 10,
      guests: 1,
      pricesIncludeTax: false,
    });
    expect(out.taxTotalPaise).toBe(10);
  });

  it('returns zeroes for a zero-night stay instead of dividing by nothing', () => {
    const out = RatePlansService.previewPricing({
      basePricePaise: 100000,
      fees: [gst],
      nights: 0,
      guests: 2,
      pricesIncludeTax: true,
    });
    expect(out).toMatchObject({ basePaise: 0, taxTotalPaise: 0, guestTotalPaise: 0 });
  });

  it('charges nothing when there are no fees', () => {
    const out = RatePlansService.previewPricing({
      basePricePaise: 100000,
      fees: [],
      nights: 3,
      guests: 2,
      pricesIncludeTax: true,
    });
    expect(out).toMatchObject({ basePaise: 300000, taxTotalPaise: 0, guestTotalPaise: 300000 });
  });
});
