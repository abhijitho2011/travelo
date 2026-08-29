import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { OwnerJwtGuard, OWNER_AUDIENCE, OWNER_ISSUER } from './owner-jwt.guard';
import { StaffJwtGuard, STAFF_AUDIENCE, STAFF_ISSUER } from '../staff-auth/staff-jwt.guard';

const OWNER_SECRET = 'owner-access-secret-for-tests-32chars';
const ADMIN_SECRET = 'admin-access-secret-for-tests-32chars';
const STAFF_SECRET = 'staff-access-secret-for-tests-32chars';

const config = {
  getOrThrow: (k: string) => {
    if (k === 'OWNER_JWT_ACCESS_SECRET') return OWNER_SECRET;
    throw new Error(`unexpected key ${k}`);
  },
} as never;

const staffConfig = {
  getOrThrow: (k: string) => {
    if (k === 'STAFF_JWT_ACCESS_SECRET') return STAFF_SECRET;
    throw new Error(`unexpected key ${k}`);
  },
} as never;

/** A two-call chainable db stub: first select() yields `first`, then `second`. */
function twoStepDb(first: Record<string, unknown>[], second: Record<string, unknown>[]) {
  let call = 0;
  return {
    select() {
      const rows = call++ === 0 ? first : second;
      const chain: Record<string, unknown> = {};
      const ret = () => chain;
      chain.from = ret;
      chain.where = ret;
      chain.limit = async () => rows;
      return chain;
    },
  };
}

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

/**
 * Three token families now share this API: admin, owner and staff. Each is
 * signed with its own secret under its own issuer/audience and validated
 * against its own session table. This suite proves the six cross-pairings all
 * fail, so a token minted for one surface is inert on the other two.
 */
describe('three-way token isolation (admin / owner / staff)', () => {
  const jwt = new JwtService({});

  const adminToken = () =>
    jwt.sign(
      { sub: 'admin1', sid: 'sess1', email: 'a@b.com' },
      { secret: ADMIN_SECRET, expiresIn: '15m' },
    );

  const ownerToken = () =>
    jwt.sign(
      { sub: 'own1', sid: 'sess1', email: 'a@b.com', typ: 'access' },
      { secret: OWNER_SECRET, issuer: OWNER_ISSUER, audience: OWNER_AUDIENCE, expiresIn: '15m' },
    );

  const staffToken = () =>
    jwt.sign(
      { sub: 'staff1', sid: 'sess1', pid: 'prop1', role: 'RECEPTIONIST', typ: 'access' },
      { secret: STAFF_SECRET, issuer: STAFF_ISSUER, audience: STAFF_AUDIENCE, expiresIn: '15m' },
    );

  it('uses a staff issuer/audience distinct from the owner one', () => {
    expect(STAFF_ISSUER).toBe('tavelo-staff');
    expect(STAFF_AUDIENCE).toBe('tavelo-staff');
    expect(STAFF_ISSUER).not.toBe(OWNER_ISSUER);
  });

  it('StaffJwtGuard rejects an owner-signed token', async () => {
    const guard = new StaffJwtGuard(jwt, staffConfig, {} as never);
    await expect(guard.canActivate(ctxWith(ownerToken()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('StaffJwtGuard rejects an admin-signed token', async () => {
    const guard = new StaffJwtGuard(jwt, staffConfig, {} as never);
    await expect(guard.canActivate(ctxWith(adminToken()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('OwnerJwtGuard rejects a staff-signed token', async () => {
    const guard = new OwnerJwtGuard(jwt, config, {} as never);
    await expect(guard.canActivate(ctxWith(staffToken()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('neither the admin nor the owner secret can verify a staff token', () => {
    const token = staffToken();
    expect(() => jwt.verify(token, { secret: ADMIN_SECRET })).toThrow();
    expect(() => jwt.verify(token, { secret: OWNER_SECRET })).toThrow();
  });

  it('the staff secret can verify neither an admin nor an owner token', () => {
    expect(() => jwt.verify(adminToken(), { secret: STAFF_SECRET })).toThrow();
    expect(() => jwt.verify(ownerToken(), { secret: STAFF_SECRET })).toThrow();
  });

  it('a staff token signed with the right secret but the OWNER audience is still rejected', async () => {
    // Secret compromise alone is not enough: issuer/audience are checked too.
    const crossAudience = jwt.sign(
      { sub: 'staff1', sid: 'sess1', pid: 'prop1', role: 'RECEPTIONIST' },
      { secret: STAFF_SECRET, issuer: OWNER_ISSUER, audience: OWNER_AUDIENCE, expiresIn: '15m' },
    );
    const guard = new StaffJwtGuard(jwt, staffConfig, {} as never);
    await expect(guard.canActivate(ctxWith(crossAudience))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('StaffJwtGuard accepts a valid staff token and resolves permissions from the DB row', async () => {
    const db = twoStepDb(
      [
        {
          id: 'staff1',
          propertyId: 'prop1',
          ownerId: 'own1',
          role: 'RECEPTIONIST',
          email: 'a@hotel.test',
          mobile: '9895077492',
          firstName: 'Asha',
          lastName: 'Menon',
          status: 'ACTIVE',
          deletedAt: null,
        },
      ],
      [{ id: 'sess1', revokedAt: null, expiresAt: new Date(Date.now() + 60000) }],
    );
    const req: Record<string, unknown> = {
      headers: { authorization: `Bearer ${staffToken()}` },
    };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as never;
    const guard = new StaffJwtGuard(jwt, staffConfig, db as never);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const staff = req.staff as { id: string; propertyId: string; permissions: string[] };
    expect(staff.id).toBe('staff1');
    expect(staff.propertyId).toBe('prop1');
    expect(staff.permissions).toContain('checkin.perform');
  });

  it('StaffJwtGuard rejects a valid token whose staff row is no longer ACTIVE', async () => {
    // Blocking someone takes effect on their next request, not when the 15m
    // access token happens to expire.
    const db = twoStepDb(
      [{ id: 'staff1', role: 'RECEPTIONIST', status: 'BLOCKED', deletedAt: null }],
      [{ id: 'sess1', revokedAt: null, expiresAt: new Date(Date.now() + 60000) }],
    );
    const guard = new StaffJwtGuard(jwt, staffConfig, db as never);
    await expect(guard.canActivate(ctxWith(staffToken()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('StaffJwtGuard rejects a valid token whose session was revoked', async () => {
    const db = twoStepDb(
      [{ id: 'staff1', role: 'RECEPTIONIST', status: 'ACTIVE', deletedAt: null }],
      [{ id: 'sess1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 60000) }],
    );
    const guard = new StaffJwtGuard(jwt, staffConfig, db as never);
    await expect(guard.canActivate(ctxWith(staffToken()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
