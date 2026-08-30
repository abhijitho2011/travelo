import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { DRIZZLE, Database } from '../../database/database.module';
import { ownerMfaRecoveryCodes, owners } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { OwnerErrors } from './owner-errors';
import {
  MfaKeyUnavailableError,
  decryptMfaSecret,
  encryptMfaSecret,
  resolveMfaKey,
} from '../auth/mfa-crypto';
import {
  generateRecoveryCode,
  normalizeRecoveryCode,
  verifyTotp,
} from '../auth/admin-mfa.service';

export const OWNER_MFA_CHALLENGE_ISSUER = 'tavelo-owner-mfa';
export const OWNER_MFA_CHALLENGE_AUDIENCE = 'tavelo-owner-mfa';
export const OWNER_MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
const RECOVERY_CODE_COUNT = 10;

export interface OwnerMfaEnrolment {
  otpauthUrl: string;
  qrDataUri: string;
  recoveryCodes: string[];
  secret: string;
}

export interface OwnerMfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  expiresInSeconds: number;
}

interface OwnerMfaChallengePayload {
  sub: string;
  method: 'google' | 'otp';
  typ: 'mfa_challenge';
}

/**
 * TOTP two-factor for owner accounts. A deliberate port of AdminMfaService:
 * opt-in per owner, and an owner who enrols stops receiving a session from the
 * first factor — OTP and Google sign-in return a short-lived challenge token
 * that authorises nothing, and only `consumeChallenge` clears the way for a
 * session to be minted.
 */
