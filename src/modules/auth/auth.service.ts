import {
  Inject,
  Injectable,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { admins, adminSessions } from '../../database/schema';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';
import { AdminMfaService, MfaChallenge } from './admin-mfa.service';
import { randomUUID } from 'node:crypto';

export interface AdminLoginResult {
  admin: { id: string; email: string; name: string; roles: string[]; permissions: string[] };
  tokens: TokenPair;
}

/**
 * What a sign-in attempt resolves to. An admin with MFA enabled gets the
 * challenge, NOT a session — see `issueLoginForAdmin`.
 */
export type AdminSignInResult = AdminLoginResult | MfaChallenge;

export function isMfaChallenge(r: AdminSignInResult): r is MfaChallenge {
  return (r as MfaChallenge).mfaRequired === true;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly perms: PermissionsService,
    private readonly audit: AuditService,
    private readonly mfa: AdminMfaService,
  ) {}

  /**
   * Generic argon2id helpers. Used to hash refresh tokens (and to fill the
   * legacy `admins.password_hash` column when an admin row is created) —
   * NOT for authentication: there is no password sign-in any more.
   */
  static async hashPassword(pw: string): Promise<string> {
    return argon2.hash(pw, { type: argon2.argon2id });
  }

  static async verifyPassword(hash: string, pw: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, pw);
    } catch {
      return false;
    }
  }

  /**
   * Issues a real admin session + token pair for an already-authenticated
   * admin id — the ONLY way an admin session is created. Used by the Google
   * and mobile-OTP sign-in paths so there is exactly one admin token type and
   * one session table. The caller is responsible for having authenticated the
   * identity (and for the allowlist check).
   */
  async issueLoginForAdmin(adminId: string, method: 'google' | 'otp'): Promise<AdminSignInResult> {
    const [admin] = await this.db
      .select({ id: admins.id, email: admins.email, mfaEnabled: admins.mfaEnabled })
      .from(admins)
      .where(and(eq(admins.id, adminId), isNull(admins.deletedAt)))
      .limit(1);
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    // THE GATE. An admin who has enrolled in MFA never receives tokens from
    // the first factor alone — only `completeLoginAfterMfa`, reached through
    // POST /auth/mfa, can mint a session for them.
    if (admin.mfaEnabled) {
      await this.audit.record({
        action: 'admin.login.mfa_required',
        entity: 'admin',
        entityId: admin.id,
        actorId: admin.id,
        actorEmail: admin.email,
        after: { method },
      });
      return this.mfa.issueChallenge(admin.id, method);
    }

    return this.establishSession(adminId, method, `admin.login.${method}`);
  }

  /**
   * The other side of the gate: called ONLY after AdminMfaService has verified
   * a TOTP or a recovery code against a live challenge token.
   */
  async completeLoginAfterMfa(
    adminId: string,
    method: 'google' | 'otp',
  ): Promise<AdminLoginResult> {
    return this.establishSession(adminId, method, `admin.login.${method}.mfa`);
  }

  private async establishSession(
    adminId: string,
    method: 'google' | 'otp',
    action: string,
  ): Promise<AdminLoginResult> {
    const [admin] = await this.db
      .select()
      .from(admins)
      .where(and(eq(admins.id, adminId), isNull(admins.deletedAt)))
      .limit(1);
    if (!admin) throw new UnauthorizedException('Invalid credentials');
    if (admin.status !== 'Active')
      throw new UnauthorizedException(`Account ${admin.status.toLowerCase()}`);

    const effective = await this.perms.getEffectivePermissions(admin.id);

    const session = await this.createSession(admin.id);
    const tokens = await this.issueTokens(
      admin.id,
      admin.email,
      session.id,
      session.refreshTokenPlain,
    );

    const ip = getRequestContext()?.ip ?? null;
    await this.db
      .update(admins)
      .set({
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        updatedAt: new Date(),
      })
      .where(eq(admins.id, admin.id));

    await this.audit.record({
      action,
      entity: 'admin',
      entityId: admin.id,
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: effective.roles[0],
      after: { method, ip },
    });

    return {
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        roles: effective.roles,
        permissions: effective.permissions,
      },
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const [session] = await this.db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.id, payload.sid))
      .limit(1);

    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired');
    }

    const matches = await AuthService.verifyPassword(session.refreshTokenHash, refreshToken);
    if (!matches) {
      // possible token reuse — revoke the whole session for safety
      await this.db
        .update(adminSessions)
        .set({ revokedAt: new Date() })
        .where(eq(adminSessions.id, session.id));
      throw new UnauthorizedException('Refresh token mismatch');
    }

    const [admin] = await this.db
      .select()
      .from(admins)
      .where(eq(admins.id, session.adminId))
      .limit(1);
    if (!admin || admin.status !== 'Active') throw new UnauthorizedException('Admin inactive');

    // Rotate: new refresh token, replace stored hash.
    const newPlainRefresh = await this.signRefresh(admin.id, session.id);
    const newHash = await AuthService.hashPassword(newPlainRefresh);
    await this.db
      .update(adminSessions)
      .set({ refreshTokenHash: newHash, lastUsedAt: new Date() })
      .where(eq(adminSessions.id, session.id));

    const accessToken = await this.signAccess(admin.id, admin.email, session.id);
    return {
      accessToken,
      refreshToken: newPlainRefresh,
      accessExpiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
      refreshExpiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '30d',
    };
  }

  async logout(sessionId: string, adminId: string): Promise<void> {
    await this.db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(eq(adminSessions.id, sessionId));
    await this.audit.record({
      action: 'auth.logout',
      entity: 'admin_session',
      entityId: sessionId,
      actorId: adminId,
    });
  }

  private async createSession(adminId: string): Promise<{ id: string; refreshTokenPlain: string }> {
    const ctx = getRequestContext();
    const ttlDays = this.parseDays(this.config.get<string>('JWT_REFRESH_TTL') ?? '30d');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    // Insert placeholder then update with real hash so we know session id first.
    const [inserted] = await this.db
      .insert(adminSessions)
      .values({
        adminId,
        refreshTokenHash: 'pending',
        userAgent: ctx?.userAgent,
        ip: ctx?.ip,
        expiresAt,
      })
      .returning({ id: adminSessions.id });
    const refreshTokenPlain = await this.signRefresh(adminId, inserted.id);
    const hash = await AuthService.hashPassword(refreshTokenPlain);
    await this.db
      .update(adminSessions)
      .set({ refreshTokenHash: hash })
      .where(eq(adminSessions.id, inserted.id));
    return { id: inserted.id, refreshTokenPlain };
  }

  private async issueTokens(
    adminId: string,
    email: string,
    sessionId: string,
    refreshTokenPlain: string,
  ): Promise<TokenPair> {
    const accessToken = await this.signAccess(adminId, email, sessionId);
    return {
      accessToken,
      refreshToken: refreshTokenPlain,
      accessExpiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
      refreshExpiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '30d',
    };
  }

  private signAccess(adminId: string, email: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: adminId, email, sid: sessionId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
      },
    );
  }

  private signRefresh(adminId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: adminId, sid: sessionId, typ: 'refresh' },
      // A unique jti per token. Without it the payload is fully determined by
      // the session, so two rotations inside the same `iat` second mint
      // byte-identical tokens: rotation becomes a no-op and the reuse
      // detector below cannot tell an attacker's replay from the real client.
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '30d',
        jwtid: randomUUID(),
      },
    );
  }

  private parseDays(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl);
    if (!m) throw new BadRequestException(`Bad JWT ttl: ${ttl}`);
    const n = Number(m[1]);
    switch (m[2]) {
      case 's':
        return n / 86400;
      case 'm':
        return n / 1440;
      case 'h':
        return n / 24;
      case 'd':
      default:
        return n;
    }
  }
}
