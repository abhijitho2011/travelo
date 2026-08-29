import { HttpException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { StaffOtpService } from './staff-otp.service';

type Row = Record<string, unknown>;

function codeOf(err: unknown): string {
  const resp = (err as HttpException).getResponse() as { error?: string };
  return resp.error ?? 'UNKNOWN';
}

async function rejectionCode(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpException);
  return codeOf(err);
}

/** Serves one queued result set per `select()`; records inserts and updates. */
function makeDb(resultSets: Row[][]) {
  const queue = [...resultSets];
  const inserts: Row[] = [];
  const updates: Row[] = [];
  const chain = (data: Row[]) => {
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: async () => data,
    });
    return c;
  };
  return {
    inserts,
    updates,
    select: () => chain(queue.shift() ?? []),
    insert: () => ({
      values: async (v: Row) => {
        inserts.push(v);
      },
    }),
    update: () => ({
      set: (v: Row) => {
        updates.push(v);
        return { where: async () => [] };
      },
    }),
  };
}

const config = { get: () => undefined } as never;
/** Redis absent — the rate limiter must degrade to "allow", not to "deny". */
const noRedis = null as never;

function staffRow(over: Row = {}): Row {
  return { id: 'staff-1', propertyId: 'prop-1', role: 'RECEPTIONIST', status: 'ACTIVE', ...over };
}

describe('StaffOtpService.generateForMobile', () => {
  it('mints and stores a hashed OTP when the mobile belongs to a live staff row', async () => {
    const db = makeDb([[staffRow()]]);
    const svc = new StaffOtpService(db as never, noRedis, config);
    const res = await svc.generateForMobile('9895077492');
    expect(res).not.toBeNull();
    expect(res!.otp).toMatch(/^\d{6}$/);
    expect(db.inserts).toHaveLength(1);
    // The plaintext code is never persisted.
    expect(db.inserts[0].otpHash).not.toBe(res!.otp);
    await expect(argon2.verify(db.inserts[0].otpHash as string, res!.otp)).resolves.toBe(true);
  });

  it('mints nothing for an unknown mobile and writes no row', async () => {
    const db = makeDb([[]]);
    const svc = new StaffOtpService(db as never, noRedis, config);
    expect(await svc.generateForMobile('9000000000')).toBeNull();
    expect(db.inserts).toEqual([]);
  });

  it('still mints for a PENDING_APPROVAL member so they can be told their status', async () => {
    // Non-ACTIVE rows must reach verify — that is where the typed status error
    // is raised. Refusing the code here would strand them on a generic error.
    const db = makeDb([[staffRow({ status: 'PENDING_APPROVAL' })]]);
    const svc = new StaffOtpService(db as never, noRedis, config);
    expect(await svc.generateForMobile('9895077492')).not.toBeNull();
  });
});

describe('StaffOtpService.verify', () => {
  async function record(otp: string, over: Row = {}): Promise<Row> {
    return {
      id: 'otp-1',
      mobile: '9895077492',
      otpHash: await argon2.hash(otp, { type: argon2.argon2id }),
      expiresAt: new Date(Date.now() + 600000),
      attempts: 0,
      consumedAt: null,
      ...over,
    };
  }

  it('returns the staff row for a correct code and consumes the OTP', async () => {
    const db = makeDb([[await record('123456')], [staffRow()]]);
    const svc = new StaffOtpService(db as never, noRedis, config);
    await expect(svc.verify('9895077492', '123456')).resolves.toMatchObject({ id: 'staff-1' });
    expect(db.updates.some((u) => u.consumedAt instanceof Date)).toBe(true);
  });

  it('returns a NON-ACTIVE row untouched — the status verdict belongs to the caller', async () => {
    const db = makeDb([[await record('123456')], [staffRow({ status: 'BLOCKED' })]]);
    const svc = new StaffOtpService(db as never, noRedis, config);
    await expect(svc.verify('9895077492', '123456')).resolves.toMatchObject({ status: 'BLOCKED' });
  });

  it('counts a wrong code as an attempt and stays generic', async () => {
    const db = makeDb([[await record('123456')]]);
    const svc = new StaffOtpService(db as never, noRedis, config);
    expect(await rejectionCode(svc.verify('9895077492', '999999'))).toBe('INVALID_OTP');
    expect(db.updates[0]).toMatchObject({ attempts: 1 });
  });

  it('reports an expired code as OTP_EXPIRED', async () => {
    const db = makeDb([[await record('123456', { expiresAt: new Date(Date.now() - 1000) })]]);
    const svc = new StaffOtpService(db as never, noRedis, config);
    expect(await rejectionCode(svc.verify('9895077492', '123456'))).toBe('OTP_EXPIRED');
  });

  it('refuses a code that has burned through its attempt budget', async () => {
    const db = makeDb([[await record('123456', { attempts: 5 })]]);
    const svc = new StaffOtpService(db as never, noRedis, config);
    expect(await rejectionCode(svc.verify('9895077492', '123456'))).toBe('INVALID_OTP');
  });

  it('is generic when no OTP was ever issued for the number', async () => {
    const db = makeDb([[]]);
    const svc = new StaffOtpService(db as never, noRedis, config);
    expect(await rejectionCode(svc.verify('9000000000', '123456'))).toBe('INVALID_OTP');
  });

  it('is generic when the staff row vanished between request and verify', async () => {
    const db = makeDb([[await record('123456')], []]);
    const svc = new StaffOtpService(db as never, noRedis, config);
    expect(await rejectionCode(svc.verify('9895077492', '123456'))).toBe('INVALID_OTP');
  });
});

describe('StaffOtpService.enforceRequestRateLimit', () => {
  it('allows the request when Redis is unavailable', async () => {
    const svc = new StaffOtpService(makeDb([]) as never, noRedis, config);
    await expect(svc.enforceRequestRateLimit('9895077492')).resolves.toBeUndefined();
  });

  it('throttles a second request inside the 30s burst window', async () => {
    const redis = { set: async () => null, incr: async () => 1, expire: async () => 1 };
    const svc = new StaffOtpService(makeDb([]) as never, redis as never, config);
    expect(await rejectionCode(svc.enforceRequestRateLimit('9895077492'))).toBe('OTP_THROTTLED');
  });

  it('throttles past five requests in an hour', async () => {
    const redis = { set: async () => 'OK', incr: async () => 6, expire: async () => 1 };
    const svc = new StaffOtpService(makeDb([]) as never, redis as never, config);
    expect(await rejectionCode(svc.enforceRequestRateLimit('9895077492'))).toBe('OTP_THROTTLED');
  });

  it('uses a staff-namespaced Redis key so it cannot collide with the owner limiter', async () => {
    const keys: string[] = [];
    const redis = {
      set: async (k: string) => {
        keys.push(k);
        return 'OK';
      },
      incr: async (k: string) => {
        keys.push(k);
        return 1;
      },
      expire: async () => 1,
    };
    const svc = new StaffOtpService(makeDb([]) as never, redis as never, config);
    await svc.enforceRequestRateLimit('9895077492');
    expect(keys.every((k) => k.startsWith('staff:otp:'))).toBe(true);
  });
});
