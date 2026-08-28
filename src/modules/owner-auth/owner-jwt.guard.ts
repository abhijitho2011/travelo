import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { Request } from 'express';
import { DRIZZLE, Database } from '../../database/database.module';
import { owners, ownerSessions } from '../../database/schema';
import { AuthenticatedOwner } from './current-owner.decorator';

const OWNER_ISSUER = 'travelo-owner';
const OWNER_AUDIENCE = 'travelo-owner';

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
 * the SEPARATE owner secret (issuer/audience travelo-owner) so admin tokens
 * are never accepted here, and vice versa.
 */
@Injectable()
export class OwnerJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing owner token');
    }
    const token = header.slice('Bearer '.length).trim();

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

    const [owner] = await this.db.select().from(owners).where(eq(owners.id, payload.sub)).limit(1);
    if (!owner || owner.deletedAt) throw new UnauthorizedException('Owner not found');
    if (owner.status !== 'ACTIVE') throw new UnauthorizedException(`Account ${owner.status}`);

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
}

export { OWNER_ISSUER, OWNER_AUDIENCE };