@Injectable()
export class OwnerMfaService {
  private readonly logger = new Logger(OwnerMfaService.name);

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
      throw OwnerErrors.mfaNotConfigured();
    }
    if (!key) throw OwnerErrors.mfaNotConfigured();
    return key;
  }

  isConfigured(): boolean {
    try {
      return resolveMfaKey(this.config.get<string>('MFA_SECRET_KEY')) !== null;
    } catch {
      return false;
    }
  }

  async enroll(ownerId: string): Promise<OwnerMfaEnrolment> {
    const key = this.requireKey();
    const owner = await this.loadOwner(ownerId);
    if (owner.mfaEnabled) throw OwnerErrors.mfaAlreadyEnabled();

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(owner.email, 'Tavelo Owner', secret);
    const qrDataUri = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
    const hashes = await Promise.all(
      recoveryCodes.map((c) => argon2.hash(normalizeRecoveryCode(c), { type: argon2.argon2id })),
    );

    await this.db
      .update(owners)
      .set({ mfaSecret: encryptMfaSecret(secret, key), updatedAt: new Date() })
      .where(eq(owners.id, ownerId));

    await this.db.delete(ownerMfaRecoveryCodes).where(eq(ownerMfaRecoveryCodes.ownerId, ownerId));
    await this.db
      .insert(ownerMfaRecoveryCodes)
      .values(hashes.map((codeHash) => ({ ownerId, codeHash })));

    await this.audit.record({
      action: 'owner.mfa.enroll_started',
      entity: 'owner',
      entityId: ownerId,
      actorId: ownerId,
      actorRole: 'OWNER',
      after: { recoveryCodes: RECOVERY_CODE_COUNT },
    });

    return { otpauthUrl, qrDataUri, recoveryCodes, secret };
  }

  async verifyEnrolment(ownerId: string, code: string): Promise<{ mfaEnabled: true }> {
    const key = this.requireKey();
    const owner = await this.loadOwner(ownerId);
    if (owner.mfaEnabled) throw OwnerErrors.mfaAlreadyEnabled();
    if (!owner.mfaSecret) throw OwnerErrors.mfaNotEnrolled();

    const secret = decryptMfaSecret(owner.mfaSecret, key);
    if (!secret) throw OwnerErrors.mfaNotEnrolled();
    if (!verifyTotp(secret, code)) throw OwnerErrors.mfaInvalidCode();

    await this.db
      .update(owners)
      .set({ mfaEnabled: true, updatedAt: new Date() })
      .where(eq(owners.id, ownerId));

    await this.audit.record({
      action: 'owner.mfa.enabled',
      entity: 'owner',
      entityId: ownerId,
      actorId: ownerId,
      actorRole: 'OWNER',
    });
    return { mfaEnabled: true };
  }

  async disable(ownerId: string, code: string): Promise<{ mfaEnabled: false }> {
    const owner = await this.loadOwner(ownerId);
    if (!owner.mfaEnabled) throw OwnerErrors.mfaNotEnabled();

    const how = await this.consumeCode(ownerId, owner.mfaSecret, code);
    if (!how) throw OwnerErrors.mfaInvalidCode();

    await this.db
      .update(owners)
      .set({ mfaEnabled: false, mfaSecret: null, updatedAt: new Date() })
      .where(eq(owners.id, ownerId));
    await this.db.delete(ownerMfaRecoveryCodes).where(eq(ownerMfaRecoveryCodes.ownerId, ownerId));

    await this.audit.record({
      action: 'owner.mfa.disabled',
      entity: 'owner',
      entityId: ownerId,
      actorId: ownerId,
      actorRole: 'OWNER',
      after: { verifiedWith: how },
    });
    return { mfaEnabled: false };
  }

  async status(ownerId: string): Promise<{
    enabled: boolean;
    available: boolean;
    unusedRecoveryCodes: number;
  }> {
    const owner = await this.loadOwner(ownerId);
    const rows = owner.mfaEnabled
      ? await this.db
          .select({ id: ownerMfaRecoveryCodes.id })
          .from(ownerMfaRecoveryCodes)
          .where(
            and(eq(ownerMfaRecoveryCodes.ownerId, ownerId), isNull(ownerMfaRecoveryCodes.usedAt)),
          )
      : [];
    return {
      enabled: owner.mfaEnabled,
      available: this.isConfigured(),
      unusedRecoveryCodes: rows.length,
    };
  }

  async issueChallenge(ownerId: string, method: 'google' | 'otp'): Promise<OwnerMfaChallenge> {
    const mfaToken = await this.jwt.signAsync(
      { sub: ownerId, method, typ: 'mfa_challenge' } satisfies OwnerMfaChallengePayload,
      {
        secret: this.config.getOrThrow<string>('OWNER_JWT_ACCESS_SECRET'),
        issuer: OWNER_MFA_CHALLENGE_ISSUER,
        audience: OWNER_MFA_CHALLENGE_AUDIENCE,
        expiresIn: `${OWNER_MFA_CHALLENGE_TTL_SECONDS}s`,
      },
    );
    return { mfaRequired: true, mfaToken, expiresInSeconds: OWNER_MFA_CHALLENGE_TTL_SECONDS };
  }

  async consumeChallenge(
    mfaToken: string,
    code: string,
  ): Promise<{ ownerId: string; method: 'google' | 'otp'; verifiedWith: 'totp' | 'recovery' }> {
    let payload: OwnerMfaChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<OwnerMfaChallengePayload>(mfaToken, {
        secret: this.config.getOrThrow<string>('OWNER_JWT_ACCESS_SECRET'),
        issuer: OWNER_MFA_CHALLENGE_ISSUER,
        audience: OWNER_MFA_CHALLENGE_AUDIENCE,
      });
    } catch {
      throw OwnerErrors.mfaChallengeInvalid();
    }
    if (payload.typ !== 'mfa_challenge' || !payload.sub) {
      throw OwnerErrors.mfaChallengeInvalid();
    }

    this.assertNotLocked(payload.sub);

    const owner = await this.loadOwner(payload.sub);
    if (!owner.mfaEnabled) throw OwnerErrors.mfaNotEnabled();

    const verifiedWith = await this.consumeCode(owner.id, owner.mfaSecret, code);
    if (!verifiedWith) {
      this.recordFailure(owner.id);
      await this.audit.record({
        action: 'owner.mfa.challenge_failed',
        entity: 'owner',
        entityId: owner.id,
        actorId: owner.id,
        actorRole: 'OWNER',
        after: { method: payload.method },
      });
      throw OwnerErrors.mfaInvalidCode();
    }

    this.attempts.delete(owner.id);
    await this.audit.record({
      action: 'owner.mfa.challenge_passed',
      entity: 'owner',
      entityId: owner.id,
      actorId: owner.id,
      actorRole: 'OWNER',
      after: { method: payload.method, verifiedWith },
    });
    return { ownerId: owner.id, method: payload.method, verifiedWith };
  }

  private async consumeCode(
    ownerId: string,
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
      .from(ownerMfaRecoveryCodes)
      .where(and(eq(ownerMfaRecoveryCodes.ownerId, ownerId), isNull(ownerMfaRecoveryCodes.usedAt)));
    for (const row of rows) {
      let matches = false;
      try {
        matches = await argon2.verify(row.codeHash, normalisedRecovery);
      } catch {
        matches = false;
      }
      if (!matches) continue;
      const burned = await this.db
        .update(ownerMfaRecoveryCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(ownerMfaRecoveryCodes.id, row.id), isNull(ownerMfaRecoveryCodes.usedAt)))
        .returning({ id: ownerMfaRecoveryCodes.id });
      if (burned.length === 0) continue;
      return 'recovery';
    }
    return null;
  }

  private assertNotLocked(ownerId: string): void {
    const entry = this.attempts.get(ownerId);
    if (!entry) return;
    const remaining = entry.lockedUntil - Date.now();
    if (remaining > 0) throw OwnerErrors.mfaLocked(remaining / 1000);
    if (entry.lockedUntil !== 0) this.attempts.delete(ownerId);
  }

  private recordFailure(ownerId: string): void {
    const max = Number(this.config.get<number>('MFA_MAX_ATTEMPTS') ?? 5);
    const lockSeconds = Number(this.config.get<number>('MFA_LOCK_SECONDS') ?? 900);
    const entry = this.attempts.get(ownerId) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= max) {
      entry.lockedUntil = Date.now() + lockSeconds * 1000;
      entry.count = 0;
    }
    this.attempts.set(ownerId, entry);
  }

  private async loadOwner(ownerId: string) {
    const [owner] = await this.db
      .select()
      .from(owners)
      .where(and(eq(owners.id, ownerId), isNull(owners.deletedAt)))
      .limit(1);
    if (!owner) throw OwnerErrors.ownerNotFound();
    return owner;
  }
}
