import { OwnerPortalService } from './owner-portal.service';
import { mockDb, sqlText, type MockDb } from './testing/db.mock';
import type { Database } from '../../database/database.module';

const propsStub = { recomputeCompleteness: async () => 0 };

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

/** Reads/creates are unaudited; the stub keeps the constructor honest. */
const auditStub = { record: async () => undefined };

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
    const svc = new OwnerPortalService(
      db as never,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
    await expect(svc.createProperty('own1', dto)).rejects.toMatchObject({
      response: { error: 'PROPERTY_LIMIT_REACHED' },
    });
  });

  it('allows creation under the limit', async () => {
    let inserted = false;
    const db = mkDb([[{ status: 'ACTIVE', planLimit: 3, override: null }], [{ count: 1 }]], () => {
      inserted = true;
    });
    const svc = new OwnerPortalService(
      db as never,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
    const res = await svc.createProperty('own1', dto);
    expect(inserted).toBe(true);
    expect(res.id).toBe('prop1');
  });

  it('rejects when the owner has no usable subscription', async () => {
    const db = mkDb([[{ status: 'EXPIRED', planLimit: 3, override: null }], [{ count: 0 }]]);
    const svc = new OwnerPortalService(
      db as never,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
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

    const svc = new OwnerPortalService(
      db as never,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
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
    const svc = new OwnerPortalService(
      db as never,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
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
    const svc = new OwnerPortalService(
      db as never,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
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
    const svc = new OwnerPortalService(
      db as never,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
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

describe('OwnerPortalService.portfolioSummary — real occupancy and revenue', () => {
  const OWNER = 'owner-1';

  function portal(db: MockDb) {
    return new OwnerPortalService(
      db as unknown as Database,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
  }

  it('reports zeros for an owner with no hotels, without querying rooms at all', async () => {
    const db = mockDb({ select: { properties: [[{ hotels: 0, rooms: 0 }], []] } });
    await expect(portal(db).portfolioSummary(OWNER)).resolves.toEqual({
      hotels: 0,
      rooms: 0,
      revenue: 0,
      occupancy: 0,
    });
    expect(db.selects.filter((s) => s.table === 'rooms')).toEqual([]);
  });

  it('computes occupancy over every sellable room across the portfolio', async () => {
    const db = mockDb({
      select: {
        properties: [[{ hotels: 2, rooms: 30 }], [{ id: 'p1' }, { id: 'p2' }]],
        rooms: [[{ sellable: 24, occupied: 18 }]],
        reservations: [[{ total: '4200000' }]],
      },
    });
    await expect(portal(db).portfolioSummary(OWNER)).resolves.toEqual({
      hotels: 2,
      rooms: 30,
      revenue: 4_200_000,
      occupancy: 75,
    });
  });

  /**
   * These tiles used to be hard-coded zeros. A zero is a CLAIM — "you sold
   * nothing this month" — and an owner cannot tell it apart from "not wired up
   * yet", so the only acceptable zero is a real one.
   */
  it('no longer returns a hard-coded zero when there is business to report', async () => {
    const db = mockDb({
      select: {
        properties: [[{ hotels: 1, rooms: 10 }], [{ id: 'p1' }]],
        rooms: [[{ sellable: 10, occupied: 3 }]],
        reservations: [[{ total: '125000' }]],
      },
    });
    const summary = await portal(db).portfolioSummary(OWNER);
    expect(summary.revenue).toBe(125_000);
    expect(summary.occupancy).toBe(30);
  });

  it('divides by nothing safely when every room is out of order', async () => {
    const db = mockDb({
      select: {
        properties: [[{ hotels: 1, rooms: 4 }], [{ id: 'p1' }]],
        rooms: [[{ sellable: 0, occupied: 0 }]],
        reservations: [[{ total: 0 }]],
      },
    });
    await expect(portal(db).portfolioSummary(OWNER)).resolves.toMatchObject({ occupancy: 0 });
  });

  it('counts only committed stays that touch the current month', async () => {
    const db = mockDb({
      select: {
        properties: [[{ hotels: 1, rooms: 4 }], [{ id: 'p1' }]],
        rooms: [[{ sellable: 4, occupied: 1 }]],
        reservations: [[{ total: 0 }]],
      },
    });
    await portal(db).portfolioSummary(OWNER);

    const where = sqlText(db.wheresFor('reservations')[0]);
    expect(where).toContain('CHECKED_IN');
    expect(where).toContain('CHECKED_OUT');
    // A cancelled or no-show booking is money nobody owes.
    expect(where).not.toContain('CANCELLED');
    expect(where).not.toContain('NO_SHOW');
    // Strict inequalities: check_out is exclusive, so a stay ending on the 1st
    // does not belong to the month that starts on the 1st.
    expect(where).not.toContain('<=');
    expect(where).not.toContain('>=');
  });
});

describe('OwnerPortalService — property edit / archive (3.10)', () => {
  const auditStub = { record: async () => undefined };
  const photosStub = { coverUrls: async () => new Map() };
  const propsStub = { recomputeCompleteness: jest.fn(async () => 0) };

  it('archives a property the owner owns (soft delete)', async () => {
    const db = mockDb({ select: { properties: [[{ id: 'p1' }]] } });
    const svc = new OwnerPortalService(
      db as never,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
    const out = await svc.archiveProperty('own-1', 'p1');
    expect(out).toEqual({ deleted: true, id: 'p1' });
    expect(db.updates.find((u) => u.table === 'properties')?.values).toHaveProperty('deletedAt');
  });

  it('patches only provided fields and recomputes the listing score', async () => {
    const db = mockDb({
      select: {
        // assertOwnedProperty, then the current row, then getProperty re-read
        properties: [
          [{ id: 'p1' }],
          [{ id: 'p1', country: 'India', contact: { phone: '999', email: null } }],
          [
            {
              id: 'p1',
              name: 'New Name',
              city: 'Kochi',
              state: 'Kerala',
              country: 'India',
              status: 'DRAFT',
              roomCount: 0,
              listingCompleteness: 0,
              contact: { phone: '999' },
              address: {},
            },
          ],
        ],
      },
    });
    const svc = new OwnerPortalService(
      db as never,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
    await svc.updateProperty('own-1', 'p1', { name: 'New Name' });
    const upd = db.updates.find((u) => u.table === 'properties')?.values;
    expect(upd).toMatchObject({ name: 'New Name' });
    expect(upd).not.toHaveProperty('city'); // untouched field not written
    expect(propsStub.recomputeCompleteness).toHaveBeenCalledWith('p1');
  });
});

describe('OwnerPortalService — read-only booking calendar', () => {
  const auditStub = { record: async () => undefined };
  const photosStub = { coverUrls: async () => new Map() };

  function portal(db: MockDb) {
    return new OwnerPortalService(
      db as unknown as Database,
      photosStub as never,
      auditStub as never,
      propsStub as never,
    );
  }

  it('404s the reservations read for a property belonging to another owner', async () => {
    // assertOwnedProperty finds nothing: cross-tenant is a 404, never a 403.
    const db = mockDb({ select: { properties: [[]] } });
    await expect(
      portal(db).propertyReservations('own-1', 'someone-elses', {}),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.selects.some((s) => s.table === 'reservations')).toBe(false);
  });

  it('applies the strict overlap predicate check_in < to AND check_out > from', async () => {
    const db = mockDb({ select: { properties: [[{ id: 'p1' }]], reservations: [[]] } });
    await portal(db).propertyReservations('own-1', 'p1', { from: '2026-03-01', to: '2026-03-15' });

    const where = sqlText(db.wheresFor('reservations')[0]);
    expect(where).toContain('check_in <');
    expect(where).toContain('check_out >');
    // Inclusive bounds would drag in a stay that ends the morning the window
    // opens — a night nobody occupied.
    expect(where).not.toContain('<=');
    expect(where).not.toContain('>=');
    expect(where).toContain('deleted_at is null');
  });

  it('defaults to a fortnight and ignores a nonsense or inverted window', () => {
    const today = new Date().toISOString().slice(0, 10);
    const dflt = OwnerPortalService.calendarWindow({});
    expect(dflt.from).toBe(today);
    expect(dflt.to > dflt.from).toBe(true);

    expect(OwnerPortalService.calendarWindow({ from: 'not-a-date' }).from).toBe(today);
    // `to` before `from` would select everything or nothing by accident.
    const inverted = OwnerPortalService.calendarWindow({ from: '2026-03-10', to: '2026-03-01' });
    expect(inverted.to > inverted.from).toBe(true);
  });

  it('echoes the resolved window alongside the reservations', async () => {
    const db = mockDb({ select: { properties: [[{ id: 'p1' }]], reservations: [[]] } });
    const out = await portal(db).propertyReservations('own-1', 'p1', {
      from: '2026-03-01',
      to: '2026-03-15',
    });
    expect(out).toMatchObject({ from: '2026-03-01', to: '2026-03-15', items: [] });
  });
});
