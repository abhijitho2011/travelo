import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { mockAudit, mockDb } from '../owner-auth/testing/db.mock';
import { AuditService } from '../audit/audit.service';
import {
  AdminMfaService,
  generateRecoveryCode,
  normalizeRecoveryCode,
  verifyTotp,
} from './admin-mfa.service';
import { AuthService, isMfaChallenge } from './auth.service';
import {
  MfaKeyUnavailableError,
  decryptMfaSecret,
  encryptMfaSecret,
  isEncryptedMfaSecret,
  resolveMfaKey,
} from './mfa-crypto';

const ADMIN_SECRET = 'admin-access-secret-for-tests-32chars';
const KEY_B64 = randomBytes(32).toString('base64');

function config(over: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { MFA_SECRET_KEY: KEY_B64, ...over };
  return {
    get: (k: string) => values[k],
    getOrThrow: (k: string) => {
      if (k === 'JWT_ACCESS_SECRET') return ADMIN_SECRET;
      if (k in values) return values[k];
      throw new Error(`unexpected key ${k}`);
    },
  } as unknown as ConfigService;
}

const jwt = new JwtService({});
const admin = (over: Record<string, unknown> = {}) => ({
  id: 'admin-1',
  email: 'riya@tavelo.test',
  name: 'Riya',
  status: 'Active',
  deletedAt: null,
  mfaEnabled: false,
  mfaSecret: null,
  ...over,
});

// ---------------------------------------------------------------- crypto ---

describe('the TOTP secret is encrypted at rest', () => {
  it('round-trips through AES-256-GCM', () => {
    const key = resolveMfaKey(KEY_B64)!;
    const secret = authenticator.generateSecret();
    const sealed = encryptMfaSecret(secret, key);

    // Nothing recognisable is left in the column.
    expect(sealed).not.toContain(secret);
    expect(isEncryptedMfaSecret(sealed)).toBe(true);
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(decryptMfaSecret(sealed, key)).toBe(secret);
  });

  it('produces a different ciphertext each time (fresh IV)', () => {
    const key = resolveMfaKey(KEY_B64)!;
    expect(encryptMfaSecret('SAME', key)).not.toBe(encryptMfaSecret('SAME', key));
  });

  it('returns null rather than throwing for a wrong key or tampered value', () => {
    const key = resolveMfaKey(KEY_B64)!;
    const other = resolveMfaKey(randomBytes(32).toString('base64'))!;
    const sealed = encryptMfaSecret('JBSWY3DPEHPK3PXP', key);
    expect(decryptMfaSecret(sealed, other)).toBeNull();
    // Flip a byte in the ciphertext: the GCM tag catches it.
    const parts = sealed.split(':');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] ^= 0xff;
    expect(decryptMfaSecret(`v1:${parts[1]}:${parts[2]}:${ct.toString('base64')}`, key)).toBeNull();
    expect(decryptMfaSecret('garbage', key)).toBeNull();
  });

  it('treats an absent key as "MFA not configured", but a malformed one as an error', () => {
    expect(resolveMfaKey(undefined)).toBeNull();
    expect(resolveMfaKey('')).toBeNull();
    expect(() => resolveMfaKey('dG9vLXNob3J0')).toThrow(MfaKeyUnavailableError);
  });
});

// ------------------------------------------------------------- enrolment ---

