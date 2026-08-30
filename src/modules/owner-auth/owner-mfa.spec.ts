import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { mockAudit, mockDb } from './testing/db.mock';
import { AuditService } from '../audit/audit.service';
import { encryptMfaSecret, resolveMfaKey } from '../auth/mfa-crypto';
import { generateRecoveryCode, normalizeRecoveryCode } from '../auth/admin-mfa.service';
import { OwnerMfaService } from './owner-mfa.service';
import { OwnerAuthService, isOwnerMfaChallenge } from './owner-auth.service';

// argon2 hashing is deliberately slow; keep the whole file under one raised cap.
jest.setTimeout(30_000);

const OWNER_SECRET = 'owner-access-secret-for-tests-32chars';
const KEY_B64 = randomBytes(32).toString('base64');

function config(over: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { MFA_SECRET_KEY: KEY_B64, ...over };
  return {
    get: (k: string) => values[k],
    getOrThrow: (k: string) => {
      if (k === 'OWNER_JWT_ACCESS_SECRET') return OWNER_SECRET;
      if (k in values) return values[k];
      throw new Error(`unexpected key ${k}`);
    },
  } as unknown as ConfigService;
}

const jwt = new JwtService({});
const owner = (over: Record<string, unknown> = {}) => ({
  id: 'owner-1',
  email: 'meera@tavelo.test',
  name: 'Meera',
  status: 'ACTIVE',
  deletedAt: null,
  mfaEnabled: false,
  mfaSecret: null,
  ...over,
});

function svcWith(dbOpts: Parameters<typeof mockDb>[0], cfg = config()) {
  const db = mockDb(dbOpts);
  const audit = mockAudit();
  return {
    db,
    audit,
    svc: new OwnerMfaService(db as never, jwt, cfg, audit as unknown as AuditService),
  };
}

