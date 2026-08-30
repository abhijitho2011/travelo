import { HttpException } from '@nestjs/common';
import { StaffAuthService } from './staff-auth.service';
import { StaffErrors } from './staff-errors';

type Row = Record<string, unknown>;

/** The error `code` the AllExceptionsFilter would surface to the app. */
function codeOf(err: unknown): string {
  const resp = (err as HttpException).getResponse() as { error?: string };
  return resp.error ?? 'UNKNOWN';
}

/**
 * Asserts the promise REJECTS with exactly this code. Written as an explicit
 * capture rather than `.catch(...)` so a call that wrongly SUCCEEDS fails the
 * test instead of silently skipping the assertion.
 */
async function expectRejectionCode(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpException);
  expect(codeOf(err)).toBe(code);
}

/**
 * Chainable Drizzle stand-in. `select()` returns the seeded rows; `insert()` is
 * a spy so a test can prove no row was ever created.
 */
function makeDb(rows: Row[] = []) {
  const insert = jest.fn(() => ({ values: () => ({ returning: async () => [] }) }));
  const chain = () => {
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      from: () => c,
      leftJoin: () => c,
      where: () => c,
      orderBy: () => c,
      limit: async () => rows,
    });
    return c;
  };
  return {
    select: () => chain(),
    insert,
    update: () => ({ set: () => ({ where: async () => [] }) }),
  };
}

const TOKENS = { accessToken: 'staff-access', refreshToken: 'staff-refresh' };

function makeTokens() {
  return { issueForStaff: jest.fn(async () => TOKENS) };
}

function staffRow(over: Row = {}): Row {
  return {
    id: 'staff-1',
    propertyId: 'prop-1',
    ownerId: 'own-1',
    role: 'RECEPTIONIST',
    firstName: 'Asha',
    lastName: 'Menon',
    email: 'asha@hotel.test',
    mobile: '9895077492',
    employeeId: 'EMP-7',
    department: 'Front Office',
    status: 'ACTIVE',
    ...over,
  };
}

describe('StaffAuthService — OTP request non-disclosure', () => {
  function setup(generated: { otp: string; expiresAt: Date } | null) {
    const sms = { sendOtp: jest.fn(async () => undefined) };
    const otp = {
      enforceRequestRateLimit: jest.fn(async () => undefined),
      generateForMobile: jest.fn(async () => generated),
      genericExpiry: () => new Date(Date.now() + 600000),
    };
    const svc = new StaffAuthService(
      makeDb() as never,
      sms as never,
      otp as never,
      makeTokens() as never,
      {} as never,
      { issueChallenge: jest.fn() } as never,
    );
    return { svc, sms, otp };
  }

  it('returns the generic envelope and sends NO sms for an unregistered mobile', async () => {
    const { svc, sms } = setup(null);
    const res = await svc.requestOtp('9000000000');
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(res.message).toMatch(/if a staff account exists/i);
    expect(typeof res.expiresAt).toBe('string');
  });

  it('returns the SAME envelope and does send an sms for a registered mobile', async () => {
    const { svc, sms } = setup({ otp: '123456', expiresAt: new Date(Date.now() + 600000) });
    const res = await svc.requestOtp('9895077492');
    expect(sms.sendOtp).toHaveBeenCalledWith('9895077492', '123456');
    // Byte-for-byte identical message + identical key set: nothing distinguishes
    // a registered number from an unregistered one.
    const other = await setup(null).svc.requestOtp('9000000000');
    expect(res.message).toBe(other.message);
    expect(Object.keys(res).sort()).toEqual(Object.keys(other).sort());
  });

  it('still answers generically when the SMS gateway throws', async () => {
    const { svc } = (() => {
      const sms = {
        sendOtp: jest.fn(async () => {
          throw new Error('gateway down');
        }),
      };
      const otp = {
        enforceRequestRateLimit: jest.fn(async () => undefined),
        generateForMobile: jest.fn(async () => ({
          otp: '123456',
          expiresAt: new Date(Date.now() + 600000),
        })),
        genericExpiry: () => new Date(),
      };
      return {
        svc: new StaffAuthService(
          makeDb() as never,
          sms as never,
          otp as never,
          makeTokens() as never,
          {} as never,
          { issueChallenge: jest.fn() } as never,
        ),
      };
    })();
    await expect(svc.requestOtp('9895077492')).resolves.toMatchObject({
      message: expect.stringMatching(/if a staff account exists/i),
    });
  });
});

