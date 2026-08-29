import { installTestEnv } from './security-harness';
installTestEnv();

import request from 'supertest';
import type { Harness, QueryInfo, Row, Routes } from './security-harness';
import { ACTIVE_STAFF, LIVE_SESSION, authenticatedRoutes, mergeRoutes } from './fixtures';
import { ownerToken, staffToken } from './tokens';

/**
 * §64.3 — CROSS-TENANT / IDOR.
 *
 * The caller is owner-1 (or their receptionist at prop-1). Every id in these
 * requests belongs to owner-2 / prop-2. The answer must be **404, never 403** —
 * a 403 would confirm the record exists, which is itself a membership leak, so
 * the status code is part of the contract and not an implementation detail.
 *
 * HOW THIS CATCHES A MISSING SCOPE, rather than assuming one.
 *
 * The fixtures below hand over the foreign row when the query asks for it by
 * id, and withhold it only when the query ALSO names the caller's tenant. So:
 *
 *   - service scopes correctly  → fixture returns []       → 404 ✅
 *   - service forgets the scope → fixture returns the row  → 200 ❌ test fails
 *
 * An unscoped `WHERE id = $1` therefore fails loudly here instead of quietly
 * serving another hotel's data.
 */

const OTHER_OWNER = 'owner-2';
const OTHER_PROPERTY = 'prop-2';
const OTHER_STAFF = 'staff-2';
const OTHER_RESERVATION = 'resv-2';
const OTHER_ROOM = 'room-2';
const OTHER_ROOM_TYPE = 'rt-2';
const OTHER_INVOICE = 'inv-2';

/** The caller's own identifiers, as minted into their token. */
const MINE = ['owner-1', 'prop-1'];

/**
 * Serves `row` for a query that names `id` — unless the query is properly
 * scoped to the caller, in which case nothing matches, exactly as Postgres
 * would answer.
 */
function foreignRow(id: string, row: Row) {
  return (q: QueryInfo): Row[] => {
    if (!q.where.includes(id)) return [];
    const scoped = MINE.some((mine) => q.where.includes(mine));
    return scoped ? [] : [row];
  };
}

const FOREIGN: Routes = {
  owners: foreignRow(OTHER_OWNER, {
    id: OTHER_OWNER,
    name: 'Rival Hotels',
    status: 'ACTIVE',
    deletedAt: null,
  }),
  properties: foreignRow(OTHER_PROPERTY, {
    id: OTHER_PROPERTY,
    ownerId: OTHER_OWNER,
    name: 'Rival Grand',
    deletedAt: null,
  }),
  hotel_staff: foreignRow(OTHER_STAFF, {
    id: OTHER_STAFF,
    propertyId: OTHER_PROPERTY,
    ownerId: OTHER_OWNER,
    role: 'RECEPTIONIST',
    status: 'ACTIVE',
    deletedAt: null,
  }),
  reservations: foreignRow(OTHER_RESERVATION, {
    id: OTHER_RESERVATION,
    propertyId: OTHER_PROPERTY,
    status: 'CONFIRMED',
    deletedAt: null,
  }),
  rooms: foreignRow(OTHER_ROOM, {
    id: OTHER_ROOM,
    propertyId: OTHER_PROPERTY,
    number: '404',
    status: 'AVAILABLE',
    deletedAt: null,
  }),
  room_types: foreignRow(OTHER_ROOM_TYPE, {
    id: OTHER_ROOM_TYPE,
    propertyId: OTHER_PROPERTY,
    name: 'Rival Suite',
    deletedAt: null,
  }),
  invoices: foreignRow(OTHER_INVOICE, {
    id: OTHER_INVOICE,
    ownerId: OTHER_OWNER,
    number: 'INV-RIVAL-1',
    status: 'ISSUED',
  }),
  support_tickets: foreignRow('ticket-2', {
    id: 'ticket-2',
    ownerId: OTHER_OWNER,
    subject: 'Rival ticket',
  }),
};

/**
 * A GENERAL_MANAGER at the caller's own property.
 *
 * Needed because a receptionist lacks `roomtype.read` and `room.update`, so a
 * 403 from those routes is the permission guard doing its job, NOT a membership
 * leak — and testing tenant isolation through a permission failure would prove
 * nothing. The GM holds both permissions, which leaves the tenant boundary as
 * the only thing that can refuse them.
 */
const GM_STAFF: Row = { ...ACTIVE_STAFF, id: 'staff-gm', role: 'GENERAL_MANAGER' };
const GM_ROUTES: Routes = {
  hotel_staff: (q) => (q.where.includes('staff-gm') ? [GM_STAFF] : []),
  staff_sessions: (q) => (q.where.includes('gm-sess') ? [LIVE_SESSION('gm-sess')] : []),
};
const gmToken = () => staffToken({ sub: 'staff-gm', sid: 'gm-sess', role: 'GENERAL_MANAGER' });

