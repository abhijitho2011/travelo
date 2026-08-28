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

/** createProperty never touches the photo store; list/cover lookups do. */
const photosStub = { coverUrls: async () => new Map<string, string>() };

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
                name: 'Test Property',
                city: 'Kochi',
                state: 'Kerala',
                status: 'DRAFT',
                roomCount: 0,
                listingCompleteness: 0,
                contact: { phone: '9895077492', email: 'stay@example.com' },
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
    name: 'Test Property',
    city: 'Kochi',
    state: 'Kerala',
    phone: '9895077492',
    email: 'stay@example.com',
    address: {
      line1: '12 Marine Drive',
      city: 'Kochi',
      district: 'Ernakulam',
      state: 'Kerala',
      pinCode: '682031',
      country: 'India',
    },
  } as never;

  it('rejects over-limit creation with PROPERTY_LIMIT_REACHED', async () => {
    const db = mkDb([
      [{ status: 'ACTIVE', planLimit: 1, override: null }], // subscription
      [{ count: 1 }], // existing property count == limit
    ]);
    const svc = new OwnerPortalService(db as never, photosStub as never);
    await expect(svc.createProperty('own1', dto)).rejects.toMatchObject({
      response: { error: 'PROPERTY_LIMIT_REACHED' },
    });
  });

  it('allows creation under the limit', async () => {
    let inserted = false;
    const db = mkDb([[{ status: 'ACTIVE', planLimit: 3, override: null }], [{ count: 1 }]], () => {
      inserted = true;
    });
    const svc = new OwnerPortalService(db as never, photosStub as never);
    const res = await svc.createProperty('own1', dto);
    expect(inserted).toBe(true);
    expect(res.id).toBe('prop1');
  });

  it('rejects when the owner has no usable subscription', async () => {
    const db = mkDb([[{ status: 'EXPIRED', planLimit: 3, override: null }], [{ count: 0 }]]);
    const svc = new OwnerPortalService(db as never, photosStub as never);
    await expect(svc.createProperty('own1', dto)).rejects.toMatchObject({
      response: { error: 'PROPERTY_LIMIT_REACHED' },
    });
  });
});

describe('OwnerPortalService.createProperty stores the new field set', () => {
  it('writes contact into the jsonb column and never a star rating', async () => {
    let written: Record<string, unknown> | null = null;
    const db = {
      select() {
        const rows: unknown[] = written === null ? [] : [];
        void rows;
        return sequencedSelect();
      },
      insert() {
        return {
          values: (v: Record<string, unknown>) => {
            written = v;
            return {
              returning: async () => [
                { id: 'prop1', ...v, roomCount: 0, listingCompleteness: 0, status: 'DRAFT' },
              ],
            };
          },
        };
      },
    };
    let call = 0;
    function sequencedSelect() {
      const rows =
        call++ === 0 ? [{ status: 'ACTIVE', planLimit: 5, override: null }] : [{ count: 0 }];
      const c: Record<string, unknown> = {};
      const ret = () => c;
      c.from = ret;
      c.innerJoin = ret;
      c.orderBy = ret;
      c.limit = async () => rows;
      c.where = () => {
        (c as { then?: unknown }).then = (res: (v: unknown) => void) => res(rows);
        return c;
      };
      return c;
    }

    const svc = new OwnerPortalService(db as never, photosStub as never);
    await svc.createProperty('own1', {
      name: 'Seaside Inn',
      city: 'Kochi',
      state: 'Kerala',
      phone: '9895077492',
      address: {
        line1: '12 Marine Drive',
        city: 'Kochi',
        district: 'Ernakulam',
        state: 'Kerala',
        pinCode: '682031',
      },
    } as never);

    expect(written).not.toBeNull();
    expect(written!.contact).toEqual({ phone: '9895077492', email: null });
    expect(written).not.toHaveProperty('starRating');
    expect(written!.address).toMatchObject({ district: 'Ernakulam', country: 'India' });
  });
});
