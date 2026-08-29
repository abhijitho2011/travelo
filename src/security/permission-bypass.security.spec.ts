import { installTestEnv } from './security-harness';
installTestEnv();

import request from 'supertest';
import type { Harness, Row, Routes } from './security-harness';
import {
  ACTIVE_STAFF,
  LIVE_SESSION,
  adminPermissionRoutes,
  authenticatedRoutes,
  mergeRoutes,
} from './fixtures';
import { adminToken, staffToken } from './tokens';
import { creatableRolesFor } from '../modules/staff-auth/role-creation';

/**
 * §64.4 — PERMISSION BYPASS, WITH A KNOWN-GOOD URL AND PAYLOAD.
 *
 * The trap this avoids: a 403 proves nothing if the request would have failed
 * anyway. Every request below is one the SAME endpoint would accept from a
 * correctly-privileged caller — the URL resolves, the body passes validation,
 * the target row exists — so the only difference between it and a success is
 * who is asking. Each case is paired with that success as a control.
 */

const OWNER_UUID = '11111111-1111-4111-8111-111111111111';
const SUB_UUID = '22222222-2222-4222-8222-222222222222';

/** Three staff actors at the same property, differing only in role. */
const STAFF: Record<string, Row> = {
  'staff-hr': { ...ACTIVE_STAFF, id: 'staff-hr', role: 'HR' },
  'staff-gm': { ...ACTIVE_STAFF, id: 'staff-gm', role: 'GENERAL_MANAGER' },
  'staff-rc': { ...ACTIVE_STAFF, id: 'staff-rc', role: 'RECEPTIONIST' },
};

/** A colleague waiting for approval, and a room — both at the caller's property. */
const PENDING_HIRE: Row = {
  ...ACTIVE_STAFF,
  id: 'staff-pending',
  role: 'WAITER',
  status: 'PENDING_APPROVAL',
};
const OWN_ROOM: Row = {
  id: 'room-1',
  propertyId: 'prop-1',
  roomTypeId: 'rt-1',
  number: '101',
  status: 'AVAILABLE',
  deletedAt: null,
};

const STAFF_ROUTES: Routes = {
  hotel_staff: (q) => {
    const hit = Object.keys(STAFF).find((id) => q.where.includes(id));
    if (hit) return [STAFF[hit]];
    if (q.where.includes('staff-pending')) return [PENDING_HIRE];
    return [];
  },
  staff_sessions: (q) => {
    const m = /sess-(hr|gm|rc)/.exec(q.where);
    return m ? [LIVE_SESSION(`sess-${m[1]}`)] : [];
  },
  rooms: (q) => (q.where.includes('room-1') ? [OWN_ROOM] : []),
};

const asStaff = (who: 'hr' | 'gm' | 'rc') =>
  staffToken({ sub: `staff-${who}`, sid: `sess-${who}` });

const VALID_HIRE = {
  firstName: 'New',
  lastName: 'Person',
  mobile: '9895077493',
  email: 'new.person@hotel.test',
};

const VALID_MANUAL_PAYMENT = {
  ownerId: OWNER_UUID,
  subscriptionId: SUB_UUID,
  amountPaise: 500000,
  method: 'UPI',
  reference: 'UPI-REF-1',
};