describe('StaffAuthService — OTP verify status gating', () => {
  function setup(resolved: Row | Error) {
    const otp = {
      verify: jest.fn(async () => {
        if (resolved instanceof Error) throw resolved;
        return resolved;
      }),
    };
    const tokens = makeTokens();
    const svc = new StaffAuthService(
      makeDb() as never,
      { sendOtp: jest.fn() } as never,
      otp as never,
      tokens as never,
      {} as never,
      { issueChallenge: jest.fn() } as never,
    );
    return { svc, tokens };
  }

  it('issues a token pair for an ACTIVE staff member', async () => {
    const { svc, tokens } = setup(staffRow());
    await expect(svc.verifyOtp('9895077492', '123456')).resolves.toEqual(TOKENS);
    expect(tokens.issueForStaff).toHaveBeenCalledWith({
      id: 'staff-1',
      propertyId: 'prop-1',
      role: 'RECEPTIONIST',
    });
  });

  const cases: [string, string][] = [
    ['INVITED', 'ACCOUNT_INVITED'],
    ['PENDING_APPROVAL', 'ACCOUNT_PENDING_APPROVAL'],
    // Approved-but-not-activated is still the "waiting" screen for the member.
    ['APPROVED', 'ACCOUNT_PENDING_APPROVAL'],
    ['BLOCKED', 'ACCOUNT_BLOCKED'],
    ['SUSPENDED', 'ACCOUNT_SUSPENDED'],
    ['DEACTIVATED', 'ACCOUNT_DEACTIVATED'],
  ];

  it.each(cases)('rejects a %s account with %s and issues no token', async (status, code) => {
    const { svc, tokens } = setup(staffRow({ status }));
    await expectRejectionCode(svc.verifyOtp('9895077492', '123456'), code);
    expect(tokens.issueForStaff).not.toHaveBeenCalled();
  });

  it('keeps an unknown number generic — INVALID_OTP, never a status code', async () => {
    const { svc } = setup(StaffErrors.invalidOtp());
    await expectRejectionCode(svc.verifyOtp('9000000000', '123456'), 'INVALID_OTP');
  });
});

describe('StaffAuthService — Google sign-in', () => {
  function setup(rows: Row[]) {
    const db = makeDb(rows);
    const firebase = {
      verifyIdToken: jest.fn(async () => ({ email: 'asha@hotel.test', emailVerified: true })),
    };
    const tokens = makeTokens();
    const svc = new StaffAuthService(
      db as never,
      { sendOtp: jest.fn() } as never,
      {} as never,
      tokens as never,
      firebase as never,
      { issueChallenge: jest.fn() } as never,
    );
    return { svc, db, tokens };
  }

  it('NEVER auto-creates a staff account for an unknown Google identity', async () => {
    const { svc, db, tokens } = setup([]);
    await expectRejectionCode(svc.google('id-token'), 'STAFF_NOT_FOUND');
    expect(db.insert).not.toHaveBeenCalled();
    expect(tokens.issueForStaff).not.toHaveBeenCalled();
  });

  it('signs in an existing ACTIVE staff member without creating anything', async () => {
    const { svc, db, tokens } = setup([staffRow()]);
    await expect(svc.google('id-token')).resolves.toEqual(TOKENS);
    expect(db.insert).not.toHaveBeenCalled();
    expect(tokens.issueForStaff).toHaveBeenCalled();
  });

  it('applies the same status gating as OTP, and still creates nothing', async () => {
    const { svc, db } = setup([staffRow({ status: 'SUSPENDED' })]);
    await expectRejectionCode(svc.google('id-token'), 'ACCOUNT_SUSPENDED');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects a verified identity that carries no email', async () => {
    const db = makeDb([]);
    const svc = new StaffAuthService(
      db as never,
      { sendOtp: jest.fn() } as never,
      {} as never,
      makeTokens() as never,
      { verifyIdToken: jest.fn(async () => ({ email: null })) } as never,
      { issueChallenge: jest.fn() } as never,
    );
    await expectRejectionCode(svc.google('id-token'), 'STAFF_NOT_FOUND');
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('StaffAuthService.me — the app’s role-detection payload', () => {
  it('returns user, hotel, organization, role and resolved permissions', async () => {
    const db = makeDb([
      {
        s: staffRow(),
        propertyName: 'Sea Breeze Resort',
        propertyCity: 'Kochi',
        propertyState: 'Kerala',
        ownerName: 'Ravi Owner',
        ownerCompany: 'Acme Hospitality',
      },
    ]);
    const svc = new StaffAuthService(
      db as never,
      { sendOtp: jest.fn() } as never,
      {} as never,
      makeTokens() as never,
      {} as never,
      { issueChallenge: jest.fn() } as never,
    );
    const me = await svc.me('staff-1');

    expect(me.user).toEqual({
      id: 'staff-1',
      firstName: 'Asha',
      lastName: 'Menon',
      fullName: 'Asha Menon',
      email: 'asha@hotel.test',
      mobile: '9895077492',
      employeeId: 'EMP-7',
      department: 'Front Office',
      status: 'ACTIVE',
    });
    expect(me.hotel).toEqual({
      id: 'prop-1',
      name: 'Sea Breeze Resort',
      city: 'Kochi',
      state: 'Kerala',
    });
    expect(me.organization).toEqual({ id: 'own-1', name: 'Acme Hospitality' });
    expect(me.role).toBe('RECEPTIONIST');
    expect(me.permissions).toContain('checkin.perform');
    expect(me.permissions).not.toContain('finance.read');
  });

  it('falls back to the owner contact name when the company is null', async () => {
    const db = makeDb([
      {
        s: staffRow(),
        propertyName: 'Sea Breeze Resort',
        propertyCity: 'Kochi',
        propertyState: 'Kerala',
        ownerName: 'Ravi Owner',
        ownerCompany: null,
      },
    ]);
    const svc = new StaffAuthService(
      db as never,
      { sendOtp: jest.fn() } as never,
      {} as never,
      makeTokens() as never,
      {} as never,
      { issueChallenge: jest.fn() } as never,
    );
    expect((await svc.me('staff-1')).organization.name).toBe('Ravi Owner');
  });
});
