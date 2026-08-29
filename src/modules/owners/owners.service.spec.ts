import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OwnersService } from './owners.service';
import type { OwnerFilterDto } from './dto';

/**
 * These tests exercise the transactional guarantees of owner create/delete with
 * a hand-rolled Drizzle stand-in: the query builders are chainable no-ops that
 * record what was written, and `transaction()` discards every recorded write if
 * the callback throws — exactly like a real ROLLBACK.
 */

type Row = Record<string, unknown>;

interface Recorded {
  inserts: { table: string; values: Row }[];
  updates: { table: string; set: Row }[];
}

const PLAN = {
  id: 'plan-1',
  name: 'Quarterly',
  status: 'ACTIVE',
  monthlyPrice: 400000,
  durationMonths: 3,
};

const STATE = { id: 'state-1', name: 'Kerala' };
const DISTRICT = { id: 'district-1', stateId: STATE.id, name: 'Ernakulam' };

/** A complete, valid create payload; individual tests override one field. */
const VALID = {
  name: 'Acme Hotels',
  email: 'owner@acme.com',
  phone: '+91 98950 77492',
  company: 'Acme Hospitality Pvt Ltd',
  address: '12 Marine Drive',
  pinCode: '682031',
  state: STATE.id,
  district: DISTRICT.id,
  planId: PLAN.id,
};

function tableName(t: unknown): string {
  const sym = Object.getOwnPropertySymbols(t as object).find((s) =>
    String(s).includes('drizzle:Name'),
  );
  return sym ? String((t as Record<symbol, unknown>)[sym]) : 'unknown';
}

function makeDb(cfg: {
  plan?: typeof PLAN | undefined;
  emailTaken?: boolean;
  owner?: Row | null;
  liveSubs?: Row[];
  archivedProperties?: Row[];
  failOn?: string; // table name whose insert should blow up
  state?: Row | null;
  district?: Row | null;
}) {
  const committed: Recorded = { inserts: [], updates: [] };

  const build = (sink: Recorded) => {
    const selectFrom = (table: unknown) => {
      const name = tableName(table);
      const rows: Row[] =
        name === 'subscription_plans'
          ? cfg.plan
            ? [cfg.plan as Row]
            : []
          : name === 'owners'
            ? cfg.emailTaken
              ? [{ id: 'existing' }]
              : cfg.owner
                ? [cfg.owner]
                : []
            : name === 'subscriptions'
              ? (cfg.liveSubs ?? [])
              : name === 'location_states'
                ? cfg.state === undefined
                  ? [STATE]
                  : cfg.state
                    ? [cfg.state]
                    : []
                : name === 'location_districts'
                  ? cfg.district === undefined
                    ? [DISTRICT]
                    : cfg.district
                      ? [cfg.district]
                      : []
                  : [];
      const terminal = {
        limit: async () => rows,
        orderBy: () => ({ limit: async () => rows }),
        then: (res: (v: Row[]) => unknown) => Promise.resolve(rows).then(res),
      };
      return {
        where: () => terminal,
        innerJoin: () => ({ where: () => terminal }),
        leftJoin: () => ({ where: () => terminal }),
      };
    };

    return {
      select: () => ({ from: selectFrom }),
      insert: (table: unknown) => ({
        values: (values: Row) => {
          const name = tableName(table);
          if (cfg.failOn === name) throw new Error(`simulated failure inserting ${name}`);
          sink.inserts.push({ table: name, values });
          const returned = [{ id: `${name}-id`, ...values }];
          return {
            returning: async () => returned,
            then: (res: (v: unknown) => unknown) => Promise.resolve(returned).then(res),
          };
        },
      }),
      update: (table: unknown) => ({
        set: (set: Row) => {
          const name = tableName(table);
          sink.updates.push({ table: name, set });
          const returned =
            name === 'owners'
              ? [{ id: 'owner-1', ...set }]
              : name === 'properties'
                ? (cfg.archivedProperties ?? [])
                : [{ id: 'x' }];
          return {
            where: () => ({
              returning: async () => returned,
              then: (res: (v: unknown) => unknown) => Promise.resolve(returned).then(res),
            }),
          };
        },
      }),
    };
  };

  const db = {
    ...build(committed),
    async transaction(cb: (tx: unknown) => Promise<unknown>) {
      const staged: Recorded = { inserts: [], updates: [] };
      const result = await cb(build(staged)); // throws => nothing is merged
      committed.inserts.push(...staged.inserts);
      committed.updates.push(...staged.updates);
      return result;
    },
    committed,
  };
  return db;
}

