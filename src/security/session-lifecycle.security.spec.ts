import { installTestEnv } from './security-harness';
installTestEnv();

import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import type { Harness, Row, Routes } from './security-harness';
import {
  ACTIVE_ADMIN,
  ACTIVE_OWNER,
  ACTIVE_STAFF,
  FUTURE,
  LIVE_SESSION,
  adminPermissionRoutes,
  mergeRoutes,
} from './fixtures';
import { ADMIN_REFRESH_SECRET, adminToken, ownerToken, staffToken } from './tokens';
import { AuthService } from '../modules/auth/auth.service';

/**
 * §64.5 ACCOUNT STATE and §64.6 SESSION LIFECYCLE.
 *
 * Both sections test the same underlying promise: **a token is not a decision,
 * it is a receipt.** Every guard re-reads the account row and the session row
 * on every request, so blocking someone or revoking their session takes effect
 * on their very next call rather than whenever their 15-minute access token
 * happens to lapse. These tests hold a perfectly valid, unexpired token in one
 * hand and change the database with the other.
 */

const jwt = new JwtService({});

// ------------------------------------------------------------- state ---

/** Same three actors as everywhere else, each in a state that must lock them out. */
const BLOCKED_ADMIN: Row = { ...ACTIVE_ADMIN, id: 'admin-blocked', status: 'Blocked' };
const DELETED_ADMIN: Row = { ...ACTIVE_ADMIN, id: 'admin-deleted', deletedAt: new Date() };
const SUSPENDED_OWNER: Row = { ...ACTIVE_OWNER, id: 'owner-susp', status: 'SUSPENDED' };
const PENDING_STAFF: Row = { ...ACTIVE_STAFF, id: 'staff-pend', status: 'PENDING_APPROVAL' };
const BLOCKED_STAFF: Row = { ...ACTIVE_STAFF, id: 'staff-blk', status: 'BLOCKED' };

/**
 * Serves whichever of `rows` the WHERE clause names.
 *
 * `envelope` handles the joined SELECTs: the owner and staff profile handlers
 * project `{ o: … }` / `{ s: … }` rather than a flat row, so the same table has
 * to answer in two shapes depending on whether the query joined anything.
 */
const BY_ID =
  <T extends Row>(rows: T[], envelope?: 'o' | 's') =>
  (q: { where: string; joins: string[] }): Row[] => {
    const hit = rows.find((r) => q.where.includes(String(r.id)));
    if (!hit) return [];
    return envelope && q.joins.length > 0 ? [{ [envelope]: hit }] : [hit];
  };

