import { HttpException } from '@nestjs/common';
import { StaffTeamService } from './staff-team.service';
import { staffCreatableRoleValues } from './dto';
import { AuthenticatedStaff } from './current-staff.decorator';
import { permissionsForRole } from './role-permissions';

type Row = Record<string, unknown>;

function codeOf(err: unknown): string {
  const resp = (err as HttpException).getResponse() as { error?: string };
  return resp.error ?? 'UNKNOWN';
}

async function rejectionCode(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpException);
  return codeOf(err);
}

/**
 * Walks a Drizzle SQL tree and collects the columns it references. This is what
 * lets the tenant-isolation tests assert that `property_id` really is in the
 * WHERE clause, rather than trusting a stub that ignores the predicate.
 */
function columnsOf(node: unknown, acc: string[] = []): string[] {
  const n = node as Record<string, unknown> | null;
  if (!n || typeof n !== 'object') return acc;
  if (typeof n.name === 'string' && n.table) acc.push(n.name);
  const chunks = (n.queryChunks ?? n.chunks) as unknown[] | undefined;
  if (Array.isArray(chunks)) chunks.forEach((c) => columnsOf(c, acc));
  if (Array.isArray(n)) (n as unknown[]).forEach((c) => columnsOf(c, acc));
  return acc;
}

/**
 * Drizzle stand-in that hands out a queued result set per `select()` and
 * records every WHERE clause, INSERT payload and UPDATE payload.
 */
function makeDb(resultSets: Row[][] = []) {
  const queue = [...resultSets];
  const wheres: string[][] = [];
  const inserts: Row[] = [];
  const updates: Row[] = [];

  const thenable = (data: Row[]) => {
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      from: () => c,
      leftJoin: () => c,
      where: (w: unknown) => {
        wheres.push(columnsOf(w));
        return c;
      },
      orderBy: () => c,
      limit: () => c,
      offset: () => c,
      then: (res: (v: Row[]) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(data).then(res, rej),
    });
    return c;
  };

  return {
    wheres,
    inserts,
    updates,
    select: () => thenable(queue.shift() ?? []),
    insert: () => ({
      values: (v: Row) => {
        inserts.push(v);
        return { returning: async () => [{ id: 'new-1', createdAt: new Date(), ...v }] };
      },
    }),
    update: () => ({
      set: (v: Row) => {
        updates.push(v);
        return {
          where: (w: unknown) => {
            wheres.push(columnsOf(w));
            return Promise.resolve([]);
          },
        };
      },
    }),
  };
}

function meAs(role: string, over: Partial<AuthenticatedStaff> = {}): AuthenticatedStaff {
  return {
    id: 'me-1',
    propertyId: 'prop-A',
    ownerId: 'own-1',
    role,
    email: 'gm@hotel.test',
    mobile: '9895077492',
    firstName: 'Gita',
    lastName: 'Nair',
    status: 'ACTIVE',
    sessionId: 'sess-1',
    permissions: permissionsForRole(role),
    ...over,
  };
}

const validMember = {
  role: 'RECEPTIONIST',
  firstName: 'Asha',
  lastName: 'Menon',
  mobile: '9000000001',
  email: 'Asha@Hotel.test',
};

describe('StaffTeamService — property scoping', () => {
  it('scopes the team list to the caller’s own property', async () => {
    const db = makeDb([[], [{ count: 0 }]]);
    const svc = new StaffTeamService(db as never);
    await svc.list(meAs('GENERAL_MANAGER'), {});
    // Both the page query and the count query carry the property scope.
    expect(db.wheres.length).toBeGreaterThanOrEqual(2);
    for (const w of db.wheres) {
      expect(w).toContain('property_id');
      expect(w).toContain('deleted_at');
    }
  });

  it('builds filter clauses on top of the property scope, never instead of it', () => {
    const base = StaffTeamService.conditions('prop-A', {});
    expect(base).toHaveLength(2); // property_id + deleted_at
    expect(StaffTeamService.conditions('prop-A', { role: 'CHEF' })).toHaveLength(3);
    expect(StaffTeamService.conditions('prop-A', { status: 'ACTIVE' })).toHaveLength(3);
    expect(StaffTeamService.conditions('prop-A', { department: 'Kitchen' })).toHaveLength(3);
    expect(StaffTeamService.conditions('prop-A', { q: 'asha' })).toHaveLength(3);
    const all = StaffTeamService.conditions('prop-A', {
      role: 'CHEF',
      status: 'ACTIVE',
      department: 'Kitchen',
      q: 'asha',
    });
    expect(all).toHaveLength(6);
    expect(columnsOf(all)).toContain('property_id');
  });
});

