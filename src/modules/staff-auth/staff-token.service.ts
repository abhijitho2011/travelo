import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { hotelStaff, staffSessions } from '../../database/schema';
import { getRequestContext } from '../../common/context/request-context';
import { STAFF_AUDIENCE, STAFF_ISSUER } from './staff-jwt.guard';

export interface StaffTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface StaffTokenSubject {
  id: string;
  propertyId: string;
  role: string;
}

/**
 * The staff token family. Structurally identical to OwnerTokenService, but
 * signed with STAFF_JWT_* secrets under the tavelo-staff issuer/audience and
 * persisted in staff_sessions — three independent reasons a token from one
 * surface cannot be replayed on another.
 */
@Injectable()
export class StaffTokenService {
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

  /** Issue a fresh session + token pair and stamp `last_login_at`. */
  async issueForStaff(staff: StaffTokenSubject): Promise<StaffTokenPair> {
    const ctx = getRequestContext();
    const ttlDays = this.parseDays(this.config.get<string>('STAFF_JWT_REFRESH_TTL') ?? '30d');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const [session] = await this.db
      .insert(staffSessions)
      .values({
        staffId: staff.id,
        refreshTokenHash: 'pending',
        userAgent: ctx?.userAgent,
        ip: ctx?.ip,
        expiresAt,
      })
      .returning({ id: staffSessions.id });

    const refreshToken = await this.signRefresh(staff.id, session.id);
    const hash = await StaffTokenService.hash(refreshToken);
    await this.db
      .update(staffSessions)
      .set({ refreshTokenHash: hash })
      .where(eq(staffSessions.id, session.id));

    const accessToken = await this.signAccess(staff, session.id);
    await this.db
      .update(hotelStaff)
      .set({ lastLoginAt: new Date() })
      .where(eq(hotelStaff.id, staff.id));

    return { accessToken, refreshToken };
  }

  /** Verify + rotate a refresh token, returning a new pair. */
  async rotate(refreshToken: string): Promise<StaffTokenPair> {
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('STAFF_JWT_REFRESH_SECRET'),
        issuer: STAFF_ISSUER,
        audience: STAFF_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const [session] = await this.db
      .select()
      .from(staffSessions)
      .where(eq(staffSessions.id, payload.sid))
      .limit(1);
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired');
    }
    const matches = await StaffTokenService.verifyHash(session.refreshTokenHash, refreshToken);
    if (!matches) {
      // Possible replay/theft — kill the session rather than re-issue.
      await this.db
        .update(staffSessions)
        .set({ revokedAt: new Date() })
        .where(eq(staffSessions.id, session.id));
      throw new UnauthorizedException('Refresh token mismatch');
    }

    const [staff] = await this.db
      .select()
      .from(hotelStaff)
      .where(eq(hotelStaff.id, session.staffId))
      .limit(1);
    if (!staff || staff.deletedAt || staff.status !== 'ACTIVE') {
      throw new UnauthorizedException('Staff inactive');
    }

    const newRefresh = await this.signRefresh(staff.id, session.id);
    const newHash = await StaffTokenService.hash(newRefresh);
    await this.db
      .update(staffSessions)
      .set({ refreshTokenHash: newHash })
      .where(eq(staffSessions.id, session.id));
    const accessToken = await this.signAccess(
      { id: staff.id, propertyId: staff.propertyId, role: staff.role },
      session.id,
    );
    return { accessToken, refreshToken: newRefresh };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db
      .update(staffSessions)
      .set({ revokedAt: new Date() })
      .where(eq(staffSessions.id, sessionId));
  }

  private signAccess(staff: StaffTokenSubject, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: staff.id, pid: staff.propertyId, role: staff.role, sid: sessionId, typ: 'access' },
      {
        secret: this.config.getOrThrow<string>('STAFF_JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('STAFF_JWT_ACCESS_TTL') ?? '15m',
        issuer: STAFF_ISSUER,
        audience: STAFF_AUDIENCE,
      },
    );
  }

  private signRefresh(staffId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: staffId, sid: sessionId, typ: 'refresh' },
      {
        secret: this.config.getOrThrow<string>('STAFF_JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('STAFF_JWT_REFRESH_TTL') ?? '30d',
        issuer: STAFF_ISSUER,
        audience: STAFF_AUDIENCE,
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
