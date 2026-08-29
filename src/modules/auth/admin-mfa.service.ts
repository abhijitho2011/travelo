import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { DRIZZLE, Database } from '../../database/database.module';
import { adminMfaRecoveryCodes, admins } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { AdminAuthErrors } from './admin-auth-errors';
import {
  MfaKeyUnavailableError,
  decryptMfaSecret,
  encryptMfaSecret,
  resolveMfaKey,
} from './mfa-crypto';

export const MFA_CHALLENGE_ISSUER = 'tavelo-admin-mfa';
export const MFA_CHALLENGE_AUDIENCE = 'tavelo-admin-mfa';
export const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
const RECOVERY_CODE_COUNT = 10;

export interface MfaEnrolment {
  otpauthUrl: string;
  /** `data:image/png;base64,…` — rendered inline, never fetched from a CDN. */
  qrDataUri: string;
  recoveryCodes: string[];
  /** The base32 secret, for the "can't scan the QR?" manual entry path. */
  secret: string;
}

export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  expiresInSeconds: number;
}

interface MfaChallengePayload {
  sub: string;
  method: 'google' | 'otp';
  typ: 'mfa_challenge';
}

/**
 * TOTP two-factor for admin accounts.
 *
 * Opt-in per admin: nothing here becomes mandatory, and an admin who never
 * enrols signs in exactly as before. What it changes for an admin who DOES
 * enrol is that OTP and Google sign-in stop returning a session — they return a
 * short-lived challenge token that is worthless on its own, and only
 * `exchangeChallenge` mints real tokens.
 */
@Injectable()
export class AdminMfaService {
  private readonly logger = new Logger(AdminMfaService.name);

  /**
   * Failed-attempt counters for the challenge step, keyed by admin id. In
   * memory on purpose: this is a brute-force speed bump in front of a 6-digit
   * code, not a distributed lockout, and it must never be the thing that
   * prevents boot. A restart clears it; the 5-minute challenge TTL and the
   * global throttler both still apply.
   */
  private readonly attempts = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ keys --

  /**
   * Throws MFA_NOT_CONFIGURED when no usable key is available, so a
   * misconfigured deployment refuses to enrol rather than storing the shared
   * secret in plaintext.
   */
  private requireKey(): Buffer {
    let key: Buffer | null;
    try {
      key = resolveMfaKey(this.config.get<string>('MFA_SECRET_KEY'));
    } catch (err) {
      if (err instanceof MfaKeyUnavailableError) this.logger.error(err.message);
      throw AdminAuthErrors.mfaNotConfigured();
    }
    if (!key) throw AdminAuthErrors.mfaNotConfigured();
    return key;
  }

