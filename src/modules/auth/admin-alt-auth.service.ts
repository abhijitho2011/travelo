import { HttpException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { admins } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';
import { FirebaseService } from '../shared-auth/firebase.service';
import { SMS_PROVIDER, SmsProvider } from '../shared-auth/sms/sms-provider.interface';
import { maskMobile, normalizeEmail, normalizeMobile } from '../shared-auth/mobile.util';
import { AuthService, AdminLoginResult } from './auth.service';
import { AdminOtpService } from './admin-otp.service';
import { AdminAuthErrors } from './admin-auth-errors';

/**
 * Google and mobile-OTP sign-in for the super-admin portal.
 *
 * These are the ONLY ways into the admin portal — password sign-in no longer
 * exists. Both are gated by a server-side allowlist read from the environment
 * on every attempt (`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_MOBILE`): change the env
 * value and only the new identity can sign in.
 *
 * Because there is no password fallback, this service is deliberately
 * lockout-averse: it warns loudly at boot when no identity is configured, it
 * writes the OTP to the server log when (and only when) SMS dispatch fails so
 * the operator can still get in from the deploy log, and it never lets an
 * unexpected error surface as an opaque 500.
 */
@Injectable()
export class AdminAltAuthService implements OnModuleInit {
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
   * Boot-time guard: with no password fallback, an unconfigured allowlist means
   * nobody can sign in at all. Say so loudly — but never crash the process.
   */
  async onModuleInit(): Promise<void> {
    const email = normalizeEmail(this.config.get<string>('SUPER_ADMIN_EMAIL'));
    const mobile = normalizeMobile(this.config.get<string>('SUPER_ADMIN_MOBILE'));
    if (!email && !mobile) {
      this.logger.warn(
        '*** ADMIN SIGN-IN IS IMPOSSIBLE: neither SUPER_ADMIN_EMAIL nor SUPER_ADMIN_MOBILE is set, ' +
          'and password login no longer exists. Set at least one of them and redeploy. ***',
      );
      return;
    }
    if (!email) this.logger.warn('SUPER_ADMIN_EMAIL is not set — Google sign-in is disabled.');
    if (!mobile) this.logger.warn('SUPER_ADMIN_MOBILE is not set — OTP sign-in is disabled.');
    await this.reconcileSuperAdminMobile(email, mobile);
  }

  /**
   * Attaches SUPER_ADMIN_MOBILE to the allowlisted admin row so OTP sign-in can
   * resolve to it without waiting for a seed run. Without this an operator who
   * changes SUPER_ADMIN_MOBILE would be locked out until the seed happened to
   * run — and there is no password fallback. Entirely failure-tolerant.
   */
  private async reconcileSuperAdminMobile(
    email: string | null,
    mobile: string | null,
  ): Promise<void> {
    if (!email || !mobile) return;
    try {
      const [admin] = await this.db
        .select({ id: admins.id, mobile: admins.mobile })
        .from(admins)
        .where(and(eq(admins.email, email), isNull(admins.deletedAt)))
        .limit(1);
      if (!admin) {
        this.logger.warn(
          `SUPER_ADMIN_EMAIL does not match any admin row — sign-in will fail until one exists (run the seed).`,
        );
        return;
      }
      if (admin.mobile === mobile) return;
      await this.db
        .update(admins)
        .set({ mobile, updatedAt: new Date() })
        .where(eq(admins.id, admin.id));
      this.logger.log(
        `Super-admin mobile synced from SUPER_ADMIN_MOBILE (${maskMobile(mobile)}) — OTP sign-in enabled.`,
      );
    } catch (err) {
      // Never block boot on this; /health must still come up.
      this.logger.error(`Could not sync the super-admin mobile: ${(err as Error).message}`);
    }
  }

  /**
   * Always answers with the same envelope, whether or not the number is the
   * allowlisted one — the configured number is never disclosed. Unexpected
   * failures are swallowed for the same reason (only throttling is surfaced).
   */
  async requestOtp(mobile: string): Promise<{ message: string; expiresAt: string }> {
    await this.otp.enforceRequestRateLimit(mobile);

    let generated: { otp: string; expiresAt: Date } | null = null;
    try {
      generated = await this.otp.generateForMobile(mobile);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Admin OTP generation failed: ${(err as Error).message}`);
    }

    if (generated) {
      try {
        await this.sms.sendOtp(mobile, generated.otp);
      } catch (err) {
        // BREAK-GLASS: SMS is the only delivery channel and there is no password
        // login, so a dispatch failure must not lock the operator out. The code
        // goes to the server log (visible in the Railway deploy log) — never to
        // the client, and never on the success path.
        this.logger.error(`Failed to dispatch admin OTP SMS: ${(err as Error).message}`);
        this.logger.warn(`[ADMIN-OTP] code for ${maskMobile(mobile)}: ${generated.otp}`);
      }
    }

    return {
      message: 'If this number is registered, a sign-in code has been sent.',
      expiresAt: (generated?.expiresAt ?? this.otp.genericExpiry()).toISOString(),
    };
  }

  async verifyOtp(mobile: string, code: string): Promise<AdminLoginResult> {
    try {
      const { adminId } = await this.otp.verify(mobile, code);
      return await this.auth.issueLoginForAdmin(adminId, 'otp');
    } catch (err) {
      await this.recordFailure('otp');
      throw this.asTypedError(err, 'otp');
    }
  }

  async google(idToken: string): Promise<AdminLoginResult> {
    try {
      return await this.googleInner(idToken);
    } catch (err) {
      throw this.asTypedError(err, 'google');
    }
  }

  private async googleInner(idToken: string): Promise<AdminLoginResult> {
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

  /**
   * Guarantees a typed, meaningful error. A misconfigured env value or an
   * unreachable dependency degrades to "cannot sign in" plus a server-side log
   * — never an opaque 500.
   */
  private asTypedError(err: unknown, method: 'google' | 'otp'): unknown {
    if (err instanceof HttpException) return err;
    this.logger.error(
      `Unexpected failure during ${method} sign-in: ${(err as Error)?.message ?? String(err)}`,
      (err as Error)?.stack,
    );
    return method === 'google' ? AdminAuthErrors.adminNotFound() : AdminAuthErrors.invalidOtp();
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
