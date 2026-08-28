import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { OwnerJwtGuard, OWNER_AUDIENCE, OWNER_ISSUER } from './owner-jwt.guard';

const OWNER_SECRET = 'owner-access-secret-for-tests-32chars';
const ADMIN_SECRET = 'admin-access-secret-for-tests-32chars';

const config = {
  getOrThrow: (k: string) => {
    if (k === 'OWNER_JWT_ACCESS_SECRET') return OWNER_SECRET;
    throw new Error(`unexpected key ${k}`);
  },
} as never;

function ctxWith(token: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }),
    }),
  } as never;
}

describe('owner vs admin token isolation', () => {
  const jwt = new JwtService({});

  it('OwnerJwtGuard rejects an admin-signed token', async () => {
    // An admin access token: different secret, no owner issuer/audience.
    const adminToken = jwt.sign(
      { sub: 'admin1', sid: 'sess1', email: 'a@b.com' },
      { secret: ADMIN_SECRET, expiresIn: '15m' },
    );
    const guard = new OwnerJwtGuard(jwt, config, {} as never);
    await expect(guard.canActivate(ctxWith(adminToken))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('admin secret cannot verify an owner-signed token', () => {
    const ownerToken = jwt.sign(
      { sub: 'own1', sid: 'sess1', email: 'a@b.com' },
      { secret: OWNER_SECRET, issuer: OWNER_ISSUER, audience: OWNER_AUDIENCE, expiresIn: '15m' },
    );
    expect(() => jwt.verify(ownerToken, { secret: ADMIN_SECRET })).toThrow();
  });

  it('OwnerJwtGuard accepts a valid owner token for an ACTIVE owner', async () => {
    const ownerToken = jwt.sign(
      { sub: 'own1', sid: 'sess1', email: 'a@b.com', typ: 'access' },
      { secret: OWNER_SECRET, issuer: OWNER_ISSUER, audience: OWNER_AUDIENCE, expiresIn: '15m' },
    );
    // db returns an ACTIVE owner then a live session.
    let call = 0;
    const db = {
      select() {
        const rows =
          call++ === 0
            ? [{ id: 'own1', email: 'a@b.com', name: 'A', status: 'ACTIVE', deletedAt: null }]
            : [{ id: 'sess1', revokedAt: null, expiresAt: new Date(Date.now() + 60000) }];
        const chain: Record<string, unknown> = {};
        const ret = () => chain;
        chain.from = ret;
        chain.where = ret;
        chain.limit = async () => rows;
        return chain;
      },
    };
    const req: Record<string, unknown> = { headers: { authorization: `Bearer ${ownerToken}` } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as never;
    const guard = new OwnerJwtGuard(jwt, config, db as never);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((req.owner as { id: string }).id).toBe('own1');
  });
});
