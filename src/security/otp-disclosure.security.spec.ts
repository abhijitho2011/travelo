import { installTestEnv } from './security-harness';

const ALLOWLISTED_MOBILE = '9895077492';
const UNREGISTERED_MOBILE = '9895000000';

// SUPER_ADMIN_MOBILE gates OTP sign-in and is read at import time, so it has to
// be in place before `app.module` is pulled in.
installTestEnv({ SUPER_ADMIN_MOBILE: ALLOWLISTED_MOBILE, OTP_MAX_ATTEMPTS: '3' });

import request from 'supertest';
import * as argon2 from 'argon2';
import type { Harness, Row, Routes } from './security-harness';
import { ACTIVE_ADMIN, FUTURE, mergeRoutes } from './fixtures';
import { SMS_PROVIDER } from '../modules/shared-auth/sms/sms-provider.interface';

/**
 * §64.9 — THE OTP ITSELF NEVER LEAVES THE SERVER, AND THE ENDPOINT IS NOT AN
 * ACCOUNT ORACLE.
 *
 * Three separate promises, tested separately:
 *
 *   1. The code is delivered by SMS and by nothing else. It appears in no
 *      response body, on any path, including the failure paths.
 *   2. `POST /auth/otp/request` answers identically whether or not the number
 *      is the allowlisted super-admin's. Otherwise the endpoint is a free
 *      "is this number an admin?" lookup for anyone who asks.
 *   3. Guessing is bounded. After `OTP_MAX_ATTEMPTS` wrong codes even the RIGHT
 *      code is refused.
 */

/** Captures what the server tried to send, so a test can see the real code. */
const sent: { mobile: string; otp: string }[] = [];
const capturingSms = {
  sendOtp: async (mobile: string, otp: string) => {
    sent.push({ mobile, otp });
  },
  sendText: async () => undefined,
};

/** The one admin the allowlisted mobile resolves to. */
const OTP_ADMIN: Row = { ...ACTIVE_ADMIN, mobile: ALLOWLISTED_MOBILE };

/** The stored OTP row, mutable so a test can drive the attempt counter. */
let otpRow: Row | null = null;