describe('OwnerMfaService enrolment', () => {
  it('refuses to enrol with no MFA_SECRET_KEY rather than storing a plaintext secret', async () => {
    const { svc, db } = svcWith(
      { select: { owners: [[owner()]] } },
      config({ MFA_SECRET_KEY: undefined }),
    );
    await expect(svc.enroll('owner-1')).rejects.toMatchObject({
      response: { error: 'MFA_NOT_CONFIGURED' },
    });
    expect(db.updates).toHaveLength(0);
  });

  it('stores the secret sealed, mints 10 recovery codes, and does NOT enable MFA yet', async () => {
    const { svc, db } = svcWith({ select: { owners: [[owner()]] } });
    const out = await svc.enroll('owner-1');

    expect(out.recoveryCodes).toHaveLength(10);
    expect(out.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(out.qrDataUri).toMatch(/^data:image\/png;base64,/);

    const stored = db.updates[0].values as { mfaSecret: string; mfaEnabled?: boolean };
    expect(stored.mfaSecret.startsWith('v1:')).toBe(true);
    expect(stored.mfaSecret).not.toContain(out.secret);
    expect(stored.mfaEnabled).toBeUndefined();
  });

  it('flips mfa_enabled only once a real code from the authenticator verifies', async () => {
    const key = resolveMfaKey(KEY_B64)!;
    const secret = authenticator.generateSecret();
    const row = owner({ mfaSecret: encryptMfaSecret(secret, key) });

    const bad = svcWith({ select: { owners: [[row]] } });
    await expect(bad.svc.verifyEnrolment('owner-1', '000000')).rejects.toMatchObject({
      response: { error: 'MFA_INVALID_CODE' },
    });
    expect(bad.db.updates).toHaveLength(0);

    const good = svcWith({ select: { owners: [[row]] } });
    await expect(
      good.svc.verifyEnrolment('owner-1', authenticator.generate(secret)),
    ).resolves.toEqual({ mfaEnabled: true });
    expect(good.db.updates[0].values).toMatchObject({ mfaEnabled: true });
  });
});

describe('the owner MFA login challenge', () => {
  const key = resolveMfaKey(KEY_B64)!;
  const secret = authenticator.generateSecret();
  const enrolled = owner({ mfaEnabled: true, mfaSecret: encryptMfaSecret(secret, key) });

  it('mints a single-purpose token that carries no session and expires in 5 minutes', async () => {
    const { svc } = svcWith({});
    const challenge = await svc.issueChallenge('owner-1', 'otp');
    expect(challenge.mfaRequired).toBe(true);
    expect(challenge.expiresInSeconds).toBe(300);

    const decoded = jwt.verify(challenge.mfaToken, { secret: OWNER_SECRET }) as Record<
      string,
      number | string
    >;
    expect(decoded.iss).toBe('tavelo-owner-mfa');
    expect(decoded.aud).toBe('tavelo-owner-mfa');
    expect(decoded.typ).toBe('mfa_challenge');
    expect(decoded.sid).toBeUndefined();
  });

  it('exchanges a challenge for the owner id when the TOTP is right', async () => {
    const { svc } = svcWith({ select: { owners: [[enrolled]] } });
    const { mfaToken } = await svc.issueChallenge('owner-1', 'google');
    await expect(svc.consumeChallenge(mfaToken, authenticator.generate(secret))).resolves.toEqual({
      ownerId: 'owner-1',
      method: 'google',
      verifiedWith: 'totp',
    });
  });

  it('rejects a wrong code with MFA_INVALID_CODE and issues no session', async () => {
    const { svc } = svcWith({
      select: { owners: [[enrolled]], owner_mfa_recovery_codes: [[]] },
    });
    const { mfaToken } = await svc.issueChallenge('owner-1', 'otp');
    await expect(svc.consumeChallenge(mfaToken, '000000')).rejects.toMatchObject({
      response: { error: 'MFA_INVALID_CODE' },
    });
  });

  it('refuses a random token presented in place of a challenge token', async () => {
    const { svc } = svcWith({ select: { owners: [[enrolled]] } });
    const bogus = jwt.sign({ sub: 'owner-1' }, { secret: OWNER_SECRET, expiresIn: '15m' });
    await expect(svc.consumeChallenge(bogus, '000000')).rejects.toMatchObject({
      response: { error: 'MFA_CHALLENGE_INVALID' },
    });
  });

  it('burns a recovery code and rejects its replay', async () => {
    const code = generateRecoveryCode();
    const hash = await argon2.hash(normalizeRecoveryCode(code), { type: argon2.argon2id });

    const first = svcWith({
      select: {
        owners: [[enrolled]],
        owner_mfa_recovery_codes: [[{ id: 'rc-1', codeHash: hash }]],
      },
      update: { owner_mfa_recovery_codes: [{ id: 'rc-1' }] },
    });
    const t1 = await first.svc.issueChallenge('owner-1', 'otp');
    await expect(first.svc.consumeChallenge(t1.mfaToken, code)).resolves.toMatchObject({
      ownerId: 'owner-1',
      verifiedWith: 'recovery',
    });

    const second = svcWith({
      select: { owners: [[enrolled]], owner_mfa_recovery_codes: [[]] },
    });
    const t2 = await second.svc.issueChallenge('owner-1', 'otp');
    await expect(second.svc.consumeChallenge(t2.mfaToken, code)).rejects.toMatchObject({
      response: { error: 'MFA_INVALID_CODE' },
    });
  });
});

describe('no owner session is ever issued without passing the MFA challenge', () => {
  it('returns a challenge — not tokens — for an MFA-enrolled owner signing in with Google', async () => {
    const enrolled = owner({ mfaEnabled: true });
    const db = mockDb({
      select: { owners: [[enrolled]] },
    });
    const audit = mockAudit();
    const mfa = new OwnerMfaService(db as never, jwt, config(), audit as unknown as AuditService);
    const firebase = {
      verifyIdToken: async () => ({ email: 'meera@tavelo.test', emailVerified: true }),
    };
    const auth = new OwnerAuthService(
      db as never,
      {} as never,
      {} as never,
      { issueForOwner: async () => ({ accessToken: 'a', refreshToken: 'r' }) } as never,
      firebase as never,
      mfa,
    );

    const result = await auth.google('id-token');
    expect(isOwnerMfaChallenge(result)).toBe(true);
    // The decisive assertion: no token pair was minted for this attempt.
    expect(result).not.toHaveProperty('accessToken');
  });
});
