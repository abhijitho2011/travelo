import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { admins } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';
import { FirebaseService } from '../shared-auth/firebase.service';
import { SMS_PROVIDER, SmsProvider } from '../shared-auth/sms/sms-provider.interface';
import { normalizeEmail } from '../shared-auth/mobile.util';
import { AuthService, AdminLoginResult } from './auth.service';
import { AdminOtpService } from './admin-otp.service';
import { AdminAuthErrors } from './admin-auth-errors';

/**
 * Google and mobile-OTP sign-in for the super-admin portal.
 *
 * Both methods are gated by a server-side allowlist read from the environment
 * on every attempt (`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_MOBILE`): change the
 * env value and only the new identity can sign in. Email+password login is
 * untouched and remains the break-glass path.
 */
@Injectable()
export class AdminAltAuthService {
  private readonly logger = new Logger(AdminAltAuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly config: ConfigService,
    private readonly otp: AdminOtpService,
    private readonly auth: AuthService,
    private readonly firebase: FirebaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Always answers with the same envelope, whether or not the number is the
   * allowlisted one — the configured number is never disclosed.
   */
  async requestOtp(mobile: string): Promise<{ message: string; expiresAt: string }> {
    await this.otp.enforceRequestRateLimit(mobile);
    const generated = await this.otp.generateForMobile(mobile);
    const expiresAt = generated?.expiresAt ?? this.otp.genericExpiry();
    if (generated) {
      try {
        await this.sms.sendOtp(mobile, generated.otp);
      } catch (err) {
        // Never leak dispatch failures to the client; the answer stays generic.
        this.logger.error(`Failed to dispatch admin OTP SMS: ${(err as Error).message}`);
      }
    }
    return {
      message: 'If this number is registered, a sign-in code has been sent.',
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifyOtp(mobile: string, code: string): Promise<AdminLoginResult> {
    try {
      const { adminId } = await this.otp.verify(mobile, code);
      return await this.auth.issueLoginForAdmin(adminId, 'otp');
    } catch (err) {
      await this.recordFailure('otp');
      throw err;
    }
  }

  async google(idToken: string): Promise<AdminLoginResult> {
    const allowedEmail = normalizeEmail(this.config.get<string>('SUPER_ADMIN_EMAIL'));
    if (!allowedEmail) {
      // Method cleanly disabled rather than crashing boot.
      throw AdminAuthErrors.googleDisabled();
    }

    let email: string | null;
    try {
      const verified = await this.firebase.verifyIdToken(idToken);
      email = normalizeEmail(verified.email);
    } catch (err) {
      await this.recordFailure('google');
      throw err;
    }

    // Allowlist gate — the verified email must be the one configured in env.
    if (!email || email !== allowedEmail) {
      await this.recordFailure('google', email ?? undefined);
      throw AdminAuthErrors.adminNotFound();
    }

    const [admin] = await this.db
      .select({ id: admins.id, status: admins.status })
      .from(admins)
      .where(and(eq(admins.email, email), isNull(admins.deletedAt)))
      .limit(1);

    if (!admin) {
      await this.recordFailure('google', email);
      throw AdminAuthErrors.adminNotFound();
    }
    if (admin.status === 'Blocked') {
      await this.recordFailure('google', email);
      throw AdminAuthErrors.accountBlocked();
    }
    if (admin.status !== 'Active') {
      await this.recordFailure('google', email);
      throw AdminAuthErrors.accountSuspended();
    }

    return this.auth.issueLoginForAdmin(admin.id, 'google');
  }

  private async recordFailure(method: 'google' | 'otp', actorEmail?: string): Promise<void> {
    try {
      await this.audit.record({
        action: 'admin.login.failed',
        entity: 'admin',
        actorEmail,
        after: { method, ip: getRequestContext()?.ip ?? null },
      });
    } catch (err) {
      // Auditing must never mask the original authentication failure.
      this.logger.error(`Failed to record admin login failure: ${(err as Error).message}`);
    }
  }
}