const audit = { record: jest.fn().mockResolvedValue(undefined) };

beforeEach(() => audit.record.mockClear());

describe('OwnersService.create — a plan is mandatory', () => {
  it('rejects a missing plan with PLAN_REQUIRED', async () => {
    const db = makeDb({ plan: PLAN });
    const svc = new OwnersService(db as never, audit as never);
    await expect(svc.create({ ...VALID, planId: undefined } as never)).rejects.toMatchObject({
      response: { error: 'PLAN_REQUIRED' },
    });
    expect(db.committed.inserts).toHaveLength(0);
  });

  it('rejects an unknown plan with PLAN_NOT_FOUND and writes no owner row', async () => {
    const db = makeDb({ plan: undefined });
    const svc = new OwnersService(db as never, audit as never);
    await expect(svc.create({ ...VALID, planId: 'missing' } as never)).rejects.toMatchObject({
      response: { error: 'PLAN_NOT_FOUND' },
    });
    expect(db.committed.inserts.filter((i) => i.table === 'owners')).toHaveLength(0);
  });

  it('rejects an archived plan with PLAN_INACTIVE', async () => {
    const db = makeDb({ plan: { ...PLAN, status: 'ARCHIVED' } });
    const svc = new OwnersService(db as never, audit as never);
    await expect(svc.create({ ...VALID } as never)).rejects.toMatchObject({
      response: { error: 'PLAN_INACTIVE' },
    });
    expect(db.committed.inserts.filter((i) => i.table === 'owners')).toHaveLength(0);
  });

  it('creates the owner and its subscription together', async () => {
    const db = makeDb({ plan: PLAN });
    const svc = new OwnersService(db as never, audit as never);
    const res = await svc.create({
      ...VALID,
      email: 'Owner@Acme.COM',
      startsAt: '2026-01-31T00:00:00.000Z',
    } as never);

    const tables = db.committed.inserts.map((i) => i.table);
    expect(tables).toEqual(['owners', 'subscriptions', 'subscription_events']);
    expect(res.subscription.status).toBe('ACTIVE');
    expect(res.subscription.periodPrice).toBe(PLAN.monthlyPrice * PLAN.durationMonths);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'owner.created' }));
  });

  it("derives current_period_end from the plan's durationMonths, clamping the day", async () => {
    const db = makeDb({ plan: PLAN });
    const svc = new OwnersService(db as never, audit as never);
    const res = await svc.create({
      ...VALID,
      startsAt: '2025-11-30T00:00:00.000Z',
    } as never);
    // Nov 30 + 3 months = Feb 28 (2026 is not a leap year).
    expect(res.subscription.currentPeriodEnd.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(res.subscription.durationMonths).toBe(3);
  });

  it('rolls back the owner row when the subscription insert fails', async () => {
    const db = makeDb({ plan: PLAN, failOn: 'subscriptions' });
    const svc = new OwnersService(db as never, audit as never);
    await expect(svc.create({ ...VALID } as never)).rejects.toThrow(/simulated failure/);
    // No orphan owner: nothing from the aborted transaction was committed.
    expect(db.committed.inserts).toHaveLength(0);
  });

  it('rejects a duplicate email before touching anything', async () => {
    const db = makeDb({ plan: PLAN, emailTaken: true });
    const svc = new OwnersService(db as never, audit as never);
    await expect(svc.create({ ...VALID } as never)).rejects.toThrow('Owner email already exists');
    expect(db.committed.inserts).toHaveLength(0);
  });
});

