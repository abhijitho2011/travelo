import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { DRIZZLE, Database } from '../../database/database.module';
import { hotelStaff, staffMfaRecoveryCodes } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { StaffErrors } from './staff-errors';
import {
  MfaKeyUnavailableError,
  decryptMfaSecret,
  encryptMfaSecret,
  resolveMfaKey,
} from '../auth/mfa-crypto';
import { generateRecoveryCode, normalizeRecoveryCode, verifyTotp } from '../auth/admin-mfa.service';

export const STAFF_MFA_CHALLENGE_ISSUER = 'tavelo-staff-mfa';
export const STAFF_MFA_CHALLENGE_AUDIENCE = 'tavelo-staff-mfa';
export const STAFF_MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
const RECOVERY_CODE_COUNT = 10;

export interface StaffMfaEnrolment {
  otpauthUrl: string;
  qrDataUri: string;
  recoveryCodes: string[];
  secret: string;
}

export interface StaffMfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  expiresInSeconds: number;
}

interface StaffMfaChallengePayload {
  sub: string;
  method: 'google' | 'otp';
  typ: 'mfa_challenge';
}

/**
 * TOTP two-factor for staff accounts. A deliberate port of AdminMfaService,
 * signed with the staff access secret under its own issuer/audience so a staff
 * challenge token is worthless against any other surface. An enrolled staff
 * member never receives a session from the first factor alone.
 */
@Injectable()
export class StaffMfaService {
  private readonly logger = new Logger(StaffMfaService.name);

  private readonly attempts = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private requireKey(): Buffer {
    let key: Buffer | null;
    try {
      key = resolveMfaKey(this.config.get<string>('MFA_SECRET_KEY'));
    } catch (err) {
      if (err instanceof MfaKeyUnavailableError) this.logger.error(err.message);
      throw StaffErrors.mfaNotConfigured();
    }
    if (!key) throw StaffErrors.mfaNotConfigured();
    return key;
  }

  isConfigured(): boolean {
    try {
      return resolveMfaKey(this.config.get<string>('MFA_SECRET_KEY')) !== null;
    } catch {
      return false;
    }
  }

  async enroll(staffId: string): Promise<StaffMfaEnrolment> {
    const key = this.requireKey();
    const staff = await this.loadStaff(staffId);
    if (staff.mfaEnabled) throw StaffErrors.mfaAlreadyEnabled();

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(staff.email, 'Tavelo Staff', secret);
    const qrDataUri = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
    const hashes = await Promise.all(
      recoveryCodes.map((c) => argon2.hash(normalizeRecoveryCode(c), { type: argon2.argon2id })),
    );

    await this.db
      .update(hotelStaff)
      .set({ mfaSecret: encryptMfaSecret(secret, key), updatedAt: new Date() })
      .where(eq(hotelStaff.id, staffId));

    await this.db.delete(staffMfaRecoveryCodes).where(eq(staffMfaRecoveryCodes.staffId, staffId));
    await this.db
      .insert(staffMfaRecoveryCodes)
      .values(hashes.map((codeHash) => ({ staffId, codeHash })));

    await this.audit.record({
      action: 'staff.mfa.enroll_started',
      entity: 'hotel_staff',
      entityId: staffId,
      actorId: staffId,
      actorRole: 'STAFF',
      after: { recoveryCodes: RECOVERY_CODE_COUNT },
    });

    return { otpauthUrl, qrDataUri, recoveryCodes, secret };
  }

  async verifyEnrolment(staffId: string, code: string): Promise<{ mfaEnabled: true }> {
    const key = this.requireKey();
    const staff = await this.loadStaff(staffId);
    if (staff.mfaEnabled) throw StaffErrors.mfaAlreadyEnabled();
    if (!staff.mfaSecret) throw StaffErrors.mfaNotEnrolled();

    const secret = decryptMfaSecret(staff.mfaSecret, key);
    if (!secret) throw StaffErrors.mfaNotEnrolled();
    if (!verifyTotp(secret, code)) throw StaffErrors.mfaInvalidCode();

    await this.db
      .update(hotelStaff)
      .set({ mfaEnabled: true, updatedAt: new Date() })
      .where(eq(hotelStaff.id, staffId));

    await this.audit.record({
      action: 'staff.mfa.enabled',
      entity: 'hotel_staff',
      entityId: staffId,
      actorId: staffId,
      actorRole: 'STAFF',
    });
    return { mfaEnabled: true };
  }

  async disable(staffId: string, code: string): Promise<{ mfaEnabled: false }> {
    const staff = await this.loadStaff(staffId);
    if (!staff.mfaEnabled) throw StaffErrors.mfaNotEnabled();

    const how = await this.consumeCode(staffId, staff.mfaSecret, code);
    if (!how) throw StaffErrors.mfaInvalidCode();

    await this.db
      .update(hotelStaff)
      .set({ mfaEnabled: false, mfaSecret: null, updatedAt: new Date() })
      .where(eq(hotelStaff.id, staffId));
    await this.db.delete(staffMfaRecoveryCodes).where(eq(staffMfaRecoveryCodes.staffId, staffId));

    await this.audit.record({
      action: 'staff.mfa.disabled',
      entity: 'hotel_staff',
      entityId: staffId,
      actorId: staffId,
      actorRole: 'STAFF',
      after: { verifiedWith: how },
    });
    return { mfaEnabled: false };
  }

