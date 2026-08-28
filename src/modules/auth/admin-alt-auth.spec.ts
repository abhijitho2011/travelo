import { normalizeMobile, mobileMatches, normalizeEmail } from '../shared-auth/mobile.util';
import { AdminOtpService } from './admin-otp.service';
import { AdminAltAuthService } from './admin-alt-auth.service';

const SUPER_MOBILE = '9895077492';
const SUPER_EMAIL = 'abhijitho2011@gmail.com';

function configWith(values: Record<string, string | undefined>) {
  return { get: (k: string) => values[k] } as never;
}

/** Minimal drizzle stub whose `select()` chain resolves to `rows`. */
function dbReturning(rows: unknown[]) {
  return {
    select() {
      const chain: Record<string, unknown> = {};
      const ret = () => chain;
      chain.from = ret;
      chain.where = ret;
      chain.orderBy = ret;
      chain.limit = async () => rows;
      return chain;
    },
    insert() {
      return { values: async () => undefined };
    },
    update() {
      return { set: () => ({ where: async () => undefined }) };
    },
  } as never;
}

describe('mobile normalisation', () => {
  it('treats every Indian formatting of the same number as equal', () => {
    for (const raw of [
      '9895077492',
      '+919895077492',
      '09895077492',
      '+91 98950 77492',
      '  919895077492 ',
      '+91-98950-77492',
    ]) {
      expect(normalizeMobile(raw)).toBe(SUPER_MOBILE);
      expect(mobileMatches(raw, SUPER_MOBILE)).toBe(true);
    }
  });

  it('rejects empty and implausible input', () => {
    expect(normalizeMobile(undefined)).toBeNull();
    expect(normalizeMobile('')).toBeNull();
    expect(normalizeMobile('abc')).toBeNull();
    expect(normalizeMobile('12345')).toBeNull();
    expect(mobileMatches(null, SUPER_MOBILE)).toBe(false);
  });

  it('does not conflate different numbers', () => {
    expect(mobileMatches('9999999999', SUPER_MOBILE)).toBe(false);
  });

  it('normalises emails case-insensitively and trimmed', () => {
    expect(normalizeEmail('  ABhijitho2011@Gmail.com ')).toBe(SUPER_EMAIL);
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe('AdminOtpService allowlist', () => {
  const svc = new AdminOtpService(
    dbReturning([]),
    null,
    configWith({ SUPER_ADMIN_MOBILE: `+91 ${SUPER_MOBILE}` }),
  );

  it('accepts the allowlisted mobile in any formatting', () => {
    expect(svc.isAllowlisted('09895077492')).toBe(true);
    expect(svc.isAllowlisted('+919895077492')).toBe(true);
  });

  it('rejects any other mobile', () => {
    expect(svc.isAllowlisted('9999999999')).toBe(false);
    expect(svc.isAllowlisted('')).toBe(false);
  });

  it('never generates an OTP for a non-allowlisted mobile', async () => {
    await expect(svc.generateForMobile('9999999999')).resolves.toBeNull();
  });

  it('verify() fails generically (INVALID_OTP) for a non-allowlisted mobile', async () => {
    await expect(svc.verify('9999999999', '123456')).rejects.toMatchObject({
      response: { error: 'INVALID_OTP' },
    });
  });

  it('is disabled — never generating an OTP — when SUPER_ADMIN_MOBILE is unset', async () => {
    const off = new AdminOtpService(dbReturning([]), null, configWith({}));
    expect(off.isAllowlisted(SUPER_MOBILE)).toBe(false);
    await expect(off.generateForMobile(SUPER_MOBILE)).resolves.toBeNull();
  });
});

describe('AdminAltAuthService', () => {
  const audit = { record: async () => undefined } as never;
  const sms = { sendOtp: jest.fn(async () => undefined) } as never;

  function build(opts: {
    env: Record<string, string | undefined>;
    verifiedEmail?: string | null;
    rows?: unknown[];
  }) {
    const config = configWith(opts.env);
    const otp = new AdminOtpService(dbReturning([]), null, config);
    const firebase = {
      verifyIdToken: async () => ({
        uid: 'u1',
        email: opts.verifiedEmail ?? null,
        emailVerified: true,
      }),
    } as never;
    const auth = {
      issueLoginForAdmin: jest.fn(async (id: string) => ({
        admin: { id, email: SUPER_EMAIL, name: 'Super Admin', roles: [], permissions: [] },
        tokens: {
          accessToken: 'a',
          refreshToken: 'r',
          accessExpiresIn: '15m',
          refreshExpiresIn: '30d',
        },
      })),
    };
    const svc = new AdminAltAuthService(
      dbReturning(opts.rows ?? []),
      sms,
      config,
      otp,
      auth as never,
      firebase,
      audit,
    );
    return { svc, auth };
  }

  it('rejects a Google email that is not the allowlisted one', async () => {
    const { svc, auth } = build({
      env: { SUPER_ADMIN_EMAIL: SUPER_EMAIL },
      verifiedEmail: 'someone.else@gmail.com',
      rows: [{ id: 'admin-1', status: 'Active' }],
    });
    await expect(svc.google('token')).rejects.toMatchObject({
      response: { error: 'ADMIN_NOT_FOUND' },
    });
    expect(auth.issueLoginForAdmin).not.toHaveBeenCalled();
  });

  it('accepts the allowlisted Google email (case/space insensitive) for an ACTIVE admin', async () => {
    const { svc, auth } = build({
      env: { SUPER_ADMIN_EMAIL: `  ${SUPER_EMAIL.toUpperCase()} ` },
      verifiedEmail: SUPER_EMAIL,
      rows: [{ id: 'admin-1', status: 'Active' }],
    });
    await expect(svc.google('token')).resolves.toMatchObject({ tokens: { accessToken: 'a' } });
    expect(auth.issueLoginForAdmin).toHaveBeenCalledWith('admin-1', 'google');
  });

  it('rejects a non-ACTIVE allowlisted admin', async () => {
    const { svc } = build({
      env: { SUPER_ADMIN_EMAIL: SUPER_EMAIL },
      verifiedEmail: SUPER_EMAIL,
      rows: [{ id: 'admin-1', status: 'Blocked' }],
    });
    await expect(svc.google('token')).rejects.toMatchObject({
      response: { error: 'ACCOUNT_BLOCKED' },
    });
  });

  it('cleanly disables Google sign-in when SUPER_ADMIN_EMAIL is unset', async () => {
    const { svc } = build({ env: {}, verifiedEmail: SUPER_EMAIL });
    await expect(svc.google('token')).rejects.toMatchObject({
      response: { error: 'GOOGLE_SIGNIN_DISABLED' },
    });
  });

  it('answers otp/request generically and sends nothing for a non-allowlisted mobile', async () => {
    const { svc } = build({ env: { SUPER_ADMIN_MOBILE: SUPER_MOBILE } });
    const res = await svc.requestOtp('9999999999');
    expect(res.message).toMatch(/if this number is registered/i);
    expect(res.expiresAt).toEqual(expect.any(String));
    expect(res.message).not.toContain(SUPER_MOBILE);
    expect((sms as unknown as { sendOtp: jest.Mock }).sendOtp).not.toHaveBeenCalled();
  });
});
