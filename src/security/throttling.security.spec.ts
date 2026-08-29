import { installTestEnv } from './security-harness';

/** A limit low enough to reach deliberately, and a window long enough to hold. */
const LIMIT = 5;
installTestEnv({ THROTTLE_LIMIT: String(LIMIT), THROTTLE_TTL: '60' });

import request from 'supertest';
import type { Harness } from './security-harness';
import { adminPermissionRoutes, authenticatedRoutes, mergeRoutes } from './fixtures';
import { adminToken } from './tokens';

/**
 * §64.10 — A BURST IS ACTUALLY REJECTED.
 *
 * `ThrottlerModule` being in `app.module.ts` is not evidence that anything is
 * throttled: the guard has to be registered globally AND survive every other
 * guard in front of it. So this suite does not inspect configuration — it fires
 * a burst at an unauthenticated auth endpoint and requires the server to start
 * saying 429.
 *
 * The requests are issued SEQUENTIALLY. The throttler counts as it goes, so a
 * parallel burst can race past the limit and make the test flaky for reasons
 * that have nothing to do with the control being tested.
 */
describe('§64.10 request throttling', () => {
  let h: Harness;
  const srv = () => h.app.getHttpServer();

  /** A distinct client IP per test: the throttler keys on it. */
  let ipCounter = 0;
  const freshIp = () => `203.0.113.${++ipCounter}`;

  beforeAll(async () => {
    const { bootSecurityApp } = await import('./security-harness');
    h = await bootSecurityApp(
      mergeRoutes(authenticatedRoutes(), adminPermissionRoutes({ 'admin-1': ['*'] })),
    );
    h.app.getHttpAdapter().getInstance().set('trust proxy', true);
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  /** Fires `n` sequential requests from one IP and returns the status codes. */
  async function burst(n: number, send: (ip: string) => request.Test): Promise<number[]> {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < n; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await send(ip);
      statuses.push(res.status);
    }
    return statuses;
  }

  it('the configured limit is the low one this suite set (control)', () => {
    expect(process.env.THROTTLE_LIMIT).toBe(String(LIMIT));
  });

  it('a burst against the OTP request endpoint is rejected with 429', async () => {
    const statuses = await burst(LIMIT + 4, (ip) =>
      request(srv())
        .post('/api/v1/admin/auth/otp/request')
        .set('x-forwarded-for', ip)
        .send({ mobile: '9895077492' }),
    );

    // The early calls got through…
    expect(statuses[0]).not.toBe(429);
    // …and the burst was stopped.
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it('a burst against the refresh endpoint is rejected too', async () => {
    const statuses = await burst(LIMIT + 4, (ip) =>
      request(srv())
        .post('/api/v1/admin/auth/refresh')
        .set('x-forwarded-for', ip)
        .send({ refreshToken: 'not-a-real-token' }),
    );
    expect(statuses).toContain(429);
  }, 30_000);

  /**
   * Guessing an OTP is the single most valuable thing to brute-force here —
   * six digits is 10^6, which is minutes of unthrottled traffic.
   */
  it('a burst of OTP verification attempts is rejected', async () => {
    const statuses = await burst(LIMIT + 4, (ip) =>
      request(srv())
        .post('/api/v1/admin/auth/otp/verify')
        .set('x-forwarded-for', ip)
        .send({ mobile: '9895077492', otp: '000000' }),
    );
    expect(statuses).toContain(429);
  }, 30_000);

  /**
   * The limit is per client, not global: one attacker hitting the wall must not
   * take the API down for everyone else.
   */
  it('a different client is unaffected by another client’s burst', async () => {
    const blocked = await burst(LIMIT + 4, (ip) =>
      request(srv())
        .post('/api/v1/admin/auth/otp/request')
        .set('x-forwarded-for', ip)
        .send({ mobile: '9895077492' }),
    );
    expect(blocked).toContain(429);

    const other = await request(srv())
      .post('/api/v1/admin/auth/otp/request')
      .set('x-forwarded-for', freshIp())
      .send({ mobile: '9895077492' });
    expect(other.status).not.toBe(429);
  }, 30_000);

  it('an authenticated route is throttled as well', async () => {
    const statuses = await burst(LIMIT + 4, (ip) =>
      request(srv())
        .get('/api/v1/admin/owners')
        .set('x-forwarded-for', ip)
        .set('authorization', `Bearer ${adminToken()}`),
    );
    expect(statuses).toContain(429);
  }, 30_000);
});