describe('AdminMfaService enrolment', () => {
  function svcWith(dbOpts: Parameters<typeof mockDb>[0], cfg = config()) {
    const db = mockDb(dbOpts);
    const audit = mockAudit();
    return {
      db,
      audit,
      svc: new AdminMfaService(db as never, jwt, cfg, audit as unknown as AuditService),
    };
  }

  it('refuses to enrol with no MFA_SECRET_KEY rather than storing a plaintext secret', async () => {
    const { svc, db } = svcWith(
      { select: { admins: [[admin()]] } },
      config({ MFA_SECRET_KEY: undefined }),
    );
    await expect(svc.enroll('admin-1')).rejects.toMatchObject({
      response: { error: 'MFA_NOT_CONFIGURED' },
    });
    expect(db.updates).toHaveLength(0);
  });

  it('stores the secret sealed, mints 10 recovery codes, and does NOT enable MFA yet', async () => {
    const { svc, db } = svcWith({ select: { admins: [[admin()]] } });
    const out = await svc.enroll('admin-1');

    expect(out.recoveryCodes).toHaveLength(10);
    expect(new Set(out.recoveryCodes).size).toBe(10);
    expect(out.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(out.qrDataUri).toMatch(/^data:image\/png;base64,/);

    const stored = db.updates[0].values as { mfaSecret: string; mfaEnabled?: boolean };
    expect(isEncryptedMfaSecret(stored.mfaSecret)).toBe(true);
    expect(stored.mfaSecret).not.toContain(out.secret);
    // Enrolment alone must not lock the admin out of the only portal.
    expect(stored.mfaEnabled).toBeUndefined();

    // Codes are persisted as argon2 hashes, never in the clear.
    const inserted = db.inserts[0].values as unknown as { codeHash: string }[];
    expect(inserted).toHaveLength(10);
    for (const row of inserted) expect(row.codeHash).toMatch(/^\$argon2id\$/);
  });

  it('flips mfa_enabled only once a real code from the authenticator verifies', async () => {
    const key = resolveMfaKey(KEY_B64)!;
    const secret = authenticator.generateSecret();
    const row = admin({ mfaSecret: encryptMfaSecret(secret, key) });

    const bad = svcWith({ select: { admins: [[row]] } });
    await expect(bad.svc.verifyEnrolment('admin-1', '000000')).rejects.toMatchObject({
      response: { error: 'MFA_INVALID_CODE' },
    });
    expect(bad.db.updates).toHaveLength(0);

    const good = svcWith({ select: { admins: [[row]] } });
    await expect(
      good.svc.verifyEnrolment('admin-1', authenticator.generate(secret)),
    ).resolves.toEqual({ mfaEnabled: true });
    expect(good.db.updates[0].values).toMatchObject({ mfaEnabled: true });
  });
});

// ------------------------------------------------------------- challenge ---

describe('the MFA login challenge', () => {
  const key = resolveMfaKey(KEY_B64)!;
  const secret = authenticator.generateSecret();
  const enrolled = admin({ mfaEnabled: true, mfaSecret: encryptMfaSecret(secret, key) });

  function svcWith(dbOpts: Parameters<typeof mockDb>[0]) {
    const db = mockDb(dbOpts);
    const audit = mockAudit();
    return {
      db,
      audit,
      svc: new AdminMfaService(db as never, jwt, config(), audit as unknown as AuditService),
    };
  }

  it('mints a single-purpose token that carries no session and expires in 5 minutes', async () => {
    const { svc } = svcWith({});
    const challenge = await svc.issueChallenge('admin-1', 'otp');
    expect(challenge.mfaRequired).toBe(true);
    expect(challenge.expiresInSeconds).toBe(300);

    const decoded = jwt.verify(challenge.mfaToken, { secret: ADMIN_SECRET }) as Record<
      string,
      number | string
    >;
    expect(decoded.iss).toBe('tavelo-admin-mfa');
    expect(decoded.aud).toBe('tavelo-admin-mfa');
    expect(decoded.typ).toBe('mfa_challenge');
    expect((decoded.exp as number) - (decoded.iat as number)).toBe(300);
    // Nothing session-shaped in it.
    expect(decoded.sid).toBeUndefined();
  });

  it('refuses an admin access token presented in place of a challenge token', async () => {
    const { svc } = svcWith({ select: { admins: [[enrolled]] } });
    const accessToken = jwt.sign(
      { sub: 'admin-1', sid: 's1', email: 'riya@tavelo.test' },
      { secret: ADMIN_SECRET, expiresIn: '15m' },
    );
    await expect(svc.consumeChallenge(accessToken, '000000')).rejects.toMatchObject({
      response: { error: 'MFA_CHALLENGE_INVALID' },
    });
  });

  it('exchanges a challenge for the admin id when the TOTP is right', async () => {
    const { svc } = svcWith({ select: { admins: [[enrolled]] } });
    const { mfaToken } = await svc.issueChallenge('admin-1', 'google');
    await expect(svc.consumeChallenge(mfaToken, authenticator.generate(secret))).resolves.toEqual({
      adminId: 'admin-1',
      method: 'google',
      verifiedWith: 'totp',
    });
  });

  it('locks the challenge step after repeated wrong codes', async () => {
    const { svc } = svcWith({
      select: {
        admins: [[enrolled], [enrolled], [enrolled], [enrolled], [enrolled], [enrolled]],
        admin_mfa_recovery_codes: [[], [], [], [], [], []],
      },
    });
    const { mfaToken } = await svc.issueChallenge('admin-1', 'otp');
    for (let i = 0; i < 5; i++) {
      await expect(svc.consumeChallenge(mfaToken, '000000')).rejects.toMatchObject({
        response: { error: 'MFA_INVALID_CODE' },
      });
    }
    await expect(svc.consumeChallenge(mfaToken, '000000')).rejects.toMatchObject({
      response: { error: 'MFA_LOCKED' },
    });
  });
});

// -------------------------------------------------------- recovery codes ---

describe('recovery codes are strictly single use', () => {
  it('accepts an unused code, burns it, and rejects the replay', async () => {
    const key = resolveMfaKey(KEY_B64)!;
    const secret = authenticator.generateSecret();
    const enrolled = admin({ mfaEnabled: true, mfaSecret: encryptMfaSecret(secret, key) });

    const code = generateRecoveryCode();
    const hash = await argon2.hash(normalizeRecoveryCode(code), { type: argon2.argon2id });

    // First attempt: the code is unused, and the guarded UPDATE claims it.
    const first = mockDb({
      select: {
        admins: [[enrolled]],
        admin_mfa_recovery_codes: [[{ id: 'rc-1', codeHash: hash }]],
      },
      update: { admin_mfa_recovery_codes: [{ id: 'rc-1' }] },
    });
    const svc1 = new AdminMfaService(
      first as never,
      jwt,
      config(),
      mockAudit() as unknown as AuditService,
    );
    const { mfaToken } = await svc1.issueChallenge('admin-1', 'otp');
    await expect(svc1.consumeChallenge(mfaToken, code)).resolves.toMatchObject({
      adminId: 'admin-1',
      verifiedWith: 'recovery',
    });
    expect(first.updates[0].values).toMatchObject({ usedAt: expect.any(Date) });

    // Second attempt: the row is now `used_at IS NOT NULL`, so the query that
    // only selects unused codes returns nothing.
    const second = mockDb({
      select: { admins: [[enrolled]], admin_mfa_recovery_codes: [[]] },
    });
    const svc2 = new AdminMfaService(
      second as never,
      jwt,
      config(),
      mockAudit() as unknown as AuditService,
    );
    const t2 = await svc2.issueChallenge('admin-1', 'otp');
    await expect(svc2.consumeChallenge(t2.mfaToken, code)).rejects.toMatchObject({
      response: { error: 'MFA_INVALID_CODE' },
    });
  });

  it('does not spend a code when the guarded UPDATE loses the race', async () => {
    const key = resolveMfaKey(KEY_B64)!;
    const enrolled = admin({
      mfaEnabled: true,
      mfaSecret: encryptMfaSecret(authenticator.generateSecret(), key),
    });
    const code = generateRecoveryCode();
    const hash = await argon2.hash(normalizeRecoveryCode(code), { type: argon2.argon2id });
    const db = mockDb({
      select: {
        admins: [[enrolled]],
        admin_mfa_recovery_codes: [[{ id: 'rc-1', codeHash: hash }]],
      },
      // A concurrent request already claimed it: zero rows come back.
      update: { admin_mfa_recovery_codes: [] },
    });
    const svc = new AdminMfaService(
      db as never,
      jwt,
      config(),
      mockAudit() as unknown as AuditService,
    );
    const { mfaToken } = await svc.issueChallenge('admin-1', 'otp');
    await expect(svc.consumeChallenge(mfaToken, code)).rejects.toMatchObject({
      response: { error: 'MFA_INVALID_CODE' },
    });
  });

  it('mints codes from an unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRecoveryCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    }
  });
});