describe('§64.4 permission bypass', () => {
  let h: Harness;
  const srv = () => h.app.getHttpServer();

  beforeAll(async () => {
    const { bootSecurityApp } = await import('./security-harness');
    h = await bootSecurityApp(
      mergeRoutes(
        authenticatedRoutes(),
        STAFF_ROUTES,
        // Distinct admin ids: `PermissionsService` memoises per admin, so one
        // grant must never be able to leak into another scenario.
        adminPermissionRoutes({
          'admin-1': ['*'],
          'admin-ops': ['owner.view', 'property.view', 'billing.view', 'audit.view'],
          'admin-fin': ['payment.record', 'audit.view', 'audit.export'],
        }),
        {
          admins: (q) =>
            /admin-(ops|fin)/.test(q.where)
              ? [
                  {
                    id: /admin-(ops|fin)/.exec(q.where)![0],
                    email: 'x@tavelo.test',
                    name: 'X',
                    status: 'Active',
                    deletedAt: null,
                  },
                ]
              : [],
          admin_sessions: (q) =>
            q.where.includes('sess-admin2') ? [LIVE_SESSION('sess-admin2')] : [],
        },
      ),
    );
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  const admin = (id: string) => adminToken({ sub: id, sid: 'sess-admin2' });

  // ------------------------------------------------------- staff.approve ---

  /**
   * The rule HR exists to enforce: HR raises an account, somebody senior turns
   * it on. HR holds `staff.create` and `staff.update` but never `staff.approve`.
   */
  it('HR cannot approve the account they created', async () => {
    const res = await request(srv())
      .post('/api/v1/staff/team/staff-pending/approve')
      .set('authorization', `Bearer ${asStaff('hr')}`);
    expect(res.status).toBe(403);
  });

  it('the GM CAN approve the same account at the same URL (control)', async () => {
    const res = await request(srv())
      .post('/api/v1/staff/team/staff-pending/approve')
      .set('authorization', `Bearer ${asStaff('gm')}`);
    expect(res.status).not.toBe(403);
  });

  it('a receptionist cannot approve either', async () => {
    await request(srv())
      .post('/api/v1/staff/team/staff-pending/approve')
      .set('authorization', `Bearer ${asStaff('rc')}`)
      .expect(403);
  });

  // ------------------------------------------------------- role creation ---

  /**
   * Two locks on the same door, and both are asserted.
   *
   * GM/AGM are not in the DTO's `@IsIn` whitelist at all, so they are refused
   * at validation (400) before any handler runs. HR is in that whitelist — some
   * roles may create an HR — so HR-creates-HR travels all the way to
   * `creatableRolesFor`, which is where it is stopped.
   */
  it.each(['GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER'])(
    'nobody, HR included, may create a %s — the DTO whitelist refuses it outright',
    async (role) => {
      const res = await request(srv())
        .post('/api/v1/staff/team')
        .set('authorization', `Bearer ${asStaff('hr')}`)
        .send({ ...VALID_HIRE, role });
      expect(res.status).toBe(400);
    },
  );

  it('HR cannot create another HR, though the payload is otherwise valid', async () => {
    const res = await request(srv())
      .post('/api/v1/staff/team')
      .set('authorization', `Bearer ${asStaff('hr')}`)
      .send({ ...VALID_HIRE, role: 'HR' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_NOT_PERMITTED');
  });

  it('the GM CAN create an HR with that identical payload (control)', async () => {
    const res = await request(srv())
      .post('/api/v1/staff/team')
      .set('authorization', `Bearer ${asStaff('gm')}`)
      .send({ ...VALID_HIRE, role: 'HR' });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(400);
  });

  /** The HTTP result above must match the helper the mobile app mirrors. */
  it('the creatable-role matrix agrees with what the API just did', () => {
    expect(creatableRolesFor('HR')).not.toContain('HR');
    expect(creatableRolesFor('HR')).not.toContain('GENERAL_MANAGER');
    expect(creatableRolesFor('GENERAL_MANAGER')).toContain('HR');
    expect(creatableRolesFor('GENERAL_MANAGER')).not.toContain('GENERAL_MANAGER');
    expect(creatableRolesFor('RECEPTIONIST')).toHaveLength(0);
  });

  // ------------------------------------------------------------- rooms ----

  /**
   * A receptionist may flip a room's STATUS (they turn rooms over) but must
   * never be able to remove one from inventory.
   */
  it('a receptionist cannot delete a room', async () => {
    const res = await request(srv())
      .delete('/api/v1/staff/rooms/room-1')
      .set('authorization', `Bearer ${asStaff('rc')}`);
    expect(res.status).toBe(403);
  });

  it('the same receptionist CAN change that room’s status (control)', async () => {
    const res = await request(srv())
      .post('/api/v1/staff/rooms/room-1/status')
      .set('authorization', `Bearer ${asStaff('rc')}`)
      .send({ status: 'DIRTY' });
    expect(res.status).not.toBe(403);
  });

  it('the GM CAN delete the same room (control)', async () => {
    const res = await request(srv())
      .delete('/api/v1/staff/rooms/room-1')
      .set('authorization', `Bearer ${asStaff('gm')}`);
    expect(res.status).not.toBe(403);
  });

  // --------------------------------------------------------- admin money ---

  it('a non-finance admin cannot record a manual payment', async () => {
    const res = await request(srv())
      .post('/api/v1/admin/billing/payments/manual')
      .set('authorization', `Bearer ${admin('admin-ops')}`)
      .send(VALID_MANUAL_PAYMENT);
    expect(res.status).toBe(403);
  });

  it('the finance admin passes the guard with that identical payload (control)', async () => {
    const res = await request(srv())
      .post('/api/v1/admin/billing/payments/manual')
      .set('authorization', `Bearer ${admin('admin-fin')}`)
      .send(VALID_MANUAL_PAYMENT);
    // The payment itself cannot settle against an empty database — but it got
    // PAST the permission guard, which is the whole point of the control.
    expect(res.status).not.toBe(403);
  });

  /**
   * The audit export needs BOTH `audit.view` and `audit.export`. `admin-ops`
   * holds the first, which is exactly the near-miss a coarse check would let
   * through: the export route resolves its permission at runtime and so does
   * NOT use `PermissionsGuard`, making it the most likely place for the check
   * to be forgotten.
   */
  it('an admin with audit.view but not audit.export cannot export audit logs', async () => {
    const res = await request(srv())
      .get('/api/v1/admin/export/audit-logs.csv')
      .set('authorization', `Bearer ${admin('admin-ops')}`);
    expect(res.status).toBe(403);
  });

  it('an admin holding both audit permissions can (control)', async () => {
    const res = await request(srv())
      .get('/api/v1/admin/export/audit-logs.csv')
      .set('authorization', `Bearer ${admin('admin-fin')}`);
    expect(res.status).toBe(200);
  });

  it('the non-finance admin CAN still read what they are entitled to (control)', async () => {
    await request(srv())
      .get('/api/v1/admin/owners')
      .set('authorization', `Bearer ${admin('admin-ops')}`)
      .expect(200);
  });

  /** An authenticated caller with no grants at all is refused, not defaulted in. */
  it('an admin with no roles is refused everywhere', async () => {
    const res = await request(srv())
      .get('/api/v1/admin/owners')
      .set('authorization', `Bearer ${adminToken({ sub: 'admin-nobody', sid: 'sess-admin2' })}`);
    expect([401, 403]).toContain(res.status);
  });
});