  isConfigured(): boolean {
    try {
      return resolveMfaKey(this.config.get<string>('MFA_SECRET_KEY')) !== null;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------- enrolment --

  /**
   * Generates a fresh secret and recovery codes. `mfa_enabled` is NOT flipped
   * here: an admin who scans a QR and then loses the authenticator before
   * proving one code would otherwise lock themselves out of the only portal.
   * Enrolment only counts once `verify` succeeds.
   */
  async enroll(adminId: string): Promise<MfaEnrolment> {
    const key = this.requireKey();
    const admin = await this.loadAdmin(adminId);
    if (admin.mfaEnabled) throw AdminAuthErrors.mfaAlreadyEnabled();

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(admin.email, 'Tavelo Admin', secret);
    const qrDataUri = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
    const hashes = await Promise.all(
      recoveryCodes.map((c) => argon2.hash(c, { type: argon2.argon2id })),
    );

    await this.db
      .update(admins)
      .set({ mfaSecret: encryptMfaSecret(secret, key), updatedAt: new Date() })
      .where(eq(admins.id, adminId));

    // Replace any codes from an abandoned earlier attempt: only the set that
    // matches the secret actually in the column may exist.
    await this.db.delete(adminMfaRecoveryCodes).where(eq(adminMfaRecoveryCodes.adminId, adminId));
    await this.db
      .insert(adminMfaRecoveryCodes)
      .values(hashes.map((codeHash) => ({ adminId, codeHash })));

    await this.audit.record({
      action: 'admin.mfa.enroll_started',
      entity: 'admin',
      entityId: adminId,
      actorId: adminId,
      actorEmail: admin.email,
      after: { recoveryCodes: RECOVERY_CODE_COUNT },
    });

    return { otpauthUrl, qrDataUri, recoveryCodes, secret };
  }

  /** Confirms the authenticator really works, then turns MFA on. */
  async verifyEnrolment(adminId: string, code: string): Promise<{ mfaEnabled: true }> {
    const key = this.requireKey();
    const admin = await this.loadAdmin(adminId);
    if (admin.mfaEnabled) throw AdminAuthErrors.mfaAlreadyEnabled();
    if (!admin.mfaSecret) throw AdminAuthErrors.mfaNotEnrolled();

    const secret = decryptMfaSecret(admin.mfaSecret, key);
    if (!secret) throw AdminAuthErrors.mfaNotEnrolled();
    if (!verifyTotp(secret, code)) throw AdminAuthErrors.mfaInvalidCode();

    await this.db
      .update(admins)
      .set({ mfaEnabled: true, updatedAt: new Date() })
      .where(eq(admins.id, adminId));

    await this.audit.record({
      action: 'admin.mfa.enabled',
      entity: 'admin',
      entityId: adminId,
      actorId: adminId,
      actorEmail: admin.email,
    });
    return { mfaEnabled: true };
  }

  /**
   * Turning MFA off is itself an MFA-protected action — otherwise a stolen
   * session cookie would be enough to strip the second factor.
   */
  async disable(adminId: string, code: string): Promise<{ mfaEnabled: false }> {
    const admin = await this.loadAdmin(adminId);
    if (!admin.mfaEnabled) throw AdminAuthErrors.mfaNotEnabled();

    const how = await this.consumeCode(adminId, admin.mfaSecret, code);
    if (!how) throw AdminAuthErrors.mfaInvalidCode();

    await this.db
      .update(admins)
      .set({ mfaEnabled: false, mfaSecret: null, updatedAt: new Date() })
      .where(eq(admins.id, adminId));
    await this.db.delete(adminMfaRecoveryCodes).where(eq(adminMfaRecoveryCodes.adminId, adminId));

    await this.audit.record({
      action: 'admin.mfa.disabled',
      entity: 'admin',
      entityId: adminId,
      actorId: adminId,
      actorEmail: admin.email,
      after: { verifiedWith: how },
    });
    return { mfaEnabled: false };
  }

  async status(adminId: string): Promise<{
    enabled: boolean;
    available: boolean;
    unusedRecoveryCodes: number;
  }> {
    const admin = await this.loadAdmin(adminId);
    const rows = admin.mfaEnabled
      ? await this.db
          .select({ id: adminMfaRecoveryCodes.id })
          .from(adminMfaRecoveryCodes)
          .where(
            and(
              eq(adminMfaRecoveryCodes.adminId, adminId),
              isNull(adminMfaRecoveryCodes.usedAt),
            ),
          )
      : [];
    return {
      enabled: admin.mfaEnabled,
      available: this.isConfigured(),
      unusedRecoveryCodes: rows.length,
    };
  }

  // -------------------------------------------------------------- challenge --

  /**
   * The challenge token is single-purpose: its own issuer/audience, a 5-minute
   * life, and no session behind it. Presenting it anywhere else fails, and on
   * its own it authorises nothing at all.
   */
  async issueChallenge(adminId: string, method: 'google' | 'otp'): Promise<MfaChallenge> {
    const mfaToken = await this.jwt.signAsync(
      { sub: adminId, method, typ: 'mfa_challenge' } satisfies MfaChallengePayload,
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: MFA_CHALLENGE_ISSUER,
        audience: MFA_CHALLENGE_AUDIENCE,
        expiresIn: `${MFA_CHALLENGE_TTL_SECONDS}s`,
      },
    );
    return { mfaRequired: true, mfaToken, expiresInSeconds: MFA_CHALLENGE_TTL_SECONDS };
  }

  /**
   * Validates the challenge + the second factor. Returns the admin id the
   * caller may now establish a session for — it never mints tokens itself, so
   * there is exactly one place that does.
   */
  async consumeChallenge(
    mfaToken: string,
    code: string,
  ): Promise<{ adminId: string; method: 'google' | 'otp'; verifiedWith: 'totp' | 'recovery' }> {
    let payload: MfaChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<MfaChallengePayload>(mfaToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: MFA_CHALLENGE_ISSUER,
        audience: MFA_CHALLENGE_AUDIENCE,
      });
    } catch {
      throw AdminAuthErrors.mfaChallengeInvalid();
    }
    if (payload.typ !== 'mfa_challenge' || !payload.sub) {
      throw AdminAuthErrors.mfaChallengeInvalid();
    }