describe('§64.3 cross-tenant access answers 404, never 403', () => {
  let h: Harness;
  const srv = () => h.app.getHttpServer();

  beforeAll(async () => {
    const { bootSecurityApp } = await import('./security-harness');
    // `mergeRoutes`, not a spread: `owners` and `hotel_staff` appear in BOTH
    // maps — once to sign the caller in, once to dangle the foreign row — and a
    // spread would keep only the second, turning every case below into a 401.
    h = await bootSecurityApp(mergeRoutes(authenticatedRoutes(), GM_ROUTES, FOREIGN));
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  /**
   * `authenticatedRoutes` must still win for the caller's own rows, otherwise
   * every 404 below would just be a failed sign-in.
   */
  it('the caller is genuinely signed in (control)', async () => {
    await request(srv())
      .get('/api/v1/owner/profile')
      .set('authorization', `Bearer ${ownerToken()}`)
      .expect(200);
    await request(srv())
      .get('/api/v1/staff/auth/me')
      .set('authorization', `Bearer ${staffToken()}`)
      .expect(200);
  });

  const OWNER_CASES: [string, string, string][] = [
    ['another owner’s property photos', 'get', `/api/v1/owner/properties/${OTHER_PROPERTY}/photos`],
    ['another owner’s property staff', 'get', `/api/v1/owner/properties/${OTHER_PROPERTY}/staff`],
    ['another owner’s room types', 'get', `/api/v1/owner/properties/${OTHER_PROPERTY}/room-types`],
    ['another owner’s rooms', 'get', `/api/v1/owner/properties/${OTHER_PROPERTY}/rooms`],
    ['another owner’s support ticket', 'get', '/api/v1/owner/support/tickets/ticket-2'],
  ];

  /** Routes a RECEPTIONIST is permitted, so only tenancy can refuse them. */
  const STAFF_CASES: [string, string, string][] = [
    ['a room in another property', 'get', `/api/v1/staff/rooms/${OTHER_ROOM}`],
    ['a reservation in another property', 'get', `/api/v1/staff/reservations/${OTHER_RESERVATION}`],
  ];

  /** Routes only a GM may reach at all. */
  const GM_CASES: [string, string, string][] = [
    ['a room type in another property', 'get', `/api/v1/staff/room-types/${OTHER_ROOM_TYPE}`],
  ];

  it.each(OWNER_CASES)('owner-1 asking for %s gets 404', async (_label, method, path) => {
    const res = await (request(srv()) as unknown as Record<string, (p: string) => request.Test>)
      [method](path)
      .set('authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it.each(STAFF_CASES)(
    'the receptionist at prop-1 asking for %s gets 404',
    async (_label, method, path) => {
      const res = await (request(srv()) as unknown as Record<string, (p: string) => request.Test>)
        [method](path)
        .set('authorization', `Bearer ${staffToken()}`);
      expect(res.status).toBe(404);
    },
  );

  it.each(GM_CASES)('the GM at prop-1 asking for %s gets 404', async (_label, method, path) => {
    const res = await (request(srv()) as unknown as Record<string, (p: string) => request.Test>)
      [method](path)
      .set('authorization', `Bearer ${gmToken()}`);
    expect(res.status).toBe(404);
  });

  /**
   * A write is the more dangerous half of IDOR: reading another hotel's room is
   * a disclosure, renaming it is damage. The GM holds `room.update`, so a 403
   * here would mean the permission guard answered and the tenant check was
   * never reached — 404 is the only acceptable result.
   */
  it('a write against another property’s room is 404, not 403', async () => {
    const res = await request(srv())
      .patch(`/api/v1/staff/rooms/${OTHER_ROOM}`)
      .set('authorization', `Bearer ${gmToken()}`)
      .send({ number: 'stolen' });
    expect(res.status).toBe(404);
  });

  it('an owner cannot edit staff belonging to another owner', async () => {
    const res = await request(srv())
      .patch(`/api/v1/owner/properties/${OTHER_PROPERTY}/staff/${OTHER_STAFF}`)
      .set('authorization', `Bearer ${ownerToken()}`)
      .send({ firstName: 'Stolen' });
    expect(res.status).toBe(404);
  });

  /**
   * Billing is the one place where reading someone else's row is a direct
   * financial disclosure. The owner invoice list is scoped by the token's owner
   * id, never by a client-supplied one.
   */
  it('the owner invoice list is scoped to the caller, and cannot be widened by a query param', async () => {
    const res = await request(srv())
      .get(`/api/v1/owner/subscription/invoices?ownerId=${OTHER_OWNER}`)
      .set('authorization', `Bearer ${ownerToken()}`);
    // Either the unknown param is rejected outright, or it is ignored — what
    // must never happen is a 200 carrying the other owner's invoice.
    expect([200, 400]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain(OTHER_INVOICE);
    expect(JSON.stringify(res.body)).not.toContain('INV-RIVAL-1');
  });
});
