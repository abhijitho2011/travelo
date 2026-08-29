import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { requestContext } from '../../common/context/request-context';
import { ImpersonationAccessService } from '../impersonation/impersonation-access.service';
import {
  IMPERSONATION_AUDIENCE,
  IMPERSONATION_ISSUER,
} from '../impersonation/impersonation.constants';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { AuthenticatedOwner } from './current-owner.decorator';

const ADMIN_SECRET = 'admin-access-secret-for-tests-32chars';
const OWNER_SECRET = 'owner-access-secret-for-tests-32chars';

const config = {
  get: () => undefined,
  getOrThrow: (k: string) => {
    if (k === 'JWT_ACCESS_SECRET') return ADMIN_SECRET;
    if (k === 'OWNER_JWT_ACCESS_SECRET') return OWNER_SECRET;
    throw new Error(`unexpected key ${k}`);
  },
} as unknown as ConfigService;

const jwt = new JwtService({});

const impersonationToken = () =>
  jwt.sign(
    { sessionId: 'imp-1', actorAdminId: 'admin-1', targetUserId: 'own-1' },
    {
      secret: ADMIN_SECRET,
      issuer: IMPERSONATION_ISSUER,
      audience: IMPERSONATION_AUDIENCE,
      jwtid: 'jti-1',
      expiresIn: '60m',
    },
  );

const session = (over: Record<string, unknown> = {}) => ({
  id: 'imp-1',
  actorAdminId: 'admin-1',
  targetUserType: 'OWNER',
  targetUserId: 'own-1',
  targetOwnerId: 'own-1',
  status: 'ACTIVE',
  endedAt: null,
  tokenJti: 'jti-1',
  startedAt: new Date('2026-02-01T09:00:00.000Z'),
  ...over,
});

const admin = { id: 'admin-1', name: 'Riya Support', email: 'riya@tavelo.test' };
const owner = {
  id: 'own-1',
  email: 'owner@hotel.test',
  name: 'Nandini',
  status: 'ACTIVE',
  deletedAt: null,
};

/** Hands out result sets to successive `select()` calls, in order. */
function sequencedDb(sets: Record<string, unknown>[][]) {
  let call = 0;
  return {
    select() {
      const rows = sets[call++] ?? [];
      const chain: Record<string, unknown> = {};
      const ret = () => chain;
      chain.from = ret;
      chain.where = ret;
      chain.limit = async () => rows;
      return chain;
    },
  };
}

function guardFor(sets: Record<string, unknown>[][]) {
  const db = sequencedDb(sets);
  const access = new ImpersonationAccessService(db as never, jwt, config);
  return new OwnerJwtGuard(jwt, config, db as never, access);
}

function ctxFor(method: string, path: string, token: string) {
  const req: Record<string, unknown> = {
    method,
    path,
    url: path,
    headers: { authorization: `Bearer ${token}` },
  };
  return {
    req,
    ctx: { switchToHttp: () => ({ getRequest: () => req }) } as never,
  };
}

describe('the owner API honours a live impersonation token', () => {
  it('serves a GET as the targeted owner and exposes the impersonation block', async () => {
    // select order: impersonation session, actor admin, owner.
    const guard = guardFor([[session()], [admin], [owner]]);
    const { req, ctx } = ctxFor('GET', '/api/v1/owner/auth/me', impersonationToken());

    await requestContext.run({ requestId: 'r1' }, async () => {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      // Both identities are in the context for the AuditService to pick up.
      const store = requestContext.getStore()!;
      expect(store.actorAdminId).toBe('admin-1');
      expect(store.impersonatedUserId).toBe('own-1');
      expect(store.impersonationSessionId).toBe('imp-1');
    });

    const authed = req.owner as AuthenticatedOwner;
    expect(authed.id).toBe('own-1');
    expect(authed.impersonation).toMatchObject({
      active: true,
      byAdmin: 'Riya Support',
      sessionId: 'imp-1',
      startedAt: '2026-02-01T09:00:00.000Z',
    });
  });

  /**
   * Support diagnoses; it does not act as the customer. The allowlist that
   * could carve out an exception is deliberately empty.
   */
  it('refuses a POST with IMPERSONATION_READ_ONLY before it reaches a controller', async () => {
    const guard = guardFor([[session()], [admin], [owner]]);
    const { ctx } = ctxFor('POST', '/api/v1/owner/properties', impersonationToken());
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { error: 'IMPERSONATION_READ_ONLY' },
    });
  });

  it.each(['PATCH', 'PUT', 'DELETE'])('refuses %s too', async (method) => {
    const guard = guardFor([[session()], [admin], [owner]]);
    const { ctx } = ctxFor(method, '/api/v1/owner/properties/p1', impersonationToken());
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { error: 'IMPERSONATION_READ_ONLY' },
    });
  });

  it('stops serving the moment the session row is terminated', async () => {
    const guard = guardFor([[session({ status: 'TERMINATED', endedAt: new Date() })], [admin]]);
    const { ctx } = ctxFor('GET', '/api/v1/owner/auth/me', impersonationToken());
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { error: 'IMPERSONATION_SESSION_ENDED' },
    });
  });

  it('rejects an impersonation-shaped token when the access service is absent', async () => {
    // Narrow harnesses construct the guard without ImpersonationModule; that
    // must fail closed rather than fall through to the owner secret.
    const guard = new OwnerJwtGuard(jwt, config, {} as never);
    const { ctx } = ctxFor('GET', '/api/v1/owner/auth/me', impersonationToken());
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('still accepts an ordinary owner token, with no impersonation block', async () => {
    const ownerToken = jwt.sign(
      { sub: 'own-1', sid: 'sess-1', email: 'owner@hotel.test', typ: 'access' },
      {
        secret: OWNER_SECRET,
        issuer: 'tavelo-owner',
        audience: 'tavelo-owner',
        expiresIn: '15m',
      },
    );
    const guard = guardFor([
      [owner],
      [{ id: 'sess-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000) }],
    ]);
    const { req, ctx } = ctxFor('POST', '/api/v1/owner/properties', ownerToken);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // A real owner is of course allowed to write.
    expect((req.owner as AuthenticatedOwner).impersonation).toBeUndefined();
  });
});
