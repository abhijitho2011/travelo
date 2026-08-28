import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { adminOtps, admins } from '../../database/schema';
import { REDIS, RedisClient } from '../../queue/redis.provider';
import { normalizeMobile } from '../shared-auth/mobile.util';
import { AdminAuthErrors } from './admin-auth-errors';

@Injectable()
export class AdminOtpService {
  private readonly logger = new Logger(AdminOtpService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: RedisClient,
    private readonly config: ConfigService,
  ) {}

  private ttlMinutes(): number {
    return Number(this.config.get<number>('OTP_TTL_MIN') ?? 10);
  }

  private maxAttempts(): number {
    return Number(this.config.get<number>('OTP_MAX_ATTEMPTS') ?? 5);
  }

  /** The single mobile currently allowed to use OTP sign-in, normalised. */
  allowlistedMobile(): string | null {
    return normalizeMobile(this.config.get<string>('SUPER_ADMIN_MOBILE'));
  }

  /**
   * THE allowlist gate for OTP sign-in. Server-side only; a client can never
   * influence it beyond supplying the number it claims to own.
   */
  isAllowlisted(mobile: string | null | undefined): boolean {
    const allowed = this.allowlistedMobile();
    const candidate = normalizeMobile(mobile);
    return allowed !== null && candidate !== null && allowed === candidate;
  }

  /**
   * 1 request / 30s and 5 requests / hour per mobile.
   * Degrades gracefully (allows) when Redis is unavailable.
   */
  async enforceRequestRateLimit(mobile: string): Promise<void> {
    if (!this.redis) return;
    try {
      const burstKey = `admin:otp:req:30s:${mobile}`;
      const set = await this.redis.set(burstKey, '1', 'EX', 30, 'NX');
      if (set === null) throw AdminAuthErrors.otpThrottled();

      const hourKey = `admin:otp:req:hr:${mobile}`;
      const count = await this.redis.incr(hourKey);
      if (count === 1) await this.redis.expire(hourKey, 3600);
      if (count > 5) throw AdminAuthErrors.otpThrottled();
    } catch (err) {
      if (err && (err as { getStatus?: () => number }).getStatus) throw err;
      this.logger.warn(`Admin OTP rate-limit degraded (Redis): ${(err as Error).message}`);
    }
  }

  /**
   * Generate + store an OTP, but only when the mobile is the allowlisted one
   * AND it resolves to an ACTIVE, non-deleted admin. Returns null in every
   * other case — the caller still answers generically.
   */
  async generateForMobile(mobile: string): Promise<{ otp: string; expiresAt: Date } | null> {
    const normalized = normalizeMobile(mobile);
    if (!normalized || !this.isAllowlisted(normalized)) return null;

    const admin = await this.findActiveAdminByMobile(normalized);
    if (!admin) return null;

    const otp = String(randomInt(100000, 1000000));
    const otpHash = await argon2.hash(otp, { type: argon2.argon2id });
    const expiresAt = new Date(Date.now() + this.ttlMinutes() * 60 * 1000);
    await this.db.insert(adminOtps).values({ mobile: normalized, otpHash, expiresAt });
    return { otp, expiresAt };
  }

  /** Generic expiry returned regardless of whether an OTP was really sent. */
  genericExpiry(): Date {
    return new Date(Date.now() + this.ttlMinutes() * 60 * 1000);
  }

  /**
   * Verify an OTP. Throws INVALID_OTP when the mobile is not allowlisted, so
   * the failure is indistinguishable from a wrong code.
   */
  async verify(mobile: string, otp: string): Promise<{ adminId: string }> {
    const normalized = normalizeMobile(mobile);
    if (!normalized || !this.isAllowlisted(normalized)) throw AdminAuthErrors.invalidOtp();

    const [record] = await this.db
      .select()
      .from(adminOtps)
      .where(and(eq(adminOtps.mobile, normalized), isNull(adminOtps.consumedAt)))
      .orderBy(desc(adminOtps.createdAt))
      .limit(1);

    if (!record) throw AdminAuthErrors.invalidOtp();
    if (record.expiresAt.getTime() < Date.now()) throw AdminAuthErrors.otpExpired();
    if (record.attempts >= this.maxAttempts()) throw AdminAuthErrors.invalidOtp();

    const ok = await argon2.verify(record.otpHash, otp).catch(() => false);
    if (!ok) {
      await this.db
        .update(adminOtps)
        .set({ attempts: record.attempts + 1 })
        .where(eq(adminOtps.id, record.id));
      throw AdminAuthErrors.invalidOtp();
    }

    await this.db
      .update(adminOtps)
      .set({ consumedAt: new Date() })
      .where(eq(adminOtps.id, record.id));

    const admin = await this.findAdminByMobile(normalized);
    if (!admin) throw AdminAuthErrors.invalidOtp();
    if (admin.status === 'Blocked') throw AdminAuthErrors.accountBlocked();
    if (admin.status !== 'Active') throw AdminAuthErrors.accountSuspended();
    return { adminId: admin.id };
  }

  private async findAdminByMobile(
    normalized: string,
  ): Promise<{ id: string; status: string } | null> {
    const [row] = await this.db
      .select({ id: admins.id, status: admins.status })
      .from(admins)
      .where(and(eq(admins.mobile, normalized), isNull(admins.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  private async findActiveAdminByMobile(
    normalized: string,
  ): Promise<{ id: string; status: string } | null> {
    const row = await this.findAdminByMobile(normalized);
    return row && row.status === 'Active' ? row : null;
  }
}
