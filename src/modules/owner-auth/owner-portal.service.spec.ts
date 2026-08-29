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

/**
 * The chain Super Admin → Owner → Property + GM/AGM → GM-created staff means
 * the owner must see EVERY staff member at their property, not only the GM/AGM
 * they created themselves. All three surfaces read the same `hotel_staff`
 * table, so a GM's hire shows up here with no extra plumbing.
 */
function staffListDb(rows: Record<string, unknown>[]) {
  const wheres: unknown[] = [];
  const chain = () => {
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      from: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      where: (w: unknown) => {
        wheres.push(w);
        return c;
      },
      limit: async () => rows,
      orderBy: async () => rows,
    });
    return c;
  };
  return { wheres, select: () => chain() };
}

function staffRow(over: Record<string, unknown> = {}) {
  return {
    id: 'staff-1',
    firstName: 'Asha',
    lastName: 'Menon',
    email: 'asha@hotel.test',
    mobile: '9000000001',
    state: 'Kerala',
    district: 'Ernakulam',
    pinCode: '682031',
    role: 'RECEPTIONIST',
    status: 'ACTIVE',
    department: 'Front Office',
    employeeId: 'EMP-7',
    lastLoginAt: null,
    propertyId: 'prop1',
    ...over,
  };
}

describe('OwnerPortalService.listStaff — every role, not just GM/AGM', () => {
  it('returns GM-created staff of any role alongside the owner-created GM', async () => {
    const rows = [
      staffRow({ id: 's1', role: 'GENERAL_MANAGER' }),
      staffRow({ id: 's2', role: 'RECEPTIONIST', department: 'Front Office' }),
      staffRow({ id: 's3', role: 'SECURITY_STAFF', department: 'Security' }),
      staffRow({ id: 's4', role: 'CHEF', department: 'Kitchen' }),
    ];
    // First select resolves assertOwnedProperty, second is the staff list.
    let call = 0;
    const inner = staffListDb(rows);
    const db = {
      select: () => (call++ === 0 ? staffListDb([{ id: 'prop1' }]).select() : inner.select()),
    };
    const svc = new OwnerPortalService(db as never, photosStub as never);
    const res = await svc.listStaff('own1', 'prop1');
    expect(res.map((s) => s.role)).toEqual([
      'GENERAL_MANAGER',
      'RECEPTIONIST',
      'SECURITY_STAFF',
      'CHEF',
    ]);
  });

  it('carries department, employeeId and lastLoginAt for the owner view', async () => {
    let call = 0;
    const inner = staffListDb([staffRow()]);
    const db = {
      select: () => (call++ === 0 ? staffListDb([{ id: 'prop1' }]).select() : inner.select()),
    };
    const svc = new OwnerPortalService(db as never, photosStub as never);
    const [s] = await svc.listStaff('own1', 'prop1');
    expect(s).toMatchObject({
      fullName: 'Asha Menon',
      department: 'Front Office',
      employeeId: 'EMP-7',
      lastLoginAt: null,
    });
  });
});

describe('OwnerPortalService.listAllStaff — portfolio-wide directory', () => {
  it('returns staff from every property with the property name attached', async () => {
    const db = staffListDb([
      { s: staffRow({ id: 's1', propertyId: 'prop1' }), propertyName: 'Sea Breeze Resort' },
      {
        s: staffRow({ id: 's2', propertyId: 'prop2', role: 'CHEF' }),
        propertyName: 'Hilltop Retreat',
      },
    ]);
    const svc = new OwnerPortalService(db as never, photosStub as never);
    const res = await svc.listAllStaff('own1');
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({
      id: 's1',
      propertyId: 'prop1',
      propertyName: 'Sea Breeze Resort',
    });
    expect(res[1]).toMatchObject({
      id: 's2',
      propertyId: 'prop2',
      propertyName: 'Hilltop Retreat',
      role: 'CHEF',
    });
  });
});
