import { installTestEnv } from './security-harness';
installTestEnv();

import request from 'supertest';
import type { Harness, Row, Routes } from './security-harness';
import {
  ACTIVE_ADMIN,
  ACTIVE_OWNER,
  LIVE_SESSION,
  adminPermissionRoutes,
  authenticatedRoutes,
  mergeRoutes,
} from './fixtures';
import { adminToken, impersonationToken } from './tokens';

/**
 * §64.7 — IMPERSONATION, OVER HTTP.
 *
 * `impersonation-access.spec.ts` already tests the service. What only an HTTP
 * test can show is that the OWNER API — a surface the impersonation token was
 * never minted for — enforces the same three rules: you need the permission to
 * start a session, the session is re-read on every single request, and nothing
 * you do through it may write.
 */

/** A live support session, and the same session after support hung up. */
const ACTIVE_IMPERSONATION: Row = {
  id: 'imp-1',
  actorAdminId: 'admin-1',
  targetUserType: 'OWNER',
  targetUserId: 'owner-1',
  targetOwnerId: 'owner-1',
  status: 'ACTIVE',
  endedAt: null,
  tokenJti: 'jti-1',
  startedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('§64.7 impersonation is permissioned, live-checked and read-only', () => {
  let h: Harness;
  const srv = () => h.app.getHttpServer();

  /** Mutable so a test can terminate the session between two requests. */
  let impersonation: Row;

  beforeAll(async () => {
    const { bootSecurityApp } = await import('./security-harness');
    const routes: Routes = {
      impersonation_sessions: (q) => (q.where.includes('imp-1') ? [impersonation] : []),
      admins: (q) =>
        q.where.includes('admin-nostart')
          ? [{ ...ACTIVE_ADMIN, id: 'admin-nostart' }]
          : q.where.includes('admin-1')
            ? [ACTIVE_ADMIN]
            : [],
      admin_sessions: (q) =>
        q.where.includes('admin-sess-1') ? [LIVE_SESSION('admin-sess-1')] : [],
    };
    h = await bootSecurityApp(
      mergeRoutes(
        routes,
        authenticatedRoutes(),
        adminPermissionRoutes({
          'admin-1': ['*'],
          // Holds every OTHER impersonation permission — the near-miss.
          'admin-nostart': ['impersonation.view', 'impersonation.stop', 'owner.view'],
        }),
      ),
    );
  }, 60_000);

  beforeEach(() => {
    impersonation = { ...ACTIVE_IMPERSONATION };
    h.db.reset();
  });

  afterAll(async () => {
    await h?.close();
  });

  // ------------------------------------------------------------ starting ---

  /**
   * `impersonation.view` and `impersonation.stop` are NOT enough. Being able to
   * audit or end other people's sessions must not imply being able to open one.
   */
  it('an admin without impersonation.start cannot open a session', async () => {
    const res = await request(srv())
      .post('/api/v1/admin/impersonation')
      .set('authorization', `Bearer ${adminToken({ sub: 'admin-nostart' })}`)
      .send({ targetUserType: 'OWNER', targetUserId: ACTIVE_OWNER.id, reason: 'debugging' });
    expect(res.status).toBe(403);
  });

  it('the same admin CAN still read impersonation history (control)', async () => {
    const res = await request(srv())
      .get('/api/v1/admin/impersonation/history')
      .set('authorization', `Bearer ${adminToken({ sub: 'admin-nostart' })}`);
    expect(res.status).not.toBe(403);
  });

  // ------------------------------------------------------- live-checking ---

  it('a live session serves the owner API as that owner (control)', async () => {
    const res = await request(srv())
      .get('/api/v1/owner/profile')
      .set('authorization', `Bearer ${impersonationToken()}`);
    expect(res.status).toBe(200);
  });

  /**
   * The reason the session row is re-read on EVERY request rather than trusted
   * from the ~60-minute token: hitting "end session" has to log the support
   * agent out now, not at token expiry.
   */
  it('a TERMINATED session fails on the very next request', async () => {
    await request(srv())
      .get('/api/v1/owner/profile')
      .set('authorization', `Bearer ${impersonationToken()}`)
      .expect(200);

    impersonation = { ...impersonation, status: 'TERMINATED', endedAt: new Date() };

    const after = await request(srv())
      .get('/api/v1/owner/profile')
      .set('authorization', `Bearer ${impersonationToken()}`);
    expect(after.status).not.toBe(200);
    expect(after.body.error.code).toBe('IMPERSONATION_SESSION_ENDED');
  });

  it('a token whose jti no longer matches the session row is refused', async () => {
    impersonation = { ...impersonation, tokenJti: 'jti-rotated' };
    const res = await request(srv())
      .get('/api/v1/owner/profile')
      .set('authorization', `Bearer ${impersonationToken()}`);
    expect(res.status).not.toBe(200);
    expect(res.body.error.code).toBe('IMPERSONATION_SESSION_ENDED');
  });

  it('a session that vanished entirely is refused', async () => {
    const res = await request(srv())
      .get('/api/v1/owner/profile')
      .set(
        'authorization',
        `Bearer ${impersonationToken({ sessionId: 'imp-gone' }, { jwtid: 'x' })}`,
      );
    expect(res.status).not.toBe(200);
  });

  // ---------------------------------------------------------- read-only ---

  const WRITES: [string, string, Record<string, unknown>][] = [
    ['post', '/api/v1/owner/properties', { name: 'New Hotel' }],
    ['patch', '/api/v1/owner/profile', { name: 'Renamed By Support' }],
    ['post', '/api/v1/owner/support/tickets', { subject: 'x', message: 'y' }],
    ['post', '/api/v1/owner/sessions/revoke-all', {}],
    ['delete', '/api/v1/owner/sessions/owner-sess-1', {}],
  ];

  it.each(WRITES)(
    '%s %s under impersonation returns IMPERSONATION_READ_ONLY',
    async (method, path, body) => {
      const res = await (request(srv()) as unknown as Record<string, (p: string) => request.Test>)
        [method](path)
        .set('authorization', `Bearer ${impersonationToken()}`)
        .send(body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('IMPERSONATION_READ_ONLY');
    },
  );

  /**
   * The refusal must come BEFORE the handler, not from it — otherwise a route
   * that happens to lack its own tenant check would still have written.
   */
  it('a refused write reaches no table at all', async () => {
    h.db.reset();
    await request(srv())
      .post('/api/v1/owner/properties')
      .set('authorization', `Bearer ${impersonationToken()}`)
      .send({ name: 'New Hotel' })
      .expect(403);
    expect(h.db.log.filter((q) => q.kind !== 'select')).toHaveLength(0);
  });

  // ------------------------------------------------------------- audit ----

  /**
   * DUAL IDENTITY, END TO END.
   *
   * No audit row can be produced over HTTP here, because impersonation is
   * read-only and every audited owner action is a write — so the audit shape
   * itself is covered by `impersonation-access.spec.ts`. What the HTTP surface
   * DOES have to prove is the half that only exists at this level: the response
   * carries both identities, so the owner app can raise its banner and the
   * session is never invisible to the customer.
   */
  it('the owner-facing response names the admin standing in, not just the owner', async () => {
    const res = await request(srv())
      .get('/api/v1/owner/auth/me')
      .set('authorization', `Bearer ${impersonationToken()}`);
    expect(res.status).toBe(200);

    // The owner they are standing in…
    expect(res.body.data.owner.id).toBe('owner-1');
    // …and the named admin standing there, flagged read-only so the app can
    // raise a banner the customer cannot miss.
    expect(res.body.data.impersonation).toMatchObject({
      active: true,
      byAdmin: ACTIVE_ADMIN.name,
      byAdminEmail: ACTIVE_ADMIN.email,
      sessionId: 'imp-1',
      readOnly: true,
    });
  });

  it('an ordinary owner session carries no impersonation block (control)', async () => {
    const { ownerToken } = await import('./tokens');
    const res = await request(srv())
      .get('/api/v1/owner/auth/me')
      .set('authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.impersonation).toBeFalsy();
  });
});