    this.assertNotLocked(payload.sub);

    const admin = await this.loadAdmin(payload.sub);
    if (!admin.mfaEnabled) throw AdminAuthErrors.mfaNotEnabled();

    const verifiedWith = await this.consumeCode(admin.id, admin.mfaSecret, code);
    if (!verifiedWith) {
      this.recordFailure(admin.id);
      await this.audit.record({
        action: 'admin.mfa.challenge_failed',
        entity: 'admin',
        entityId: admin.id,
        actorId: admin.id,
        actorEmail: admin.email,
        after: { method: payload.method },
      });
      throw AdminAuthErrors.mfaInvalidCode();
    }

    this.attempts.delete(admin.id);
    await this.audit.record({
      action: 'admin.mfa.challenge_passed',
      entity: 'admin',
      entityId: admin.id,
      actorId: admin.id,
      actorEmail: admin.email,
      after: { method: payload.method, verifiedWith },
    });
    return { adminId: admin.id, method: payload.method, verifiedWith };
  }

  // ------------------------------------------------------------- internals --

  /**
   * Accepts either a live TOTP or an unused recovery code, and BURNS the
   * recovery code as a side effect so it can never be replayed. Returns which
   * factor matched, or null.
   */
  private async consumeCode(
    adminId: string,
    storedSecret: string | null,
    code: string,
  ): Promise<'totp' | 'recovery' | null> {
    const cleaned = code.replace(/[\s-]/g, '');
    if (!cleaned) return null;

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
      .from(adminMfaRecoveryCodes)
      .where(
        and(eq(adminMfaRecoveryCodes.adminId, adminId), isNull(adminMfaRecoveryCodes.usedAt)),
      );
    for (const row of rows) {
      let matches = false;
      try {
        matches = await argon2.verify(row.codeHash, cleaned.toUpperCase());
      } catch {
        matches = false;
      }
      if (!matches) continue;
      // Mark used, guarded on `used_at IS NULL` so two concurrent requests
      // cannot both spend the same code.
      const burned = await this.db
        .update(adminMfaRecoveryCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(adminMfaRecoveryCodes.id, row.id), isNull(adminMfaRecoveryCodes.usedAt)))
        .returning({ id: adminMfaRecoveryCodes.id });
      if (burned.length === 0) continue;
      return 'recovery';
    }
    return null;
  }

  private assertNotLocked(adminId: string): void {
    const entry = this.attempts.get(adminId);
    if (!entry) return;
    const remaining = entry.lockedUntil - Date.now();
    if (remaining > 0) throw AdminAuthErrors.mfaLocked(remaining / 1000);
    if (entry.lockedUntil !== 0) this.attempts.delete(adminId);
  }

  private recordFailure(adminId: string): void {
    const max = Number(this.config.get<number>('MFA_MAX_ATTEMPTS') ?? 5);
    const lockSeconds = Number(this.config.get<number>('MFA_LOCK_SECONDS') ?? 900);
    const entry = this.attempts.get(adminId) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= max) {
      entry.lockedUntil = Date.now() + lockSeconds * 1000;
      entry.count = 0;
    }
    this.attempts.set(adminId, entry);
  }

  private async loadAdmin(adminId: string) {
    const [admin] = await this.db
      .select()
      .from(admins)
      .where(and(eq(admins.id, adminId), isNull(admins.deletedAt)))
      .limit(1);
    if (!admin) throw AdminAuthErrors.adminNotFound();
    return admin;
  }
}

/**
 * One step of tolerance either side: phone clocks drift, and a code the user
 * typed as it rolled over should not read as an attack.
 */
export function verifyTotp(secret: string, code: string): boolean {
  const cleaned = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    authenticator.options = { window: 1 };
    return authenticator.check(cleaned, secret);
  } catch {
    return false;
  }
}

/** Crockford-ish base32, grouped for legibility: `A1B2C-D3E4F`. */
export function generateRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5, 10)}`;
}
