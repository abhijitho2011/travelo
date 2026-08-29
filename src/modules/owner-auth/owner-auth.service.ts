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

@Injectable()
export class OwnerAuthService {
  private readonly logger = new Logger(OwnerAuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly otp: OwnerOtpService,
    private readonly tokens: OwnerTokenService,
    private readonly firebase: FirebaseService,
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

  async verifyOtp(mobile: string, otp: string): Promise<OwnerTokenPair> {
    const resolved = await this.otp.verify(mobile, otp);
    return this.tokens.issueForOwner(resolved.ownerId, resolved.email);
  }

  async google(idToken: string): Promise<OwnerTokenPair> {
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
