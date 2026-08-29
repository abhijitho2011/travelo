import { installTestEnv } from './security-harness';
installTestEnv();

import request from 'supertest';
import type { Harness } from './security-harness';
import { authenticatedRoutes, adminPermissionRoutes } from './fixtures';
import {
  adminToken,
  ownerToken,
  staffToken,
  algNoneToken,
  tamperedPayload,
  wrongSecretToken,
} from './tokens';
import { OWNER_ISSUER, OWNER_AUDIENCE } from '../modules/owner-auth/owner-jwt.guard';
import { STAFF_ISSUER, STAFF_AUDIENCE } from '../modules/staff-auth/staff-jwt.guard';

/**
 * §64.2 — MALFORMED AND FORGED TOKENS.
 *
 * Each forgery below describes a real, published way to get past a JWT check:
 * an `alg:none` header that some libraries honour, a signature made with a key
 * the attacker chose, a payload edited under a signature that was valid for a
 * different payload, and a token whose only flaw is that it has expired.
 *
 * The three surfaces are tested together because they use three DIFFERENT
 * verification paths — passport-jwt for admin, `JwtService.verifyAsync` in the
 * owner and staff guards — and a hardening applied to one is not automatically
 * applied to the others.
 */
describe('§64.2 forged and malformed tokens', () => {
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

  const SURFACES: {
    name: string;
    path: string;
    good: () => string;
    claims: Record<string, unknown>;
  }[] = [
    {
      name: 'admin',
      path: '/api/v1/admin/owners',
      good: () => adminToken(),
      claims: { sub: 'admin-1', sid: 'admin-sess-1', email: 'a@tavelo.test' },
    },
    {
      name: 'owner',
      path: '/api/v1/owner/profile',
      good: () => ownerToken(),
      claims: {
        sub: 'owner-1',
        sid: 'owner-sess-1',
        email: 'o@hotel.test',
        typ: 'access',
        iss: OWNER_ISSUER,
        aud: OWNER_AUDIENCE,
      },
    },
    {
      name: 'staff',
      path: '/api/v1/staff/auth/me',
      good: () => staffToken(),
      claims: {
        sub: 'staff-1',
        sid: 'staff-sess-1',
        pid: 'prop-1',
        role: 'RECEPTIONIST',
        typ: 'access',
        iss: STAFF_ISSUER,
        aud: STAFF_AUDIENCE,
      },
    },
  ];

  /** Sanity: the un-forged token for each surface really is accepted. */
  it.each(SURFACES)('$name: the genuine token is accepted (control)', async ({ path, good }) => {
    const res = await request(srv()).get(path).set('authorization', `Bearer ${good()}`);
    expect(res.status).toBe(200);
  });

  it.each(SURFACES)('$name: rejects an expired token', async ({ path, name }) => {
    const expired =
      name === 'admin'
        ? adminToken({}, { expiresIn: '-1s' })
        : name === 'owner'
          ? ownerToken({}, { expiresIn: '-1s' })
          : staffToken({}, { expiresIn: '-1s' });
    const res = await request(srv()).get(path).set('authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it.each(SURFACES)(
    '$name: rejects a signature made with the wrong secret',
    async ({ path, claims }) => {
      const exp = Math.floor(Date.now() / 1000) + 900;
      const forged = wrongSecretToken({ ...claims, iat: Math.floor(Date.now() / 1000), exp });
      const res = await request(srv()).get(path).set('authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
    },
  );

  it.each(SURFACES)(
    '$name: rejects an alg:none token with an empty signature',
    async ({ path, claims }) => {
      const exp = Math.floor(Date.now() / 1000) + 900;
      const forged = algNoneToken({ ...claims, iat: Math.floor(Date.now() / 1000), exp });
      const res = await request(srv()).get(path).set('authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
    },
  );

  /**
   * The edited-payload case. The signature is a REAL one — it was minted by the
   * server — but for different claims. Anything that decodes before it verifies
   * would happily promote `owner-1` to `owner-2` here.
   */
  it.each(SURFACES)(
    '$name: rejects a genuine signature over an edited payload',
    async ({ path, good }) => {
      const edited = tamperedPayload(good(), { sub: 'somebody-else' });
      const res = await request(srv()).get(path).set('authorization', `Bearer ${edited}`);
      expect(res.status).toBe(401);
    },
  );

  it.each(SURFACES)('$name: rejects structural garbage without a 500', async ({ path }) => {
    for (const junk of ['', 'not-a-jwt', 'a.b', 'a.b.c.d', '...', 'Zm9v.YmFy.YmF6']) {
      const res = await request(srv()).get(path).set('authorization', `Bearer ${junk}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    }
  });

  /**
   * Secret compromise alone must not be enough. A token signed with the RIGHT
   * secret but carrying another family's issuer/audience is still refused —
   * which is what makes the four audiences a boundary rather than a label.
   */
  it('rejects an owner-secret token wearing the staff issuer/audience', async () => {
    const crossed = ownerToken({}, { issuer: STAFF_ISSUER, audience: STAFF_AUDIENCE });
    await request(srv())
      .get('/api/v1/owner/profile')
      .set('authorization', `Bearer ${crossed}`)
      .expect(401);
  });

  it('rejects a staff-secret token wearing the owner issuer/audience', async () => {
    const crossed = staffToken({}, { issuer: OWNER_ISSUER, audience: OWNER_AUDIENCE });
    await request(srv())
      .get('/api/v1/staff/auth/me')
      .set('authorization', `Bearer ${crossed}`)
      .expect(401);
  });
});
