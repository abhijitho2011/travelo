import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { hotelStaff, staffOtps, type HotelStaff } from '../../database/schema';
import { REDIS, RedisClient } from '../../queue/redis.provider';
import { StaffErrors } from './staff-errors';

@Injectable()
export class StaffOtpService {
  private readonly logger = new Logger(StaffOtpService.name);

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
   * 1 request / 30s and 5 / hour per mobile. Degrades to "allow" when Redis is
   * unavailable — a broken cache must not lock the whole workforce out.
   */
  async enforceRequestRateLimit(mobile: string): Promise<void> {
    if (!this.redis) return;
    try {
      const burstKey = `staff:otp:req:30s:${mobile}`;
      const set = await this.redis.set(burstKey, '1', 'EX', 30, 'NX');
      if (set === null) throw StaffErrors.otpThrottled();

      const hourKey = `staff:otp:req:hr:${mobile}`;
      const count = await this.redis.incr(hourKey);
      if (count === 1) await this.redis.expire(hourKey, 3600);
      if (count > 5) throw StaffErrors.otpThrottled();
    } catch (err) {
      if (err && (err as { getStatus?: () => number }).getStatus) throw err;
      this.logger.warn(`Staff OTP rate-limit degraded (Redis): ${(err as Error).message}`);
    }
  }

  /**
   * Resolve the staff row a mobile belongs to. A mobile is not unique across
   * properties, so an ACTIVE row always wins; otherwise the oldest live row is
   * returned so the caller can raise the right account-status error.
   */
  async findByMobile(mobile: string): Promise<HotelStaff | null> {
    const rows = await this.db
      .select()
      .from(hotelStaff)
      .where(and(eq(hotelStaff.mobile, mobile), isNull(hotelStaff.deletedAt)))
      .orderBy(
        sql`CASE WHEN ${hotelStaff.status} = 'ACTIVE' THEN 0 ELSE 1 END`,
        asc(hotelStaff.createdAt),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Mint an OTP when the mobile belongs to a NON-DELETED staff row, whatever
   * its status: a PENDING_APPROVAL member must be able to sign in far enough to
   * be told they are pending. Returns null otherwise — the caller still answers
   * with the same generic envelope, so nothing is disclosed.
   */
  async generateForMobile(mobile: string): Promise<{ otp: string; expiresAt: Date } | null> {
    const staff = await this.findByMobile(mobile);
    if (!staff) return null;
    const expiresAt = new Date(Date.now() + this.ttlMinutes() * 60 * 1000);
    const otp = String(randomInt(100000, 1000000));
    const otpHash = await argon2.hash(otp, { type: argon2.argon2id });
    await this.db.insert(staffOtps).values({ mobile, otpHash, expiresAt });
    return { otp, expiresAt };
  }

  /** The expiry returned regardless of whether a staff row exists. */
  genericExpiry(): Date {
    return new Date(Date.now() + this.ttlMinutes() * 60 * 1000);
  }

  /**
   * Verify a code and return the staff row it belongs to. Throws the GENERIC
   * INVALID_OTP for a wrong/expired/unknown-number code; account-status errors
   * are the caller's job, once possession of the number has been proved.
   */
  async verify(mobile: string, otp: string): Promise<HotelStaff> {
    const [record] = await this.db
      .select()
      .from(staffOtps)
      .where(and(eq(staffOtps.mobile, mobile), isNull(staffOtps.consumedAt)))
      .orderBy(desc(staffOtps.createdAt))
      .limit(1);

    if (!record) throw StaffErrors.invalidOtp();
    if (record.expiresAt.getTime() < Date.now()) throw StaffErrors.otpExpired();
    if (record.attempts >= this.maxAttempts()) throw StaffErrors.invalidOtp();

    const ok = await argon2.verify(record.otpHash, otp).catch(() => false);
    if (!ok) {
      await this.db
        .update(staffOtps)
        .set({ attempts: record.attempts + 1 })
        .where(eq(staffOtps.id, record.id));
      throw StaffErrors.invalidOtp();
    }

    await this.db
      .update(staffOtps)
      .set({ consumedAt: new Date() })
      .where(eq(staffOtps.id, record.id));

    const staff = await this.findByMobile(mobile);
    // Deleted between request and verify — stay generic.
    if (!staff) throw StaffErrors.invalidOtp();
    return staff;
  }
}
