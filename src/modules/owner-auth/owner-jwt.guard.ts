import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { Request } from 'express';
import { DRIZZLE, Database } from '../../database/database.module';
import { owners, ownerSessions } from '../../database/schema';
import {
  ImpersonationAccessService,
  ImpersonationGrant,
} from '../impersonation/impersonation-access.service';
import { AuthenticatedOwner, OwnerImpersonationContext } from './current-owner.decorator';

const OWNER_ISSUER = 'tavelo-owner';
const OWNER_AUDIENCE = 'tavelo-owner';

export interface OwnerAccessPayload {
  sub: string; // owner id
  sid: string; // owner session id
  email: string;
  typ?: string;
  iat?: number;
  exp?: number;
}

/**
 * Guard for owner-scoped endpoints. Verifies the owner access token against
 * the SEPARATE owner secret (issuer/audience tavelo-owner) so admin tokens
 * are never accepted here, and vice versa.
 *
 * ONE exception, and only one: a token from the `tavelo-impersonation` family
 * whose session targets an OWNER is accepted as that owner. It is authorised
 * against the `impersonation_sessions` row on EVERY request (so terminating a
 * session logs the support agent out immediately, not at token expiry), and it
 * is READ-ONLY — see READ_ONLY_RATIONALE in impersonation-access.service.ts.
 */
@Injectable()
export class OwnerJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
    /**
     * Optional so the guard can still be constructed in narrow unit/mounting
     * harnesses that do not import ImpersonationModule. When it is absent an
     * impersonation-shaped token is simply refused.
     */
    @Optional() private readonly impersonation?: ImpersonationAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing owner token');
    }
    const token = header.slice('Bearer '.length).trim();

    if (ImpersonationAccessService.looksLikeImpersonationToken(token)) {
      const grant = await this.impersonation?.authenticate(token, 'OWNER');
      if (grant) return this.acceptImpersonation(req, grant);
      // Fell through: an unverifiable impersonation-shaped token is never an
      // owner token, so do not let it try the owner secret.
      throw new UnauthorizedException('Invalid owner token');
    }

    let payload: OwnerAccessPayload;
    try {
      payload = await this.jwt.verifyAsync<OwnerAccessPayload>(token, {
        secret: this.config.getOrThrow<string>('OWNER_JWT_ACCESS_SECRET'),
        issuer: OWNER_ISSUER,
        audience: OWNER_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid owner token');
    }

    const owner = await this.loadOwner(payload.sub);

    const [session] = await this.db
      .select()
      .from(ownerSessions)
      .where(eq(ownerSessions.id, payload.sid))
      .limit(1);
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Owner session invalid');
    }

    const authed: AuthenticatedOwner = {
      id: owner.id,
      email: owner.email,
      name: owner.name,
      status: owner.status,
      sessionId: session.id,
    };
    (req as unknown as { owner: AuthenticatedOwner }).owner = authed;
    return true;
  }

  /**
   * A live support session, serving the owner it targets. Read-only, and both
   * identities go into the request context so every audit row names the real
   * admin as the actor and the owner as the impersonated subject.
   */
  private async acceptImpersonation(req: Request, grant: ImpersonationGrant): Promise<boolean> {
    ImpersonationAccessService.assertReadOnly(req.method, req.path ?? req.url ?? '');

    const owner = await this.loadOwner(grant.targetUserId);
    ImpersonationAccessService.enrichRequestContext(grant);

    const impersonation: OwnerImpersonationContext = {
      active: true,
      byAdmin: grant.byAdmin,
      byAdminEmail: grant.byAdminEmail,
      actorAdminId: grant.actorAdminId,
      sessionId: grant.sessionId,
      startedAt: grant.startedAt.toISOString(),
    };
    const authed: AuthenticatedOwner = {
      id: owner.id,
      email: owner.email,
      name: owner.name,
      status: owner.status,
      // There is no owner_sessions row behind an impersonated request; the
      // impersonation session id stands in so anything that logs a session id
      // logs something traceable rather than an empty string.
      sessionId: grant.sessionId,
      impersonation,
    };
    (req as unknown as { owner: AuthenticatedOwner }).owner = authed;
    return true;
  }

  private async loadOwner(ownerId: string) {
    const [owner] = await this.db.select().from(owners).where(eq(owners.id, ownerId)).limit(1);
    if (!owner || owner.deletedAt) throw new UnauthorizedException('Owner not found');
    if (owner.status !== 'ACTIVE') throw new UnauthorizedException(`Account ${owner.status}`);
    return owner;
  }
}

export { OWNER_ISSUER, OWNER_AUDIENCE };
