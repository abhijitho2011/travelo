import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { admins, impersonationSessions } from '../../database/schema';
import { requestContext } from '../../common/context/request-context';
import { ImpersonationErrors } from './impersonation-errors';
import { IMPERSONATION_AUDIENCE, IMPERSONATION_ISSUER } from './impersonation.constants';

/**
 * ============================ READ-ONLY RATIONALE ============================
 *
 * An impersonation token authenticates a *Tavelo employee* who is standing in
 * the customer's shoes. It is accepted by the owner API so support can SEE what
 * the customer sees — nothing more.
 *
 * Every state-changing verb (POST / PATCH / PUT / DELETE) is refused with a
 * typed `IMPERSONATION_READ_ONLY`, because:
 *
 *   1. A write made under impersonation is indistinguishable, to the customer,
 *      from a write they made themselves. "I never cancelled that booking" is
 *      an argument no audit trail fully wins.
 *   2. Support's job is to diagnose and then *tell* the customer what to do, or
 *      to act through the admin console under their own admin identity — where
 *      the permission model and the audit trail already name them as the actor.
 *   3. It makes the blast radius of a leaked impersonation token a disclosure
 *      incident rather than a data-destruction one.
 *
 * `WRITE_ALLOWLIST` is the escape hatch and is DELIBERATELY EMPTY. Adding an
 * entry is a security decision: it must be a narrowly-scoped, idempotent,
 * clearly-support-owned action, and it must be reviewed as such. Do not widen
 * it to "unblock" a support workflow — take that workflow to the admin console.
 * ============================================================================
 */
export interface ImpersonationWriteAllowance {
  /** Uppercase HTTP method, e.g. 'POST'. */
  method: string;
  /** Matched against the request path (no query string). */
  path: RegExp;
}

export const WRITE_ALLOWLIST: ReadonlyArray<ImpersonationWriteAllowance> = [];

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface ImpersonationTokenPayload {
  sessionId: string;
  actorAdminId: string;
  targetUserId?: string;
  jti?: string;
  iss?: string;
  aud?: string;
  exp?: number;
}

/** What a verified, still-live impersonation session grants the bearer. */
export interface ImpersonationGrant {
  sessionId: string;
  actorAdminId: string;
  /** Display name (falling back to email) of the admin behind the session. */
  byAdmin: string;
  byAdminEmail: string;
  targetUserType: string;
  targetUserId: string;
  startedAt: Date;
}

/**
 * Turns an impersonation bearer token into a live grant — or into a typed
 * error. Deliberately a separate service from ImpersonationService (which
 * *mints* sessions) so the owner API can consume tokens without pulling in the
 * admin-side controller surface.
 */
@Injectable()
export class ImpersonationAccessService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Cheap, allocation-free test for "is this even an impersonation token?" so
   * the owner guard can fall through to normal owner verification without
   * paying for a failed signature check first.
   */
  static looksLikeImpersonationToken(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        iss?: string;
      };
      return claims.iss === IMPERSONATION_ISSUER;
    } catch {
      return false;
    }
  }

  /**
   * Verifies the signature AND re-reads the session row. The database is the
   * authority on whether the session is live: a terminated session must stop
   * working on the next request, not when the ~60-minute token expires.
   *
   * Returns `null` when the token is not an impersonation token at all (so the
   * caller can try its own token family); throws a typed error when it IS one
   * but must not be honoured.
   */
  async authenticate(
    token: string,
    expectedTargetType: 'OWNER' | 'GM' | 'AGM',
  ): Promise<ImpersonationGrant | null> {
    let payload: ImpersonationTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<ImpersonationTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: IMPERSONATION_ISSUER,
        audience: IMPERSONATION_AUDIENCE,
      });
    } catch {
      // Not a (valid) impersonation token — let the caller try its own family.
      return null;
    }
    if (!payload.sessionId) return null;

    const [row] = await this.db
      .select()
      .from(impersonationSessions)
      .where(eq(impersonationSessions.id, payload.sessionId))
      .limit(1);

    // Revocation is checked here, against the row, on EVERY request.
    if (!row) throw ImpersonationErrors.sessionEnded();
    if (row.status !== 'ACTIVE' || row.endedAt) throw ImpersonationErrors.sessionEnded();
    if (row.tokenJti && payload.jti && row.tokenJti !== payload.jti) {
      throw ImpersonationErrors.sessionEnded();
    }

    if (row.targetUserType !== expectedTargetType) throw ImpersonationErrors.wrongTarget();

    const targetUserId = row.targetUserId ?? row.targetOwnerId ?? payload.targetUserId;
    if (!targetUserId) throw ImpersonationErrors.wrongTarget();
    if (payload.targetUserId && payload.targetUserId !== targetUserId) {
      throw ImpersonationErrors.wrongTarget();
    }

    const [admin] = await this.db
      .select({ id: admins.id, name: admins.name, email: admins.email })
      .from(admins)
      .where(eq(admins.id, row.actorAdminId))
      .limit(1);

    return {
      sessionId: row.id,
      actorAdminId: row.actorAdminId,
      byAdmin: admin?.name || admin?.email || 'Tavelo Support',
      byAdminEmail: admin?.email ?? '',
      targetUserType: row.targetUserType,
      targetUserId,
      startedAt: row.startedAt,
    };
  }

  /**
   * Refuses every state-changing verb that is not on the (empty) allowlist.
   * See READ_ONLY_RATIONALE above before touching this.
   */
  static assertReadOnly(method: string, path: string): void {
    const verb = method.toUpperCase();
    if (READ_ONLY_METHODS.has(verb)) return;
    const bare = path.split('?')[0];
    if (WRITE_ALLOWLIST.some((a) => a.method === verb && a.path.test(bare))) return;
    throw ImpersonationErrors.readOnly();
  }

  /**
   * Puts BOTH identities into the request context so every audit row written
   * while serving this request names the real admin *and* the impersonated
   * user. Without this an impersonated read would look like the customer's own.
   */
  static enrichRequestContext(grant: ImpersonationGrant): void {
    const store = requestContext.getStore();
    if (!store) return;
    store.actorAdminId = grant.actorAdminId;
    store.adminId = grant.actorAdminId;
    store.adminEmail = grant.byAdminEmail || undefined;
    store.impersonatedUserId = grant.targetUserId;
    store.impersonationSessionId = grant.sessionId;
  }
}
