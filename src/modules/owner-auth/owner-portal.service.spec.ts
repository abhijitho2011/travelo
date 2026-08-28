import { OwnerPortalService } from './owner-portal.service';

describe('OwnerPortalService.effectivePropertyLimit', () => {
  it('uses the plan limit when no override is set', () => {
    expect(OwnerPortalService.effectivePropertyLimit(3, null)).toBe(3);
    expect(OwnerPortalService.effectivePropertyLimit(1, undefined)).toBe(1);
  });

  it('override wins over the plan limit', () => {
    expect(OwnerPortalService.effectivePropertyLimit(1, 5)).toBe(5);
    expect(OwnerPortalService.effectivePropertyLimit(10, 0)).toBe(0);
  });

  it('defaults to 0 when nothing is available', () => {
    expect(OwnerPortalService.effectivePropertyLimit(null, null)).toBe(0);
  });
});

/**
 * Chainable Drizzle mock that returns queued result sets in order.
 * createProperty issues: (1) subscription+plan select, (2) count select.
 */
function mkDb(results: unknown[][], onInsert?: () => void) {
  let i = 0;
  const chain = (rows: unknown[]) => {
    const c: Record<string, unknown> = {};
    const ret = () => c;
    c.from = ret;
    c.innerJoin = ret;
    c.where = ret;
    c.orderBy = ret;
    c.limit = async () => rows;
    return c;
  };
  return {
    select() {
      const rows = results[i++] ?? [];
      // count queries await `.where(...)` directly (no limit); support both.
      const c = chain(rows) as Record<string, unknown>;
      const originalWhere = c.where as () => unknown;
      c.where = () => {
        const next = originalWhere();
        (next as { then?: unknown }).then = (res: (v: unknown) => void) => res(rows);
        return next;
      };
      return c;
    },
    insert() {
      return {
        values: () => ({
          returning: async () => {
            onInsert?.();
            return [
              {
                id: 'prop1',
                name: 'X',
                starRating: 3,
                city: 'Kochi',
                state: 'Kerala',
                status: 'DRAFT',
                roomCount: 0,
                listingCompleteness: 0,
              },
            ];
          },
        }),
      };
    },
  };
}

describe('OwnerPortalService.createProperty enforcement', () => {
  const dto = {
    name: 'Test Hotel',
    starRating: 3,
    city: 'Kochi',
    state: 'Kerala',
    address: { line1: 'x', city: 'Kochi', state: 'Kerala', pinCode: '682001', country: 'India' },
  } as never;

  it('rejects over-limit creation with PROPERTY_LIMIT_REACHED', async () => {
    const db = mkDb([
      [{ status: 'ACTIVE', planLimit: 1, override: null }], // subscription
      [{ count: 1 }], // existing property count == limit
    ]);
    const svc = new OwnerPortalService(db as never);
    await expect(svc.createProperty('own1', dto)).rejects.toMatchObject({
      response: { error: 'PROPERTY_LIMIT_REACHED' },
    });
  });

  it('allows creation under the limit', async () => {
    let inserted = false;
    const db = mkDb([[{ status: 'ACTIVE', planLimit: 3, override: null }], [{ count: 1 }]], () => {
      inserted = true;
    });
    const svc = new OwnerPortalService(db as never);
    const res = await svc.createProperty('own1', dto);
    expect(inserted).toBe(true);
    expect(res.id).toBe('prop1');
  });

  it('rejects when the owner has no usable subscription', async () => {
    const db = mkDb([[{ status: 'EXPIRED', planLimit: 3, override: null }], [{ count: 0 }]]);
    const svc = new OwnerPortalService(db as never);
    await expect(svc.createProperty('own1', dto)).rejects.toMatchObject({
      response: { error: 'PROPERTY_LIMIT_REACHED' },
    });
  });
});
