import * as argon2 from 'argon2';
import { OwnerOtpService } from './owner-otp.service';

/**
 * Minimal chainable Drizzle mock. Each call to `select()` returns the next
 * queued result set; `update()` is a chainable no-op that records nothing.
 */
function mkDb(selectResults: unknown[][]) {
  let i = 0;
  const terminal = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    const ret = () => chain;
    chain.from = ret;
    chain.where = ret;
    chain.orderBy = ret;
    chain.limit = async () => rows;
    // allow `where` to be awaited directly too
    return chain;
  };
  return {
    select() {
      const rows = selectResults[i++] ?? [];
      return terminal(rows);
    },
    insert() {
      return { values: async () => undefined };
    },
    update() {
      return { set: () => ({ where: async () => undefined }) };
    },
  };
}

const config = { get: (k: string) => (k === 'OTP_TTL_MIN' ? 10 : 5) } as never;

describe('OwnerOtpService.verify', () => {
  const mobile = '9000000001';

  it('resolves the owner when the OTP hash matches and is unexpired', async () => {
    const otp = '123456';
    const otpHash = await argon2.hash(otp, { type: argon2.argon2id });
    const db = mkDb([
      [{ id: 'otp1', mobile, otpHash, expiresAt: new Date(Date.now() + 60000), attempts: 0 }],
      [{ id: 'own1', email: 'a@b.com', status: 'ACTIVE', deletedAt: null }],
    ]);
    const svc = new OwnerOtpService(db as never, null as never, config);
    await expect(svc.verify(mobile, otp)).resolves.toEqual({
      ownerId: 'own1',
      email: 'a@b.com',
    });
  });

  it('rejects an expired OTP with OTP_EXPIRED', async () => {
    const otpHash = await argon2.hash('123456', { type: argon2.argon2id });
    const db = mkDb([
      [{ id: 'otp1', mobile, otpHash, expiresAt: new Date(Date.now() - 1000), attempts: 0 }],
    ]);
    const svc = new OwnerOtpService(db as never, null as never, config);
    await expect(svc.verify(mobile, '123456')).rejects.toMatchObject({
      response: { error: 'OTP_EXPIRED' },
    });
  });

  it('rejects a wrong OTP with INVALID_OTP', async () => {
    const otpHash = await argon2.hash('123456', { type: argon2.argon2id });
    const db = mkDb([
      [{ id: 'otp1', mobile, otpHash, expiresAt: new Date(Date.now() + 60000), attempts: 0 }],
    ]);
    const svc = new OwnerOtpService(db as never, null as never, config);
    await expect(svc.verify(mobile, '000000')).rejects.toMatchObject({
      response: { error: 'INVALID_OTP' },
    });
  });

  it('rejects when no OTP record exists', async () => {
    const db = mkDb([[]]);
    const svc = new OwnerOtpService(db as never, null as never, config);
    await expect(svc.verify(mobile, '123456')).rejects.toMatchObject({
      response: { error: 'INVALID_OTP' },
    });
  });

  it('rejects when max attempts already exhausted', async () => {
    const otpHash = await argon2.hash('123456', { type: argon2.argon2id });
    const db = mkDb([
      [{ id: 'otp1', mobile, otpHash, expiresAt: new Date(Date.now() + 60000), attempts: 5 }],
    ]);
    const svc = new OwnerOtpService(db as never, null as never, config);
    await expect(svc.verify(mobile, '123456')).rejects.toMatchObject({
      response: { error: 'INVALID_OTP' },
    });
  });
});
