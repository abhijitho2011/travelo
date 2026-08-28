import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { eq } from 'drizzle-orm';
import { Request } from 'express';
import { DRIZZLE, Database } from '../../../database/database.module';
import { admins, adminSessions } from '../../../database/schema';
import { requestContext } from '../../../common/context/request-context';
import { AuthenticatedAdmin } from '../../../common/decorators/current-admin.decorator';

export interface JwtAccessPayload {
  sub: string; // admin id
  sid: string; // session id
  email: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtAccessPayload): Promise<AuthenticatedAdmin> {
    const [admin] = await this.db.select().from(admins).where(eq(admins.id, payload.sub)).limit(1);
    if (!admin || admin.status !== 'Active' || admin.deletedAt) {
      throw new UnauthorizedException('Admin not active');
    }

    const [session] = await this.db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.id, payload.sid))
      .limit(1);
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session invalid');
    }

    const authed: AuthenticatedAdmin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      status: admin.status,
      sessionId: session.id,
      roles: [],
      permissions: [],
    };

    // Enrich the AsyncLocalStorage context with actor identity.
    const store = requestContext.getStore();
    if (store) {
      store.adminId = admin.id;
      store.sessionId = session.id;
      store.adminEmail = admin.email;
    }

    (req as unknown as { admin: AuthenticatedAdmin }).admin = authed;
    return authed;
  }
}