describe('OwnersService.create — location, phone and GST validation', () => {
  it('rejects a district that does not belong to the selected state', async () => {
    // The district lookup is scoped by stateId, so a mismatched pair finds nothing.
    const db = makeDb({ plan: PLAN, district: null });
    const svc = new OwnersService(db as never, audit as never);
    await expect(
      svc.create({ ...VALID, district: 'district-from-another-state' } as never),
    ).rejects.toMatchObject({ response: { error: 'INVALID_LOCATION' } });
    expect(db.committed.inserts).toHaveLength(0);
  });

  it('rejects a state that is not in the admin catalogue', async () => {
    const db = makeDb({ plan: PLAN, state: null });
    const svc = new OwnersService(db as never, audit as never);
    await expect(svc.create({ ...VALID, state: 'nope' } as never)).rejects.toMatchObject({
      response: { error: 'INVALID_LOCATION' },
    });
    expect(db.committed.inserts).toHaveLength(0);
  });

  it('stores the catalogue names alongside the ids', async () => {
    const db = makeDb({ plan: PLAN });
    const svc = new OwnersService(db as never, audit as never);
    await svc.create({ ...VALID } as never);
    const owner = db.committed.inserts.find((i) => i.table === 'owners');
    expect(owner?.values).toMatchObject({
      stateId: STATE.id,
      districtId: DISTRICT.id,
      pinCode: '682031',
      city: DISTRICT.name,
      country: 'India',
    });
    expect(owner?.values.address).toMatchObject({
      line1: '12 Marine Drive',
      state: 'Kerala',
      district: 'Ernakulam',
      pinCode: '682031',
    });
  });

  it('normalises the phone the same way the auth code does', async () => {
    const db = makeDb({ plan: PLAN });
    const svc = new OwnersService(db as never, audit as never);
    await svc.create({ ...VALID, phone: '09895077492' } as never);
    const owner = db.committed.inserts.find((i) => i.table === 'owners');
    expect(owner?.values).toMatchObject({ phone: '9895077492', mobile: '9895077492' });
  });

  it('rejects a phone that is not a 10-digit Indian mobile', async () => {
    const svc = new OwnersService(makeDb({ plan: PLAN }) as never, audit as never);
    for (const phone of ['12345', '1234567890', '+1 415 555 0100']) {
      await expect(svc.create({ ...VALID, phone } as never)).rejects.toMatchObject({
        response: { error: 'INVALID_PHONE' },
      });
    }
  });

  it('stores an absent GST as NULL and upper-cases a valid one', async () => {
    const db = makeDb({ plan: PLAN });
    const svc = new OwnersService(db as never, audit as never);
    await svc.create({ ...VALID, gstNumber: '   ' } as never);
    expect(db.committed.inserts.find((i) => i.table === 'owners')?.values.gstNumber).toBeNull();

    const db2 = makeDb({ plan: PLAN });
    const svc2 = new OwnersService(db2 as never, audit as never);
    await svc2.create({ ...VALID, gstNumber: '29abcde1234f1z5' } as never);
    expect(db2.committed.inserts.find((i) => i.table === 'owners')?.values.gstNumber).toBe(
      '29ABCDE1234F1Z5',
    );
  });

  it('rejects a malformed GSTIN', async () => {
    const svc = new OwnersService(makeDb({ plan: PLAN }) as never, audit as never);
    await expect(
      svc.create({ ...VALID, gstNumber: '29ABCDE1234F1X5' } as never),
    ).rejects.toMatchObject({ response: { error: 'INVALID_GSTIN' } });
  });
});

describe('OwnersService.remove — soft delete cascade', () => {
  const owner = { id: 'owner-1', name: 'Acme', email: 'a@b.com', deletedAt: null };

  it('soft-deletes, cancels live subscriptions and archives properties in one transaction', async () => {
    const db = makeDb({
      owner,
      liveSubs: [{ id: 'sub-1', status: 'ACTIVE' }],
      archivedProperties: [{ id: 'prop-1' }, { id: 'prop-2' }],
    });
    const svc = new OwnersService(db as never, audit as never);
    const res = await svc.remove('owner-1', 'fraud');

    expect(res).toMatchObject({
      deleted: true,
      ownerId: 'owner-1',
      subscriptionsCancelled: 1,
      propertiesArchived: 2,
    });

    const ownerUpdate = db.committed.updates.find((u) => u.table === 'owners');
    expect(ownerUpdate?.set.deletedAt).toBeInstanceOf(Date);

    const subUpdate = db.committed.updates.find((u) => u.table === 'subscriptions');
    expect(subUpdate?.set).toMatchObject({ status: 'CANCELLED', autoRenew: false });

    const propUpdate = db.committed.updates.find((u) => u.table === 'properties');
    expect(propUpdate?.set).toMatchObject({ status: 'ARCHIVED' });

    const event = db.committed.inserts.find((i) => i.table === 'subscription_events');
    expect(event?.values).toMatchObject({ type: 'status.cancelled' });
    expect((event?.values.payload as Row).cause).toBe('owner.deleted');

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'owner.deleted' }));
  });

  it('404s for an already soft-deleted owner, so it stays gone', async () => {
    const db = makeDb({ owner: { ...owner, deletedAt: new Date() } });
    const svc = new OwnersService(db as never, audit as never);
    await expect(svc.remove('owner-1')).rejects.toThrow(NotFoundException);
    expect(db.committed.updates).toHaveLength(0);
  });

  it('hides soft-deleted owners from get() — the source of list/detail/overview', async () => {
    const db = makeDb({ owner: { ...owner, deletedAt: new Date() } });
    const svc = new OwnersService(db as never, audit as never);
    await expect(svc.get('owner-1')).rejects.toThrow(NotFoundException);
    await expect(svc.listProperties('owner-1')).rejects.toThrow(NotFoundException);
  });
});