  async status(staffId: string): Promise<{
    enabled: boolean;
    available: boolean;
    unusedRecoveryCodes: number;
  }> {
    const staff = await this.loadStaff(staffId);
    const rows = staff.mfaEnabled
      ? await this.db
          .select({ id: staffMfaRecoveryCodes.id })
          .from(staffMfaRecoveryCodes)
          .where(
            and(eq(staffMfaRecoveryCodes.staffId, staffId), isNull(staffMfaRecoveryCodes.usedAt)),
          )
      : [];
    return {
      enabled: staff.mfaEnabled,
      available: this.isConfigured(),
      unusedRecoveryCodes: rows.length,
    };
  }

  async issueChallenge(staffId: string, method: 'google' | 'otp'): Promise<StaffMfaChallenge> {
    const mfaToken = await this.jwt.signAsync(
      { sub: staffId, method, typ: 'mfa_challenge' } satisfies StaffMfaChallengePayload,
      {
        secret: this.config.getOrThrow<string>('STAFF_JWT_ACCESS_SECRET'),
        issuer: STAFF_MFA_CHALLENGE_ISSUER,
        audience: STAFF_MFA_CHALLENGE_AUDIENCE,
        expiresIn: `${STAFF_MFA_CHALLENGE_TTL_SECONDS}s`,
      },
    );
    return { mfaRequired: true, mfaToken, expiresInSeconds: STAFF_MFA_CHALLENGE_TTL_SECONDS };
  }

  async consumeChallenge(
    mfaToken: string,
    code: string,
  ): Promise<{ staffId: string; method: 'google' | 'otp'; verifiedWith: 'totp' | 'recovery' }> {
    let payload: StaffMfaChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<StaffMfaChallengePayload>(mfaToken, {
        secret: this.config.getOrThrow<string>('STAFF_JWT_ACCESS_SECRET'),
        issuer: STAFF_MFA_CHALLENGE_ISSUER,
        audience: STAFF_MFA_CHALLENGE_AUDIENCE,
      });
    } catch {
      throw StaffErrors.mfaChallengeInvalid();
    }
    if (payload.typ !== 'mfa_challenge' || !payload.sub) {
      throw StaffErrors.mfaChallengeInvalid();
    }

    this.assertNotLocked(payload.sub);

    const staff = await this.loadStaff(payload.sub);
    if (!staff.mfaEnabled) throw StaffErrors.mfaNotEnabled();

    const verifiedWith = await this.consumeCode(staff.id, staff.mfaSecret, code);
    if (!verifiedWith) {
      this.recordFailure(staff.id);
      await this.audit.record({
        action: 'staff.mfa.challenge_failed',
        entity: 'hotel_staff',
        entityId: staff.id,
        actorId: staff.id,
        actorRole: 'STAFF',
        after: { method: payload.method },
      });
      throw StaffErrors.mfaInvalidCode();
    }

    this.attempts.delete(staff.id);
    await this.audit.record({
      action: 'staff.mfa.challenge_passed',
      entity: 'hotel_staff',
      entityId: staff.id,
      actorId: staff.id,
      actorRole: 'STAFF',
      after: { method: payload.method, verifiedWith },
    });
    return { staffId: staff.id, method: payload.method, verifiedWith };
  }

  private async consumeCode(
    staffId: string,
    storedSecret: string | null,
    code: string,
  ): Promise<'totp' | 'recovery' | null> {
    const cleaned = code.replace(/[\s-]/g, '');
    if (!cleaned) return null;
    const normalisedRecovery = normalizeRecoveryCode(code);

    if (storedSecret) {
      let key: Buffer | null = null;
      try {
        key = resolveMfaKey(this.config.get<string>('MFA_SECRET_KEY'));
      } catch {
        key = null;
      }
      const secret = key ? decryptMfaSecret(storedSecret, key) : null;
      if (secret && verifyTotp(secret, cleaned)) return 'totp';
    }

    const rows = await this.db
      .select()
      .from(staffMfaRecoveryCodes)
      .where(and(eq(staffMfaRecoveryCodes.staffId, staffId), isNull(staffMfaRecoveryCodes.usedAt)));
    for (const row of rows) {
      let matches = false;
      try {
        matches = await argon2.verify(row.codeHash, normalisedRecovery);
      } catch {
        matches = false;
      }
      if (!matches) continue;
      const burned = await this.db
        .update(staffMfaRecoveryCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(staffMfaRecoveryCodes.id, row.id), isNull(staffMfaRecoveryCodes.usedAt)))
        .returning({ id: staffMfaRecoveryCodes.id });
      if (burned.length === 0) continue;
      return 'recovery';
    }
    return null;
  }

  private assertNotLocked(staffId: string): void {
    const entry = this.attempts.get(staffId);
    if (!entry) return;
    const remaining = entry.lockedUntil - Date.now();
    if (remaining > 0) throw StaffErrors.mfaLocked(remaining / 1000);
    if (entry.lockedUntil !== 0) this.attempts.delete(staffId);
  }

  private recordFailure(staffId: string): void {
    const max = Number(this.config.get<number>('MFA_MAX_ATTEMPTS') ?? 5);
    const lockSeconds = Number(this.config.get<number>('MFA_LOCK_SECONDS') ?? 900);
    const entry = this.attempts.get(staffId) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= max) {
      entry.lockedUntil = Date.now() + lockSeconds * 1000;
      entry.count = 0;
    }
    this.attempts.set(staffId, entry);
  }

  private async loadStaff(staffId: string) {
    const [staff] = await this.db
      .select()
      .from(hotelStaff)
      .where(and(eq(hotelStaff.id, staffId), isNull(hotelStaff.deletedAt)))
      .limit(1);
    if (!staff) throw StaffErrors.staffNotFound();
    return staff;
  }
}
