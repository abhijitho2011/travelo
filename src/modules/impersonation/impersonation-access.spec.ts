import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HttpException } from '@nestjs/common';
import { requestContext } from '../../common/context/request-context';
import { AuditService } from '../audit/audit.service';
import { ImpersonationAccessService, WRITE_ALLOWLIST } from './impersonation-access.service';
import { IMPERSONATION_AUDIENCE, IMPERSONATION_ISSUER } from './impersonation.constants';

const ADMIN_SECRET = 'admin-access-secret-for-tests-32chars';

const config = {
  get: () => undefined,
  getOrThrow: (k: string) => {
    if (k === 'JWT_ACCESS_SECRET') return ADMIN_SECRET;
    throw new Error(`unexpected key ${k}`);
  },
} as unknown as ConfigService;

const jwt = new JwtService({});

function token(
  overrides: Record<string, unknown> = {},
  signOverrides: Record<string, unknown> = {},
) {
  return jwt.sign(
    { sessionId: 'imp-1', actorAdminId: 'admin-1', targetUserId: 'own-1', ...overrides },
    {
      secret: ADMIN_SECRET,
      issuer: IMPERSONATION_ISSUER,
      audience: IMPERSONATION_AUDIENCE,
      jwtid: 'jti-1',
      expiresIn: '60m',
      ...signOverrides,
    },
  );
}

/** Two sequential `select()` calls: the session row, then the admin row. */
function twoStepDb(first: Record<string, unknown>[], second: Record<string, unknown>[] = []) {
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

const activeSession = {
  id: 'imp-1',
  actorAdminId: 'admin-1',
  targetUserType: 'OWNER',
  targetUserId: 'own-1',
  targetOwnerId: 'own-1',
  status: 'ACTIVE',
  endedAt: null,
  tokenJti: 'jti-1',
  startedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const adminRow = { id: 'admin-1', name: 'Riya Support', email: 'riya@tavelo.test' };

describe('ImpersonationAccessService.authenticate', () => {
  it('accepts a token whose session row is still ACTIVE, and names the admin behind it', async () => {
    const svc = new ImpersonationAccessService(
      twoStepDb([activeSession], [adminRow]) as never,
      jwt,
      config,
    );
    const grant = await svc.authenticate(token(), 'OWNER');
    expect(grant).not.toBeNull();
    expect(grant!.sessionId).toBe('imp-1');
    expect(grant!.actorAdminId).toBe('admin-1');
    expect(grant!.targetUserId).toBe('own-1');
    expect(grant!.byAdmin).toBe('Riya Support');
  });

  /**
   * The whole point of re-reading the row: a terminated session must die on the
   * NEXT request, not when the ~60-minute token happens to expire.
   */
  it('rejects a still-valid token once the session row is TERMINATED', async () => {
    const svc = new ImpersonationAccessService(
      twoStepDb(
        [{ ...activeSession, status: 'TERMINATED', endedAt: new Date() }],
        [adminRow],
      ) as never,
      jwt,
      config,
    );
    await expect(svc.authenticate(token(), 'OWNER')).rejects.toMatchObject({
      response: { error: 'IMPERSONATION_SESSION_ENDED' },
    });
  });

  it('rejects a token whose session row has vanished', async () => {
    const svc = new ImpersonationAccessService(twoStepDb([], []) as never, jwt, config);
    await expect(svc.authenticate(token(), 'OWNER')).rejects.toMatchObject({
      response: { error: 'IMPERSONATION_SESSION_ENDED' },
    });
  });

  it('rejects a replayed token whose jti no longer matches the session', async () => {
    const svc = new ImpersonationAccessService(
      twoStepDb([{ ...activeSession, tokenJti: 'jti-rotated' }], [adminRow]) as never,
      jwt,
      config,
    );
    await expect(svc.authenticate(token(), 'OWNER')).rejects.toMatchObject({
      response: { error: 'IMPERSONATION_SESSION_ENDED' },
    });
  });

  it('refuses a GM session presented to the owner API', async () => {
    const svc = new ImpersonationAccessService(
      twoStepDb([{ ...activeSession, targetUserType: 'GM' }], [adminRow]) as never,
      jwt,
      config,
    );
    await expect(svc.authenticate(token(), 'OWNER')).rejects.toMatchObject({
      response: { error: 'IMPERSONATION_WRONG_TARGET' },
    });
  });

  it('returns null (not an error) for a token from another family', async () => {
    const svc = new ImpersonationAccessService(twoStepDb([activeSession]) as never, jwt, config);
    const foreign = jwt.sign({ sub: 'x' }, { secret: ADMIN_SECRET, expiresIn: '5m' });
    await expect(svc.authenticate(foreign, 'OWNER')).resolves.toBeNull();
  });

  it('recognises its own tokens by issuer without verifying them', () => {
    expect(ImpersonationAccessService.looksLikeImpersonationToken(token())).toBe(true);
    expect(ImpersonationAccessService.looksLikeImpersonationToken('not.a.jwt')).toBe(false);
  });
});

describe('impersonation is read-only', () => {
  it('keeps the write allowlist empty — widening it is a security decision', () => {
    expect(WRITE_ALLOWLIST).toHaveLength(0);
  });

  it('allows reads', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      expect(() =>
        ImpersonationAccessService.assertReadOnly(m, '/api/v1/owner/properties'),
      ).not.toThrow();
    }
  });

  it('refuses every state-changing verb with a typed IMPERSONATION_READ_ONLY', () => {
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      let thrown: unknown;
      try {
        ImpersonationAccessService.assertReadOnly(m, '/api/v1/owner/properties');
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect((thrown as HttpException).getResponse()).toMatchObject({
        error: 'IMPERSONATION_READ_ONLY',
      });
      expect((thrown as HttpException).getStatus()).toBe(403);
    }
  });
});

describe('an audit row written under impersonation names BOTH identities', () => {
  it('records the real admin as the actor and the owner as the impersonated user', async () => {
    const inserted: Record<string, unknown>[] = [];
    const db = {
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          inserted.push(v);
        },
      }),
    };
    const audit = new AuditService(db as never);

    await requestContext.run({ requestId: 'req-1' }, async () => {
      ImpersonationAccessService.enrichRequestContext({
        sessionId: 'imp-1',
        actorAdminId: 'admin-1',
        byAdmin: 'Riya Support',
        byAdminEmail: 'riya@tavelo.test',
        targetUserType: 'OWNER',
        targetUserId: 'own-1',
        startedAt: new Date(),
      });
      await audit.record({ action: 'owner.property.viewed', entity: 'property', entityId: 'p1' });
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      action: 'owner.property.viewed',
      // The human who is actually responsible…
      actorId: 'admin-1',
      actorEmail: 'riya@tavelo.test',
      // …and the account they were standing in.
      impersonatedUserId: 'own-1',
      requestId: 'req-1',
    });
  });

  it('leaves impersonatedUserId unset on an ordinary request', async () => {
    const inserted: Record<string, unknown>[] = [];
    const db = {
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          inserted.push(v);
        },
      }),
    };
    const audit = new AuditService(db as never);
    await requestContext.run({ requestId: 'req-2', adminId: 'admin-9' }, async () => {
      await audit.record({ action: 'admin.thing' });
    });
    expect(inserted[0]).toMatchObject({ actorId: 'admin-9' });
    expect(inserted[0].impersonatedUserId).toBeUndefined();
  });
});