describe('OwnersService.create — typed errors are HTTP-shaped', () => {
  it('PLAN_REQUIRED is a 400', async () => {
    const db = makeDb({ plan: PLAN });
    const svc = new OwnersService(db as never, audit as never);
    await expect(svc.create({ ...VALID, planId: undefined } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

/** Reaches the private filter builder without widening the public surface. */
function listConditions(svc: OwnersService, filter: OwnerFilterDto): unknown[] {
  return (svc as unknown as { listConditions: (f: OwnerFilterDto) => unknown[] }).listConditions(
    filter,
  );
}

describe('OwnersService.list — stateId/districtId filtering', () => {
  const svc = new OwnersService({} as never, audit as never);

  it('always filters out soft-deleted owners', () => {
    // Baseline: just the `deleted_at IS NULL` guard, no user filters.
    expect(listConditions(svc, {})).toHaveLength(1);
  });

  it('adds a clause when a stateId is supplied', () => {
    expect(listConditions(svc, { stateId: 'state-1' })).toHaveLength(2);
  });

  it('adds a clause when a districtId is supplied', () => {
    expect(listConditions(svc, { districtId: 'district-1' })).toHaveLength(2);
  });

  it('stacks stateId + districtId together', () => {
    expect(listConditions(svc, { stateId: 'state-1', districtId: 'district-1' })).toHaveLength(3);
  });
});

describe('OwnersService.update — location validation', () => {
  const ownerRow = {
    id: 'owner-1',
    name: 'Acme',
    email: 'a@b.com',
    phone: '9895077492',
    company: 'Acme Hospitality',
    gstNumber: null,
    address: {
      line1: '12 Marine Drive',
      pinCode: '682031',
      state: STATE.name,
      stateId: STATE.id,
      district: DISTRICT.name,
      districtId: DISTRICT.id,
      country: 'India',
    },
    city: DISTRICT.name,
    country: 'India',
    pinCode: '682031',
    stateId: STATE.id,
    districtId: DISTRICT.id,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    lastActiveAt: null,
    deletedAt: null,
  };

  it('rejects a district that does not belong to the selected state', async () => {
    const db = makeDb({ owner: ownerRow, district: null });
    const svc = new OwnersService(db as never, audit as never);
    await expect(
      svc.update('owner-1', { state: STATE.id, district: 'district-from-another-state' } as never),
    ).rejects.toMatchObject({ response: { error: 'INVALID_LOCATION' } });
    expect(db.committed.updates.filter((u) => u.table === 'owners')).toHaveLength(0);
  });

  it('rejects an unknown state', async () => {
    const db = makeDb({ owner: ownerRow, state: null });
    const svc = new OwnersService(db as never, audit as never);
    await expect(
      svc.update('owner-1', { state: 'nope', district: DISTRICT.id } as never),
    ).rejects.toMatchObject({ response: { error: 'INVALID_LOCATION' } });
  });

  it('requires both state and district when changing the location', async () => {
    const db = makeDb({ owner: ownerRow });
    const svc = new OwnersService(db as never, audit as never);
    await expect(svc.update('owner-1', { state: STATE.id } as never)).rejects.toMatchObject({
      response: { error: 'INVALID_LOCATION' },
    });
    // Bailed out before touching the location catalogue or the owner row.
    expect(db.committed.updates.filter((u) => u.table === 'owners')).toHaveLength(0);
  });

  it('validates the pair and writes the resolved names into the address block', async () => {
    const db = makeDb({ owner: ownerRow });
    const svc = new OwnersService(db as never, audit as never);
    await svc.update('owner-1', {
      name: 'Acme Renamed',
      state: STATE.id,
      district: DISTRICT.id,
      address: '9 New Road',
    } as never);

    const update = db.committed.updates.find((u) => u.table === 'owners');
    expect(update?.set).toMatchObject({
      name: 'Acme Renamed',
      stateId: STATE.id,
      districtId: DISTRICT.id,
      city: DISTRICT.name,
    });
    expect(update?.set.address).toMatchObject({
      line1: '9 New Road',
      state: STATE.name,
      district: DISTRICT.name,
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'owner.updated' }));
  });
});
