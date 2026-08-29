import { installTestEnv } from './security-harness';
installTestEnv();

import request from 'supertest';
import type { Harness } from './security-harness';
import { authenticatedRoutes, adminPermissionRoutes } from './fixtures';
import {
  adminToken,
  ownerToken,
  staffToken,
  mfaChallengeToken,
  impersonationToken,
} from './tokens';

/**
 * §64.1 — TOKEN ISOLATION, OVER HTTP.
 *
 * `owner-token-isolation.spec.ts` already proves the three guards reject each
 * other's tokens when constructed by hand. What it cannot prove is that the
 * right guard is actually mounted on the right route. These tests present each
 * token to a real endpoint of the two surfaces it does not belong to and
 * require a rejection every time.
 *
 * Every actor below is fully valid on its OWN surface (see `fixtures.ts`), so a
 * rejection here can only be the audience separation doing its job.
 */
describe('§64.1 token isolation across the four audiences', () => {
  let h: Harness;
  const srv = () => h.app.getHttpServer();

  beforeAll(async () => {
    const { bootSecurityApp } = await import('./security-harness');
    h = await bootSecurityApp({
      ...authenticatedRoutes(),
      ...adminPermissionRoutes({ 'admin-1': ['*'] }),
    });
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  /** Admin routes, one read and one write, both behind JwtAuthGuard. */
  const ADMIN_ROUTES: [string, string][] = [
    ['get', '/api/v1/admin/owners'],
    ['get', '/api/v1/admin/audit-logs'],
    ['post', '/api/v1/admin/impersonation'],
  ];
  const OWNER_ROUTES: [string, string][] = [
    ['get', '/api/v1/owner/profile'],
    ['get', '/api/v1/owner/properties'],
    ['get', '/api/v1/owner/portfolio/summary'],
  ];
  const STAFF_ROUTES: [string, string][] = [
    ['get', '/api/v1/staff/auth/me'],
    ['get', '/api/v1/staff/rooms'],
    ['get', '/api/v1/staff/team'],
  ];

  function send(method: string, path: string, token: string) {
    const r = (request(srv()) as unknown as Record<string, (p: string) => request.Test>)[method](
      path,
    );
    return r.set('authorization', `Bearer ${token}`);
  }

  describe.each([
    { token: 'owner', surface: 'admin', mint: ownerToken, routes: ADMIN_ROUTES },
    { token: 'staff', surface: 'admin', mint: staffToken, routes: ADMIN_ROUTES },
    { token: 'admin', surface: 'owner', mint: adminToken, routes: OWNER_ROUTES },
    { token: 'staff', surface: 'owner', mint: staffToken, routes: OWNER_ROUTES },
    { token: 'admin', surface: 'staff', mint: adminToken, routes: STAFF_ROUTES },
    { token: 'owner', surface: 'staff', mint: ownerToken, routes: STAFF_ROUTES },
  ])('a $token token on the $surface surface', ({ mint, routes }) => {
    it.each(routes)('is rejected by %s %s', async (method, path) => {
      const res = await send(method, path, mint());
      expect(res.status).toBe(401);
      // Never a 500: a foreign token must be *refused*, not crash a handler.
      expect(res.body.success).toBe(false);
    });
  });

  /**
   * The fifth family. The MFA challenge is signed with the ADMIN access secret
   * — deliberately, so the same JwtService can mint it — and it carries no
   * `sid`. It therefore reaches `JwtStrategy.validate` with a *verifiable*
   * signature; only the missing session stops it. See the note in
   * `mfa-challenge-is-not-a-session.security.spec.ts`.
   */
  it('refuses the 5-minute MFA challenge token as a session token', async () => {
    const res = await send('get', '/api/v1/admin/owners', mfaChallengeToken('admin-1'));
    expect(res.status).toBe(401);
  });

  it('refuses the MFA challenge token on the owner and staff surfaces too', async () => {
    await send('get', '/api/v1/owner/profile', mfaChallengeToken()).expect(401);
    await send('get', '/api/v1/staff/auth/me', mfaChallengeToken()).expect(401);
  });

  /**
   * Impersonation is accepted by the OWNER guard alone. On the admin and staff
   * surfaces it is just another foreign token.
   */
  it('refuses an impersonation token on the admin and staff surfaces', async () => {
    await send('get', '/api/v1/admin/owners', impersonationToken()).expect(401);
    await send('get', '/api/v1/staff/auth/me', impersonationToken()).expect(401);
  });

  it('refuses a bare token with no Bearer scheme, and an empty Bearer', async () => {
    await request(srv())
      .get('/api/v1/owner/profile')
      .set('authorization', ownerToken())
      .expect(401);
    await request(srv()).get('/api/v1/owner/profile').set('authorization', 'Bearer ').expect(401);
  });
});
