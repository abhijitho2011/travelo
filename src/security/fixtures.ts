/**
 * The smallest set of rows the guards need in order to let somebody in.
 *
 * A security test is only meaningful if the *only* thing standing between the
 * caller and the data is the control being tested. Every actor below is
 * therefore fully valid — live session, ACTIVE account — so a 401/403/404 can
 * only have come from the rule under test.
 */
import type { Route, Routes, Row, QueryInfo } from './security-harness';

export const FUTURE = () => new Date(Date.now() + 3_600_000);

export const ACTIVE_ADMIN: Row = {
  id: 'admin-1',
  email: 'a@tavelo.test',
  name: 'Ada Admin',
  status: 'Active',
  deletedAt: null,
  mfaEnabled: false,
};

export const ACTIVE_OWNER: Row = {
  id: 'owner-1',
  email: 'o@hotel.test',
  name: 'Oona Owner',
  status: 'ACTIVE',
  deletedAt: null,
};

export const ACTIVE_STAFF: Row = {
  id: 'staff-1',
  propertyId: 'prop-1',
  ownerId: 'owner-1',
  role: 'RECEPTIONIST',
  email: 's@hotel.test',
  mobile: '9895077492',
  firstName: 'Asha',
  lastName: 'Menon',
  status: 'ACTIVE',
  deletedAt: null,
};

export const LIVE_SESSION = (id: string): Row => ({
  id,
  revokedAt: null,
  expiresAt: FUTURE(),
});

/**
 * Grants an admin a permission set without a roles table to maintain.
 *
 * `PermissionsService` resolves admin → roles → permissions in three queries
 * and memoises the answer per admin id, so each scenario uses a DISTINCT admin
 * id and the cache never leaks a grant from one test into the next.
 */
export function adminPermissionRoutes(grants: Record<string, string[]>): Routes {
  /** Which admin id does this WHERE clause name? */
  const who = (q: QueryInfo, prefix = ''): string | undefined =>
    Object.keys(grants).find((id) => q.where.includes(`${prefix}${id}`.toLowerCase()));

  return {
    admin_roles: (q) => {
      const id = who(q);
      return id ? [{ roleId: `role-${id}` }] : [];
    },
    roles: (q) => {
      const id = who(q, 'role-');
      return id ? [{ id: `role-${id}`, key: `key-${id}`, name: `Role ${id}` }] : [];
    },
    role_permissions: (q) => {
      const id = who(q, 'role-');
      return id ? grants[id].map((key) => ({ key })) : [];
    },
  };
}

/**
 * Guard-satisfying rows for one admin, one owner and one staff member.
 *
 * Joined SELECTs project a nested shape, so the `owners` and `hotel_staff`
 * routes answer differently depending on `q.joins` — the flat row the guard
 * reads, or the `{ o: … }` / `{ s: … }` envelope the profile handlers read.
 */
export function authenticatedRoutes(extra: Routes = {}): Routes {
  return {
    admins: (q) => (q.where.includes('admin-1') ? [ACTIVE_ADMIN] : []),
    admin_sessions: (q) => (q.where.includes('admin-sess-1') ? [LIVE_SESSION('admin-sess-1')] : []),
    owners: (q) => {
      if (!q.where.includes('owner-1')) return [];
      return q.joins.length > 0
        ? [{ o: ACTIVE_OWNER, stateName: 'Kerala', districtName: 'Ernakulam' }]
        : [ACTIVE_OWNER];
    },
    owner_sessions: (q) => (q.where.includes('owner-sess-1') ? [LIVE_SESSION('owner-sess-1')] : []),
    hotel_staff: (q) => {
      if (!q.where.includes('staff-1')) return [];
      return q.joins.length > 0
        ? [
            {
              s: ACTIVE_STAFF,
              propertyName: 'Backwater Grand',
              propertyCity: 'Kochi',
              propertyState: 'Kerala',
              ownerName: 'Oona Owner',
              ownerCompany: 'Oona Hotels',
            },
          ]
        : [ACTIVE_STAFF];
    },
    staff_sessions: (q) => (q.where.includes('staff-sess-1') ? [LIVE_SESSION('staff-sess-1')] : []),
    ...extra,
  };
}

/**
 * Merges route maps so that a table appearing in several of them is answered by
 * the FIRST map that has rows for the query. Spreading object literals would
 * instead silently drop the earlier answer — which shows up as an unexplained
 * 401, because the map that got dropped was usually the one feeding the guard.
 */
export function mergeRoutes(...maps: Routes[]): Routes {
  const out: Routes = {};
  for (const map of maps) {
    for (const [table, route] of Object.entries(map)) {
      const existing = out[table];
      if (!existing) {
        out[table] = route;
        continue;
      }
      const run = (r: Route, q: QueryInfo): Row[] => (typeof r === 'function' ? r(q) : r);
      out[table] = (q: QueryInfo) => {
        const first = run(existing, q);
        return first.length > 0 ? first : run(route, q);
      };
    }
  }
  return out;
}