// --------------------------------------------- tokens require the challenge --

describe('no session is ever issued without passing the MFA challenge', () => {
  it('returns a challenge — not tokens — for an MFA-enrolled admin', async () => {
    const db = mockDb({ select: { admins: [[admin({ mfaEnabled: true })]] } });
    const audit = mockAudit();
    const mfa = new AdminMfaService(db as never, jwt, config(), audit as unknown as AuditService);
    const auth = new AuthService(
      db as never,
      jwt,
      config(),
      { getEffectivePermissions: async () => ({ roles: [], permissions: [] }) } as never,
      audit as unknown as AuditService,
      mfa,
    );

    const result = await auth.issueLoginForAdmin('admin-1', 'otp');
    expect(isMfaChallenge(result)).toBe(true);
    expect(result).not.toHaveProperty('tokens');
    // The decisive assertion: no admin_sessions row was created, so there is
    // no refresh token in existence for this attempt.
    expect(db.inserts).toHaveLength(0);
    expect(audit.entries.map((e) => e.action)).toContain('admin.login.mfa_required');
  });

  it('signs an admin without MFA straight in, as before', async () => {
    const db = mockDb({
      select: { admins: [[admin()], [admin()]] },
      insert: { admin_sessions: [{ id: 'sess-1' }] },
    });
    const audit = mockAudit();
    const mfa = new AdminMfaService(db as never, jwt, config(), audit as unknown as AuditService);
    const auth = new AuthService(
      db as never,
      jwt,
      config({ JWT_REFRESH_SECRET: 'refresh-secret-for-tests-32-chars' }),
      {
        getEffectivePermissions: async () => ({ roles: ['SUPER_ADMIN'], permissions: ['*'] }),
      } as never,
      audit as unknown as AuditService,
      mfa,
    );
    const result = await auth.issueLoginForAdmin('admin-1', 'otp');
    expect(isMfaChallenge(result)).toBe(false);
    expect(result).toHaveProperty('tokens');
  });
});

describe('verifyTotp', () => {
  it('rejects anything that is not six digits before touching the secret', () => {
    const secret = authenticator.generateSecret();
    expect(verifyTotp(secret, '12345')).toBe(false);
    expect(verifyTotp(secret, 'ABCDEF')).toBe(false);
    expect(verifyTotp(secret, '')).toBe(false);
    expect(verifyTotp(secret, authenticator.generate(secret))).toBe(true);
  });
});
