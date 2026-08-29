import { StaffService, type StaffListParams } from './staff.service';

/**
 * Minimal Drizzle stand-in for `list()`: the chainable builder ignores the
 * (opaque) WHERE clause and returns whatever rows we seed, plus a matching
 * count. The real filtering logic is asserted separately against the pure
 * `conditions()` builder below, which is deterministic and needs no DB.
 */
type Row = Record<string, unknown>;

function makeDb(rows: Row[]) {
  const chain = (data: Row[]) => {
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      from: () => c,
      leftJoin: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      offset: async () => data,
      then: (res: (v: Row[]) => unknown) => Promise.resolve(data).then(res),
    });
    return c;
  };
  return {
    select: (projection?: Record<string, unknown>) => {
      const isCount = !!projection && 'total' in projection;
      return chain(isCount ? [{ total: rows.length }] : rows);
    },
  };
}

const joinedRow = (over: Partial<Row> = {}): Row => ({
  s: {
    id: 'staff-1',
    propertyId: 'prop-1',
    ownerId: 'owner-1',
    role: 'GENERAL_MANAGER',
    firstName: 'Asha',
    lastName: 'Menon',
    email: 'asha@resort.com',
    mobile: '9895077492',
    address: '1 Beach Rd',
    pinCode: '682031',
    state: 'Kerala',
    district: 'Ernakulam',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  },
  ownerName: 'Acme Hospitality',
  ownerContact: 'Ravi Owner',
  propertyName: 'Sea Breeze Resort',
  ...over,
});

/** Records what setStatus writes to the audit log. */
function auditStub() {
  const calls: Record<string, unknown>[] = [];
  return { calls, record: async (e: Record<string, unknown>) => void calls.push(e) };
}

/** Reaches the private builder without loosening the class' public surface. */
function buildConditions(svc: StaffService, params: StaffListParams): unknown[] {
  return (svc as unknown as { conditions: (p: StaffListParams) => unknown[] }).conditions(params);
}

describe('StaffService.list', () => {
  it('returns owner-created staff joined to owner and property names', async () => {
    const svc = new StaffService(makeDb([joinedRow()]) as never, auditStub() as never);
    const res = await svc.list({});
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      id: 'staff-1',
      fullName: 'Asha Menon',
      role: 'GENERAL_MANAGER',
      ownerName: 'Acme Hospitality',
      propertyName: 'Sea Breeze Resort',
      state: 'Kerala',
      district: 'Ernakulam',
    });
  });

  it('falls back to the owner contact name when the company is null', async () => {
    const svc = new StaffService(
      makeDb([joinedRow({ ownerName: null })]) as never,
      auditStub() as never,
    );
    const res = await svc.list({});
    expect(res.items[0].ownerName).toBe('Ravi Owner');
  });
});

describe('StaffService — filter conditions', () => {
  const svc = new StaffService({} as never, auditStub() as never);

  it('always excludes soft-deleted staff', () => {
    // The only baseline condition is the `deleted_at IS NULL` guard.
    expect(buildConditions(svc, {})).toHaveLength(1);
  });

  it('adds a clause for the state filter', () => {
    expect(buildConditions(svc, { state: 'Kerala' })).toHaveLength(2);
  });

  it('adds a clause for the property/staff-name query', () => {
    expect(buildConditions(svc, { q: 'Sea Breeze' })).toHaveLength(2);
  });

  it('stacks every supported filter on top of the soft-delete guard', () => {
    const conds = buildConditions(svc, {
      state: 'Kerala',
      q: 'Asha',
      propertyId: 'prop-1',
      ownerId: 'owner-1',
      role: 'GENERAL_MANAGER',
      status: 'ACTIVE',
    });
    // deletedAt guard + 6 filters.
    expect(conds).toHaveLength(7);
  });

  it('exposes the staff enums for filter validation', () => {
    expect(StaffService.roles).toContain('GENERAL_MANAGER');
    expect(StaffService.roles).toContain('ASSISTANT_GENERAL_MANAGER');
    expect(StaffService.statuses).toEqual(expect.arrayContaining(['ACTIVE', 'BLOCKED']));
  });
});

/**
 * `setStatus` runs one scoped lookup, one update, then one audit write. This
 * stub captures each so the test can assert the audit entry as well as the
 * mutation.
 */
function statusDb(existing: Row[] = []) {
  const updates: Row[] = [];
  const chain = (data: Row[]) => {
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      from: () => c,
      leftJoin: () => c,
      where: () => c,
      orderBy: () => c,
      limit: async () => data,
    });
    return c;
  };
  return {
    updates,
    select: () => chain(existing),
    update: () => ({
      set: (v: Row) => {
        updates.push(v);
        return { where: async () => [] };
      },
    }),
  };
}

describe('StaffService — platform-wide directory covers every role', () => {
  it('lists GM-created staff of any role, not just the owner-created GM/AGM', async () => {
    const rows = [
      joinedRow({ s: { ...(joinedRow().s as Row), id: 's1', role: 'GENERAL_MANAGER' } }),
      joinedRow({ s: { ...(joinedRow().s as Row), id: 's2', role: 'SECURITY_STAFF' } }),
      joinedRow({ s: { ...(joinedRow().s as Row), id: 's3', role: 'CHEF' } }),
    ];
    const svc = new StaffService(makeDb(rows) as never, auditStub() as never);
    const res = await svc.list({});
    expect(res.items.map((i) => i.role)).toEqual(['GENERAL_MANAGER', 'SECURITY_STAFF', 'CHEF']);
  });

  it('exposes department, employeeId and lastLoginAt on the admin record', async () => {
    const s = {
      ...(joinedRow().s as Row),
      department: 'Security',
      employeeId: 'EMP-9',
      lastLoginAt: new Date('2026-02-01'),
    };
    const svc = new StaffService(makeDb([joinedRow({ s })]) as never, auditStub() as never);
    const res = await svc.list({});
    expect(res.items[0]).toMatchObject({
      department: 'Security',
      employeeId: 'EMP-9',
      ownerName: 'Acme Hospitality',
      propertyName: 'Sea Breeze Resort',
    });
    expect(res.items[0].lastLoginAt).toEqual(new Date('2026-02-01'));
  });
});

describe('StaffService.setStatus', () => {
  it('updates the status and records an audit entry carrying the reason', async () => {
    const db = statusDb([{ id: 'staff-1', status: 'ACTIVE', propertyId: 'prop-1' }]);
    const audit = auditStub();
    const svc = new StaffService(db as never, audit as never);

    const res = await svc.setStatus('staff-1', 'BLOCKED', 'Repeated policy violations');

    expect(res).toEqual({ id: 'staff-1', status: 'BLOCKED', previousStatus: 'ACTIVE' });
    expect(db.updates[0]).toMatchObject({ status: 'BLOCKED' });
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      action: 'staff.status.changed',
      entity: 'hotel_staff',
      entityId: 'staff-1',
      before: { status: 'ACTIVE' },
      after: { status: 'BLOCKED' },
      reason: 'Repeated policy violations',
    });
  });

  it('404s on an unknown or soft-deleted staff id, writing nothing at all', async () => {
    const db = statusDb([]);
    const audit = auditStub();
    const svc = new StaffService(db as never, audit as never);
    await expect(svc.setStatus('ghost', 'BLOCKED')).rejects.toThrow('Staff member not found');
    expect(db.updates).toEqual([]);
    expect(audit.calls).toEqual([]);
  });
});
