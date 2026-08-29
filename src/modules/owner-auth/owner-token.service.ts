import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { owners, ownerSessions } from '../../database/schema';
import { getRequestContext } from '../../common/context/request-context';
import { OWNER_AUDIENCE, OWNER_ISSUER } from './owner-jwt.guard';
import { randomUUID } from 'node:crypto';

export interface OwnerTokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class OwnerTokenService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  static hash(value: string): Promise<string> {
    return argon2.hash(value, { type: argon2.argon2id });
  }

  static async verifyHash(hash: string, value: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, value);
    } catch {
      return false;
    }
  }

  /** Issue a fresh session + access/refresh pair for an owner. */
  async issueForOwner(ownerId: string, email: string): Promise<OwnerTokenPair> {
    const ctx = getRequestContext();
    const ttlDays = this.parseDays(this.config.get<string>('OWNER_JWT_REFRESH_TTL') ?? '30d');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const [session] = await this.db
      .insert(ownerSessions)
      .values({
        ownerId,
        refreshTokenHash: 'pending',
        userAgent: ctx?.userAgent,
        ip: ctx?.ip,
        expiresAt,
      })
      .returning({ id: ownerSessions.id });

    const refreshToken = await this.signRefresh(ownerId, session.id);
    const hash = await OwnerTokenService.hash(refreshToken);
    await this.db
      .update(ownerSessions)
      .set({ refreshTokenHash: hash })
      .where(eq(ownerSessions.id, session.id));

    const accessToken = await this.signAccess(ownerId, email, session.id);
    return { accessToken, refreshToken };
  }

  /** Verify + rotate a refresh token, returning a new pair. */
  async rotate(refreshToken: string): Promise<OwnerTokenPair> {
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('OWNER_JWT_REFRESH_SECRET'),
        issuer: OWNER_ISSUER,
        audience: OWNER_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const [session] = await this.db
      .select()
      .from(ownerSessions)
      .where(eq(ownerSessions.id, payload.sid))
      .limit(1);
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired');
    }
    const matches = await OwnerTokenService.verifyHash(session.refreshTokenHash, refreshToken);
    if (!matches) {
      // Possible reuse — revoke session.
      await this.db
        .update(ownerSessions)
        .set({ revokedAt: new Date() })
        .where(eq(ownerSessions.id, session.id));
      throw new UnauthorizedException('Refresh token mismatch');
    }

    const [owner] = await this.db
      .select()
      .from(owners)
      .where(eq(owners.id, session.ownerId))
      .limit(1);
    if (!owner || owner.status !== 'ACTIVE') throw new UnauthorizedException('Owner inactive');

    const newRefresh = await this.signRefresh(owner.id, session.id);
    const newHash = await OwnerTokenService.hash(newRefresh);
    await this.db
      .update(ownerSessions)
      .set({ refreshTokenHash: newHash })
      .where(eq(ownerSessions.id, session.id));
    const accessToken = await this.signAccess(owner.id, owner.email, session.id);
    return { accessToken, refreshToken: newRefresh };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db
      .update(ownerSessions)
      .set({ revokedAt: new Date() })
      .where(eq(ownerSessions.id, sessionId));
  }

  private signAccess(ownerId: string, email: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: ownerId, email, sid: sessionId, typ: 'access' },
      {
        secret: this.config.getOrThrow<string>('OWNER_JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('OWNER_JWT_ACCESS_TTL') ?? '15m',
        issuer: OWNER_ISSUER,
        audience: OWNER_AUDIENCE,
      },
    );
  }

  private signRefresh(ownerId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: ownerId, sid: sessionId, typ: 'refresh' },
      // A unique jti per token. Without it the payload is fully determined by
      // the session, so two rotations inside the same `iat` second mint
      // byte-identical tokens: rotation becomes a no-op and the reuse
      // detector below cannot tell an attacker's replay from the real client.
      {
        secret: this.config.getOrThrow<string>('OWNER_JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('OWNER_JWT_REFRESH_TTL') ?? '30d',
        jwtid: randomUUID(),
        issuer: OWNER_ISSUER,
        audience: OWNER_AUDIENCE,
      },
    );
  }

  private parseDays(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl);
    if (!m) return 30;
    const n = Number(m[1]);
    switch (m[2]) {
      case 's':
        return n / 86400;
      case 'm':
        return n / 1440;
      case 'h':
        return n / 24;
      default:
        return n;
    }
  }
}
