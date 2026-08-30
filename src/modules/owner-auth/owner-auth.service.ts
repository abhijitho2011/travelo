import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { owners, subscriptions, subscriptionPlans } from '../../database/schema';
import { OwnerOtpService } from './owner-otp.service';
import { OwnerTokenService, OwnerTokenPair } from './owner-token.service';
import { FirebaseService } from '../shared-auth/firebase.service';
import { SMS_PROVIDER, SmsProvider } from '../shared-auth/sms/sms-provider.interface';
import { OwnerErrors } from './owner-errors';
import { OwnerImpersonationContext } from './current-owner.decorator';
import { OwnerMfaService, OwnerMfaChallenge } from './owner-mfa.service';

/** Either a real session (first factor was enough) or an MFA challenge. */
export type OwnerSignInResult = OwnerTokenPair | OwnerMfaChallenge;

export function isOwnerMfaChallenge(r: OwnerSignInResult): r is OwnerMfaChallenge {
  return (r as OwnerMfaChallenge).mfaRequired === true;
}

@Injectable()
export class OwnerAuthService {
  private readonly logger = new Logger(OwnerAuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly otp: OwnerOtpService,
    private readonly tokens: OwnerTokenService,
    private readonly firebase: FirebaseService,
    private readonly mfa: OwnerMfaService,
  ) {}

  async requestOtp(mobile: string): Promise<{ message: string; expiresAt: string }> {
    await this.otp.enforceRequestRateLimit(mobile);
    const generated = await this.otp.generateForMobile(mobile);
    const expiresAt = generated?.expiresAt ?? this.otp.genericExpiry();
    if (generated) {
      try {
        await this.sms.sendOtp(mobile, generated.otp);
      } catch (err) {
        // Never leak SMS failure to the client; response stays generic.
        this.logger.error(`Failed to dispatch OTP SMS: ${(err as Error).message}`);
      }
    }
    return {
      message: 'If an account exists for this number, an OTP has been sent.',
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifyOtp(mobile: string, otp: string): Promise<OwnerSignInResult> {
    const resolved = await this.otp.verify(mobile, otp);
    return this.gateOrIssue(resolved.ownerId, resolved.email, 'otp');
  }

  async google(idToken: string): Promise<OwnerSignInResult> {
    const verified = await this.firebase.verifyIdToken(idToken);
    if (!verified.email) throw OwnerErrors.ownerNotFound();
    const [owner] = await this.db
      .select()
      .from(owners)
      .where(and(eq(owners.email, verified.email.toLowerCase()), isNull(owners.deletedAt)))
      .limit(1);
    if (!owner) throw OwnerErrors.ownerNotFound();
    if (owner.status === 'SUSPENDED') throw OwnerErrors.accountSuspended();
    if (owner.status === 'BLOCKED') throw OwnerErrors.accountBlocked();
    if (owner.status !== 'ACTIVE') throw OwnerErrors.ownerNotFound();

    if (verified.emailVerified && !owner.emailVerified) {
      await this.db
        .update(owners)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(owners.id, owner.id));
    }
    return this.gateOrIssue(owner.id, owner.email, 'google', owner.mfaEnabled);
  }

  /**
   * THE GATE. An owner who has enrolled in MFA never receives tokens from the
   * first factor alone — only `completeLoginAfterMfa`, reached through POST
   * /owner/auth/mfa, can mint a session for them.
   */
  private async gateOrIssue(
    ownerId: string,
    email: string,
    method: 'google' | 'otp',
    mfaEnabled?: boolean,
  ): Promise<OwnerSignInResult> {
    let enrolled = mfaEnabled;
    if (enrolled === undefined) {
      const [row] = await this.db
        .select({ mfaEnabled: owners.mfaEnabled })
        .from(owners)
        .where(eq(owners.id, ownerId))
        .limit(1);
      enrolled = row?.mfaEnabled ?? false;
    }
    if (enrolled) return this.mfa.issueChallenge(ownerId, method);
    return this.tokens.issueForOwner(ownerId, email);
  }

  /**
   * The other side of the gate: called ONLY after OwnerMfaService has verified
   * a TOTP or a recovery code against a live challenge token.
   */
  async completeLoginAfterMfa(ownerId: string): Promise<OwnerTokenPair> {
    const [owner] = await this.db
      .select({ id: owners.id, email: owners.email })
      .from(owners)
      .where(and(eq(owners.id, ownerId), isNull(owners.deletedAt)))
      .limit(1);
    if (!owner) throw OwnerErrors.ownerNotFound();
    return this.tokens.issueForOwner(owner.id, owner.email);
  }

  async refresh(refreshToken: string): Promise<OwnerTokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(sessionId: string): Promise<{ message: string }> {
    await this.tokens.revoke(sessionId);
    return { message: 'Logged out' };
  }

  async me(ownerId: string, impersonation?: OwnerImpersonationContext) {
    const [owner] = await this.db.select().from(owners).where(eq(owners.id, ownerId)).limit(1);
    if (!owner) throw OwnerErrors.ownerNotFound();

    const [sub] = await this.db
      .select({
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        planName: subscriptionPlans.name,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.ownerId, ownerId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    return {
      owner: {
        id: owner.id,
        name: owner.name,
        company: owner.company,
        email: owner.email,
        phone: owner.mobile ?? owner.phone,
        emailVerified: owner.emailVerified,
        status: owner.status,
      },
      subscription: sub
        ? {
            status: sub.status,
            planName: sub.planName,
            currentPeriodEnd: sub.currentPeriodEnd,
          }
        : null,
      // Present ONLY under a live support session — the owner app keys its
      // read-only banner off this block.
      ...(impersonation
        ? {
            impersonation: {
              active: true as const,
              byAdmin: impersonation.byAdmin,
              byAdminEmail: impersonation.byAdminEmail,
              sessionId: impersonation.sessionId,
              startedAt: impersonation.startedAt,
              readOnly: true as const,
            },
          }
        : {}),
    };
  }
}