describe('§64.5 a non-ACTIVE account cannot use a session', () => {
  let h: Harness;
  const srv = () => h.app.getHttpServer();

  beforeAll(async () => {
    const { bootSecurityApp } = await import('./security-harness');
    h = await bootSecurityApp(
      mergeRoutes(
        {
          admins: BY_ID([ACTIVE_ADMIN, BLOCKED_ADMIN, DELETED_ADMIN]),
          owners: BY_ID([ACTIVE_OWNER, SUSPENDED_OWNER], 'o'),
          hotel_staff: BY_ID([ACTIVE_STAFF, PENDING_STAFF, BLOCKED_STAFF], 's'),
          // Every session below is LIVE. The account state is the only reason
          // any of these requests can fail.
          admin_sessions: (q) => (q.where.includes('live-sess') ? [LIVE_SESSION('live-sess')] : []),
          owner_sessions: (q) => (q.where.includes('live-sess') ? [LIVE_SESSION('live-sess')] : []),
          staff_sessions: (q) => (q.where.includes('live-sess') ? [LIVE_SESSION('live-sess')] : []),
        },
        adminPermissionRoutes({ 'admin-1': ['*'], 'admin-blocked': ['*'], 'admin-deleted': ['*'] }),
      ),
    );
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  it('the ACTIVE versions of all three actors are admitted (control)', async () => {
    await request(srv())
      .get('/api/v1/admin/owners')
      .set('authorization', `Bearer ${adminToken({ sub: 'admin-1', sid: 'live-sess' })}`)
      .expect(200);
    await request(srv())
      .get('/api/v1/owner/profile')
      .set('authorization', `Bearer ${ownerToken({ sub: 'owner-1', sid: 'live-sess' })}`)
      .expect(200);
    await request(srv())
      .get('/api/v1/staff/auth/me')
      .set('authorization', `Bearer ${staffToken({ sub: 'staff-1', sid: 'live-sess' })}`)
      .expect(200);
  });

  it('a BLOCKED admin cannot use their still-valid access token', async () => {
    await request(srv())
      .get('/api/v1/admin/owners')
      .set('authorization', `Bearer ${adminToken({ sub: 'admin-blocked', sid: 'live-sess' })}`)
      .expect(401);
  });

  it('a soft-deleted admin cannot either', async () => {
    await request(srv())
      .get('/api/v1/admin/owners')
      .set('authorization', `Bearer ${adminToken({ sub: 'admin-deleted', sid: 'live-sess' })}`)
      .expect(401);
  });

  it('a SUSPENDED owner cannot use theirs', async () => {
    await request(srv())
      .get('/api/v1/owner/profile')
      .set('authorization', `Bearer ${ownerToken({ sub: 'owner-susp', sid: 'live-sess' })}`)
      .expect(401);
  });

  it.each(['staff-pend', 'staff-blk'])('a non-ACTIVE staff member (%s) cannot', async (id) => {
    await request(srv())
      .get('/api/v1/staff/auth/me')
      .set('authorization', `Bearer ${staffToken({ sub: id, sid: 'live-sess' })}`)
      .expect(401);
  });

  /**
   * The `PENDING_APPROVAL` case is the one with a workflow behind it: HR raises
   * an account, and until a GM approves it the holder must not be able to do
   * anything at all — not even read.
   */
  it('a PENDING_APPROVAL hire is locked out of the operational surface too', async () => {
    const t = staffToken({ sub: 'staff-pend', sid: 'live-sess' });
    await request(srv()).get('/api/v1/staff/rooms').set('authorization', `Bearer ${t}`).expect(401);
    await request(srv())
      .get('/api/v1/staff/reservations')
      .set('authorization', `Bearer ${t}`)
      .expect(401);
  });
});

// -------------------------------------------------- refresh + revocation ---

describe('§64.6 refresh-token rotation and revocation', () => {
  let h: Harness;
  const srv = () => h.app.getHttpServer();

  /** A single mutable session row, so a rotation is visible to the next request. */
  let session: Record<string, unknown>;

  /**
   * Mints exactly what `AuthService.signRefresh` mints.
   *
   * `iatOffset` backdates the issued-at second. That is not cosmetic: because
   * the production claims carry no unique id (see the DEFECT test at the foot
   * of this file), a token signed in the same second as the rotated one comes
   * out byte-identical, and a replay test would silently be replaying the NEW
   * token. Backdating guarantees the two are genuinely different tokens, so
   * what is measured below is the reuse detector and not the clock.
   */
  const refreshTokenFor = (sid: string, iatOffset = 0) =>
    jwt.sign(
      { sub: 'admin-1', sid, typ: 'refresh', iat: Math.floor(Date.now() / 1000) + iatOffset },
      { secret: ADMIN_REFRESH_SECRET, expiresIn: '30d' },
    );

  /** Applies whatever the service just wrote, as a real UPDATE would. */
  function applyWrites() {
    for (const q of h.db.log) {
      if (q.table === 'admin_sessions' && q.kind === 'update' && q.values) {
        Object.assign(session, q.values);
      }
    }
    h.db.reset();
  }

  beforeAll(async () => {
    const { bootSecurityApp } = await import('./security-harness');
    const routes: Routes = {
      admins: BY_ID([ACTIVE_ADMIN]),
      admin_sessions: (q) => (q.where.includes('rot-sess') ? [session] : []),
    };
    h = await bootSecurityApp(mergeRoutes(routes, adminPermissionRoutes({ 'admin-1': ['*'] })));
  }, 60_000);

  /** The token the session was minted with — backdated, see `refreshTokenFor`. */
  let issued: string;

  beforeEach(async () => {
    issued = refreshTokenFor('rot-sess', -5);
    session = {
      id: 'rot-sess',
      adminId: 'admin-1',
      refreshTokenHash: await AuthService.hashPassword(issued),
      revokedAt: null,
      expiresAt: FUTURE(),
      lastUsedAt: null,
    };
    h.db.reset();
  });

  afterAll(async () => {
    await h?.close();
  });

  it('a valid refresh token is exchanged for a new pair (control)', async () => {
    const res = await request(srv())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken: issued });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.refreshToken).not.toBe(issued);
  }, 20_000);

  /**
   * The core anti-replay property. Once a refresh token has been spent, the
   * stored hash is the NEW token's, so presenting the old one again cannot
   * match — and, because a mismatch is the signature of a stolen token, the
   * whole session is revoked rather than merely refused.
   */
  it('a rotated refresh token cannot be replayed, and the replay kills the session', async () => {
    const first = await request(srv())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken: issued });
    expect(first.status).toBe(200);
    applyWrites();
    // The stored hash is now the NEW token's, so the old one cannot match.
    expect(session.refreshTokenHash).toBeTruthy();

    const replay = await request(srv())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken: issued });
    expect(replay.status).toBe(401);

    applyWrites();
    // Not merely refused — a mismatch is the signature of a stolen token, so
    // the whole session is torn down and the thief's new pair dies with it.
    expect(session.revokedAt).toBeInstanceOf(Date);
  }, 30_000);

  it('the freshly issued refresh token works after the rotation', async () => {
    const first = await request(srv())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken: issued });
    const rotated = first.body.data.refreshToken as string;
    applyWrites();

    const second = await request(srv())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken: rotated });
    expect(second.status).toBe(200);
  }, 30_000);

  it('a revoked session cannot be refreshed', async () => {
    session.revokedAt = new Date();
    await request(srv())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken: issued })
      .expect(401);
  });

  it('an expired session cannot be refreshed even with the right token', async () => {
    session.expiresAt = new Date(Date.now() - 1000);
    await request(srv())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken: issued })
      .expect(401);
  });

  /** A refresh token is not an access token: the two secrets are different. */
  it('an access token presented to the refresh endpoint is refused', async () => {
    await request(srv())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken: adminToken({ sub: 'admin-1', sid: 'rot-sess' }) })
      .expect(401);
  });

  /**
   * ======================== DEFECT — REFRESH TOKENS HAVE NO `jti` ============
   *
   * All three token families sign their refresh token as exactly
   * `{ sub, sid, typ: 'refresh' }` with nothing but `expiresIn`:
   *
   *   auth.service.ts            signRefresh()
   *   owner-token.service.ts     signRefresh()
   *   staff-token.service.ts     signRefresh()
   *
   * Those claims are fully determined by the session, so two rotations of the
   * same session inside the same `iat` second produce a BYTE-IDENTICAL token.
   * Two consequences, both security-relevant:
   *
   *   1. Rotation is a no-op inside that window — the "old" token keeps working
   *      because it is indistinguishable from the new one.
   *   2. The reuse detector in `AuthService.refresh` (which revokes the whole
   *      session on a hash mismatch) cannot fire. An attacker who races the
   *      legitimate client within the same second gets a working session AND no
   *      alarm.
   *
   * FIXED: all three services now sign with `jwtid: randomUUID()`, so every
   * refresh token is unique regardless of how fast it is rotated, and the reuse
   * detector can always distinguish a replay from a fresh rotation.
   * ==========================================================================
   */
  it('a minted refresh token carries a unique id, so no two are alike', async () => {
    const res = await request(srv())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken: issued });
    expect(res.status).toBe(200);
    const decoded = jwt.decode(res.body.data.refreshToken as string) as Record<string, unknown>;
    expect(decoded.jti).toBeTruthy();
  }, 20_000);

  it('a revoked session stops the ACCESS token working on the next request', async () => {
    const access = adminToken({ sub: 'admin-1', sid: 'rot-sess' });
    await request(srv())
      .get('/api/v1/admin/owners')
      .set('authorization', `Bearer ${access}`)
      .expect(200);

    session.revokedAt = new Date();

    await request(srv())
      .get('/api/v1/admin/owners')
      .set('authorization', `Bearer ${access}`)
      .expect(401);
  });
});