/**
 * A GM at property A must not be able to read or mutate a row at property B.
 * The row is resolved by (id, propertyId, deletedAt), so property B's row comes
 * back empty and the caller gets a 404 — never a 403, which would confirm the
 * row exists and leak which property it sits at.
 */
describe('StaffTeamService — cross-property access is a 404, not a 403', () => {
  const gm = meAs('GENERAL_MANAGER');

  it('approve on another property’s staff 404s and writes nothing', async () => {
    const db = makeDb([[]]); // the scoped lookup finds nothing
    const svc = new StaffTeamService(db as never);
    expect(await rejectionCode(svc.approve(gm, 'staff-at-prop-B'))).toBe('STAFF_MEMBER_NOT_FOUND');
    expect(db.updates).toEqual([]);
  });

  it('status change on another property’s staff 404s and writes nothing', async () => {
    const db = makeDb([[]]);
    const svc = new StaffTeamService(db as never);
    expect(await rejectionCode(svc.setStatus(gm, 'staff-at-prop-B', 'BLOCKED'))).toBe(
      'STAFF_MEMBER_NOT_FOUND',
    );
    expect(db.updates).toEqual([]);
  });

  it('delete of another property’s staff 404s and writes nothing', async () => {
    const db = makeDb([[]]);
    const svc = new StaffTeamService(db as never);
    expect(await rejectionCode(svc.remove(gm, 'staff-at-prop-B'))).toBe('STAFF_MEMBER_NOT_FOUND');
    expect(db.updates).toEqual([]);
  });

  it('every mutation resolves its target with the property scope in the WHERE', async () => {
    for (const run of [
      (s: StaffTeamService) => s.approve(gm, 'x'),
      (s: StaffTeamService) => s.setStatus(gm, 'x', 'BLOCKED'),
      (s: StaffTeamService) => s.remove(gm, 'x'),
    ]) {
      const db = makeDb([[]]);
      await run(new StaffTeamService(db as never)).catch(() => undefined);
      expect(db.wheres[0]).toEqual(expect.arrayContaining(['id', 'property_id', 'deleted_at']));
    }
  });
});

describe('StaffTeamService — no self-service', () => {
  const gm = meAs('GENERAL_MANAGER');

  it('refuses to approve, re-status or delete your own row, and touches no db', async () => {
    for (const run of [
      (s: StaffTeamService) => s.approve(gm, gm.id),
      (s: StaffTeamService) => s.setStatus(gm, gm.id, 'ACTIVE'),
      (s: StaffTeamService) => s.remove(gm, gm.id),
    ]) {
      const db = makeDb([[{ id: gm.id, status: 'PENDING_APPROVAL' }]]);
      expect(await rejectionCode(run(new StaffTeamService(db as never)))).toBe(
        'SELF_MODIFICATION_FORBIDDEN',
      );
      expect(db.updates).toEqual([]);
      expect(db.wheres).toEqual([]);
    }
  });

  it('never writes a role column on any status change — role is not editable here', async () => {
    const db = makeDb([[{ id: 'staff-2', status: 'ACTIVE', propertyId: 'prop-A' }]]);
    const svc = new StaffTeamService(db as never);
    await svc.setStatus(gm, 'staff-2', 'SUSPENDED');
    expect(db.updates).toHaveLength(1);
    expect(Object.keys(db.updates[0]).sort()).toEqual(['status', 'updatedAt']);
    expect(db.updates[0]).not.toHaveProperty('role');
  });
});