describe('§64.9 OTP disclosure, enumeration and lockout', () => {
  let h: Harness;
  const srv = () => h.app.getHttpServer();

  const requestOtp = (mobile: string) =>
    request(srv()).post('/api/v1/admin/auth/otp/request').send({ mobile });

  const verifyOtp = (mobile: string, otp: string) =>
    request(srv()).post('/api/v1/admin/auth/otp/verify').send({ mobile, otp });

  beforeAll(async () => {
    const { bootSecurityApp } = await import('./security-harness');
    const routes: Routes = {
      admins: (q) =>
        q.where.includes(ALLOWLISTED_MOBILE) || q.where.includes('admin-1') ? [OTP_ADMIN] : [],
      admin_otps: () => (otpRow ? [otpRow] : []),
      // A successful verification mints a session; `insert(...).returning()`
      // needs a row back or the sign-in cannot complete, and the lockout test
      // below depends on a genuine 200 as its control.
      admin_sessions: [
        { id: 'otp-sess', adminId: 'admin-1', revokedAt: null, expiresAt: FUTURE() },
      ],
    };
    h = await bootSecurityApp(mergeRoutes(routes), [{ token: SMS_PROVIDER, value: capturingSms }]);
  }, 60_000);

  beforeEach(() => {
    sent.splice(0);
    otpRow = null;
    h.db.reset();
  });

  afterAll(async () => {
    await h?.close();
  });

  // ------------------------------------------------------- no disclosure ---

  it('sends a real code by SMS but returns none of it (control + assertion)', async () => {
    const res = await requestOtp(ALLOWLISTED_MOBILE);
    expect(res.status).toBe(200);

    // The control: a code really was generated, so "no code in the body" is not
    // vacuously true because nothing happened.
    expect(sent).toHaveLength(1);
    expect(sent[0].otp).toMatch(/^\d{6}$/);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(sent[0].otp);
    // Nor any other six-digit run that could be a code.
    expect(body).not.toMatch(/\b\d{6}\b/);
  }, 20_000);

  it('leaks no code on the failure paths either', async () => {
    await requestOtp(ALLOWLISTED_MOBILE);
    const code = sent[0].otp;
    otpRow = {
      id: 'otp-1',
      mobile: ALLOWLISTED_MOBILE,
      otpHash: await argon2.hash(code, { type: argon2.argon2id }),
      expiresAt: FUTURE(),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    };

    const wrong = await verifyOtp(ALLOWLISTED_MOBILE, '000000');
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(wrong.body)).not.toContain(code);

    const expired = await verifyOtp(UNREGISTERED_MOBILE, '000000');
    expect(JSON.stringify(expired.body)).not.toContain(code);
  }, 30_000);

  // ------------------------------------------------- no account oracle ---

  /**
   * The enumeration test. If these two responses differ in any way a client can
   * see, the endpoint tells the world which mobile number belongs to the
   * super-admin — which is the first half of an attack on the only account that
   * can sign in.
   */
  it('answers a registered and an unregistered number identically', async () => {
    const registered = await requestOtp(ALLOWLISTED_MOBILE);
    const nothingSentYet = sent.length;
    const unregistered = await requestOtp(UNREGISTERED_MOBILE);

    // Only the allowlisted number actually caused an SMS…
    expect(nothingSentYet).toBe(1);
    expect(sent).toHaveLength(1);

    // …and yet the two answers are indistinguishable.
    expect(unregistered.status).toBe(registered.status);
    expect(Object.keys(unregistered.body.data).sort()).toEqual(
      Object.keys(registered.body.data).sort(),
    );
    expect(unregistered.body.data.message).toBe(registered.body.data.message);
    expect(unregistered.body.success).toBe(registered.body.success);

    // `expiresAt` is a clock reading, so it cannot be byte-equal; what matters
    // is that it is the SAME generic TTL and not a tell.
    const delta = Math.abs(
      new Date(unregistered.body.data.expiresAt).getTime() -
        new Date(registered.body.data.expiresAt).getTime(),
    );
    expect(delta).toBeLessThan(2000);
  }, 30_000);

  it('gives the same generic refusal for a wrong code and an unknown number', async () => {
    const unknown = await verifyOtp(UNREGISTERED_MOBILE, '123456');
    otpRow = {
      id: 'otp-1',
      mobile: ALLOWLISTED_MOBILE,
      otpHash: await argon2.hash('654321', { type: argon2.argon2id }),
      expiresAt: FUTURE(),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    };
    const wrongCode = await verifyOtp(ALLOWLISTED_MOBILE, '123456');

    expect(unknown.status).toBe(wrongCode.status);
    expect(unknown.body.error.code).toBe(wrongCode.body.error.code);
    expect(unknown.body.error.message).toBe(wrongCode.body.error.message);
  }, 30_000);

  // ------------------------------------------------------------ lockout ---

  /**
   * `OTP_MAX_ATTEMPTS` is 3 for this suite. Once the counter reaches it the
   * stored code is dead: the CORRECT code is refused too, so an attacker cannot
   * simply keep guessing until they arrive at it.
   */
  it('refuses even the correct code once the attempt limit is reached', async () => {
    const code = '654321';
    const hash = await argon2.hash(code, { type: argon2.argon2id });

    otpRow = {
      id: 'otp-1',
      mobile: ALLOWLISTED_MOBILE,
      otpHash: hash,
      expiresAt: FUTURE(),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    };

    // The correct code works while attempts remain (control).
    const good = await verifyOtp(ALLOWLISTED_MOBILE, code);
    expect(good.status).toBe(200);

    // Now the same row, but with the attempt budget spent.
    otpRow = { ...otpRow, attempts: 3, consumedAt: null };
    const locked = await verifyOtp(ALLOWLISTED_MOBILE, code);
    expect(locked.status).toBeGreaterThanOrEqual(400);
    expect(locked.body.success).toBe(false);
  }, 40_000);

  it('counts a wrong guess against the budget', async () => {
    otpRow = {
      id: 'otp-1',
      mobile: ALLOWLISTED_MOBILE,
      otpHash: await argon2.hash('654321', { type: argon2.argon2id }),
      expiresAt: FUTURE(),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    };
    h.db.reset();
    await verifyOtp(ALLOWLISTED_MOBILE, '111111');

    const bump = h.db.log.find((q) => q.table === 'admin_otps' && q.kind === 'update');
    expect(bump).toBeDefined();
    expect(bump!.values).toMatchObject({ attempts: 1 });
  }, 30_000);

  it('refuses an expired code', async () => {
    otpRow = {
      id: 'otp-1',
      mobile: ALLOWLISTED_MOBILE,
      otpHash: await argon2.hash('654321', { type: argon2.argon2id }),
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    };
    const res = await verifyOtp(ALLOWLISTED_MOBILE, '654321');
    expect(res.status).toBeGreaterThanOrEqual(400);
  }, 20_000);
});
