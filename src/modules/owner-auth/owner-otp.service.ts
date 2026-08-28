import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { ownerOtps, owners } from '../../database/schema';
import { REDIS, RedisClient } from '../../queue/redis.provider';
import { OwnerErrors } from './owner-errors';

export interface OtpResolveResult {
  ownerId: string;
  email: string;
}

@Injectable()
export class OwnerOtpService {
  private readonly logger = new Logger(OwnerOtpService.name);

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

  /**
   * Enforce rate limits: 1 request / 30s and 5 requests / hour per mobile.
   * Degrades gracefully (allows) when Redis is unavailable.
   */
  async enforceRequestRateLimit(mobile: string): Promise<void> {
    if (!this.redis) return;
    try {
      const burstKey = `owner:otp:req:30s:${mobile}`;
      const set = await this.redis.set(burstKey, '1', 'EX', 30, 'NX');
      if (set === null) throw OwnerErrors.otpThrottled();

      const hourKey = `owner:otp:req:hr:${mobile}`;
      const count = await this.redis.incr(hourKey);
      if (count === 1) await this.redis.expire(hourKey, 3600);
      if (count > 5) throw OwnerErrors.otpThrottled();
    } catch (err) {
      if (err && (err as { getStatus?: () => number }).getStatus) throw err;
      this.logger.warn(`OTP rate-limit degraded (Redis): ${(err as Error).message}`);
    }
  }

  /**
   * Generate + store an OTP for an ACTIVE owner with this mobile, returning
   * the plaintext OTP so the caller can dispatch it via SMS. Returns null
   * when there is no eligible owner (caller still responds generically).
   */
  async generateForMobile(mobile: string): Promise<{ otp: string; expiresAt: Date } | null> {
    const [owner] = await this.db
      .select({ id: owners.id, status: owners.status, deletedAt: owners.deletedAt })
      .from(owners)
      .where(eq(owners.mobile, mobile))
      .limit(1);
    const expiresAt = new Date(Date.now() + this.ttlMinutes() * 60 * 1000);
    if (!owner || owner.deletedAt || owner.status !== 'ACTIVE') {
      return null; // do not disclose; caller returns generic success
    }
    const otp = String(randomInt(100000, 1000000));
    const otpHash = await argon2.hash(otp, { type: argon2.argon2id });
    await this.db.insert(ownerOtps).values({ mobile, otpHash, expiresAt });
    return { otp, expiresAt };
  }

  /** Compute the generic expiry to return regardless of owner existence. */
  genericExpiry(): Date {
    return new Date(Date.now() + this.ttlMinutes() * 60 * 1000);
  }

  /**
   * Verify an OTP for a mobile. Throws INVALID_OTP / OTP_EXPIRED on failure.
   * On success returns the resolved ACTIVE owner (throwing account-status
   * errors for SUSPENDED/BLOCKED owners).
   */
  async verify(mobile: string, otp: string): Promise<OtpResolveResult> {
    const [record] = await this.db
      .select()
      .from(ownerOtps)
      .where(and(eq(ownerOtps.mobile, mobile), isNull(ownerOtps.consumedAt)))
      .orderBy(desc(ownerOtps.createdAt))
      .limit(1);

    if (!record) throw OwnerErrors.invalidOtp();
    if (record.expiresAt.getTime() < Date.now()) throw OwnerErrors.otpExpired();
    if (record.attempts >= this.maxAttempts()) throw OwnerErrors.invalidOtp();

    const ok = await argon2.verify(record.otpHash, otp).catch(() => false);
    if (!ok) {
      await this.db
        .update(ownerOtps)
        .set({ attempts: record.attempts + 1 })
        .where(eq(ownerOtps.id, record.id));
      throw OwnerErrors.invalidOtp();
    }

    await this.db
      .update(ownerOtps)
      .set({ consumedAt: new Date() })
      .where(eq(ownerOtps.id, record.id));

    const [owner] = await this.db.select().from(owners).where(eq(owners.mobile, mobile)).limit(1);
    if (!owner || owner.deletedAt) throw OwnerErrors.invalidOtp();
    if (owner.status === 'SUSPENDED') throw OwnerErrors.accountSuspended();
    if (owner.status === 'BLOCKED') throw OwnerErrors.accountBlocked();
    if (owner.status !== 'ACTIVE') throw OwnerErrors.invalidOtp();

    return { ownerId: owner.id, email: owner.email };
  }
}