describe('StaffTeamService — role escalation is impossible', () => {
  it('excludes GM and AGM from the roles a staff member may create', () => {
    expect(staffCreatableRoleValues).not.toContain('GENERAL_MANAGER');
    expect(staffCreatableRoleValues).not.toContain('ASSISTANT_GENERAL_MANAGER');
    expect(staffCreatableRoleValues).toContain('RECEPTIONIST');
    expect(staffCreatableRoleValues).toHaveLength(21);
  });

  it('rejects a GM/AGM role at the service layer even if the DTO were bypassed', async () => {
    for (const role of ['GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER']) {
      const db = makeDb();
      const svc = new StaffTeamService(db as never);
      expect(
        await rejectionCode(svc.create(meAs('GENERAL_MANAGER'), { ...validMember, role } as never)),
      ).toBe('ROLE_NOT_ASSIGNABLE');
      expect(db.inserts).toEqual([]);
    }
  });
});

describe('StaffTeamService.create', () => {
  it('stamps the creator’s own property and organisation, ignoring client input', async () => {
    const db = makeDb();
    const svc = new StaffTeamService(db as never);
    await svc.create(meAs('GENERAL_MANAGER'), {
      ...validMember,
      // A hostile client trying to plant a row at another property:
      propertyId: 'prop-B',
      ownerId: 'own-EVIL',
    } as never);
    expect(db.inserts[0]).toMatchObject({ propertyId: 'prop-A', ownerId: 'own-1' });
  });

  it('lower-cases the email so it matches Google sign-in', async () => {
    const db = makeDb();
    await new StaffTeamService(db as never).create(meAs('GENERAL_MANAGER'), validMember as never);
    expect(db.inserts[0].email).toBe('asha@hotel.test');
  });

  it('creates as PENDING_APPROVAL by default', async () => {
    const db = makeDb();
    await new StaffTeamService(db as never).create(meAs('GENERAL_MANAGER'), validMember as never);
    expect(db.inserts[0].status).toBe('PENDING_APPROVAL');
  });

  it('creates straight to ACTIVE only when the creator can approve AND asked to', async () => {
    const db = makeDb();
    await new StaffTeamService(db as never).create(meAs('GENERAL_MANAGER'), {
      ...validMember,
      activate: true,
    } as never);
    expect(db.inserts[0].status).toBe('ACTIVE');
  });

  it('ignores activate:true from a creator without staff.approve', async () => {
    // A hand-built actor holding staff.create but not staff.approve.
    const actor = meAs('GENERAL_MANAGER', { permissions: ['staff.create'] });
    const db = makeDb();
    await new StaffTeamService(db as never).create(actor, {
      ...validMember,
      activate: true,
    } as never);
    expect(db.inserts[0].status).toBe('PENDING_APPROVAL');
  });
});

describe('StaffTeamService.approve', () => {
  it('moves a PENDING_APPROVAL member to ACTIVE', async () => {
    const db = makeDb([[{ id: 'staff-2', status: 'PENDING_APPROVAL', propertyId: 'prop-A' }]]);
    const svc = new StaffTeamService(db as never);
    await expect(svc.approve(meAs('GENERAL_MANAGER'), 'staff-2')).resolves.toEqual({
      id: 'staff-2',
      status: 'ACTIVE',
    });
    expect(db.updates[0]).toMatchObject({ status: 'ACTIVE' });
  });

  it('refuses to "approve" a BLOCKED member back into service', async () => {
    const db = makeDb([[{ id: 'staff-2', status: 'BLOCKED', propertyId: 'prop-A' }]]);
    const svc = new StaffTeamService(db as never);
    expect(await rejectionCode(svc.approve(meAs('GENERAL_MANAGER'), 'staff-2'))).toBe(
      'STAFF_FORBIDDEN',
    );
    expect(db.updates).toEqual([]);
  });
});

describe('StaffTeamService.remove', () => {
  it('soft-deletes rather than hard-deletes', async () => {
    const db = makeDb([[{ id: 'staff-2', status: 'ACTIVE', propertyId: 'prop-A' }]]);
    await new StaffTeamService(db as never).remove(meAs('GENERAL_MANAGER'), 'staff-2');
    expect(db.updates[0].deletedAt).toBeInstanceOf(Date);
  });
});
