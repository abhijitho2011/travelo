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
import { hotelStaff, staffSessions } from '../../database/schema';
import { AuthenticatedStaff } from './current-staff.decorator';
import { permissionsForRole } from './role-permissions';

const STAFF_ISSUER = 'tavelo-staff';
const STAFF_AUDIENCE = 'tavelo-staff';

export interface StaffAccessPayload {
  sub: string; // hotel_staff id
  sid: string; // staff_sessions id
  pid: string; // property id
  role: string;
  typ?: string;
  iat?: number;
  exp?: number;
}

/**
 * Guard for the staff app. Verifies against the staff-only secret with the
 * staff issuer/audience, so an admin or owner access token can never be
 * accepted here — and the staff token is equally useless against
 * `JwtAuthGuard` (admin) and `OwnerJwtGuard`.
 *
 * The DB is re-read on every request: the staff row must still exist, be
 * un-deleted and ACTIVE, and the session must be live. Blocking a staff member
 * therefore takes effect on their very next call, without waiting for the
 * 15-minute access token to expire.
 */
@Injectable()
export class StaffJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing staff token');
    }
    const token = header.slice('Bearer '.length).trim();

    let payload: StaffAccessPayload;
    try {
      payload = await this.jwt.verifyAsync<StaffAccessPayload>(token, {
        secret: this.config.getOrThrow<string>('STAFF_JWT_ACCESS_SECRET'),
        issuer: STAFF_ISSUER,
        audience: STAFF_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid staff token');
    }

    const [staff] = await this.db
      .select()
      .from(hotelStaff)
      .where(eq(hotelStaff.id, payload.sub))
      .limit(1);
    if (!staff || staff.deletedAt) throw new UnauthorizedException('Staff not found');
    if (staff.status !== 'ACTIVE') throw new UnauthorizedException(`Account ${staff.status}`);

    const [session] = await this.db
      .select()
      .from(staffSessions)
      .where(eq(staffSessions.id, payload.sid))
      .limit(1);
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Staff session invalid');
    }

    const authed: AuthenticatedStaff = {
      id: staff.id,
      propertyId: staff.propertyId,
      ownerId: staff.ownerId,
      // The role comes from the DB row, not the token: a re-graded staff member
      // gets their new permissions immediately and cannot pin the old ones.
      role: staff.role,
      email: staff.email,
      mobile: staff.mobile,
      firstName: staff.firstName,
      lastName: staff.lastName,
      status: staff.status,
      sessionId: session.id,
      permissions: permissionsForRole(staff.role),
    };
    (req as unknown as { staff: AuthenticatedStaff }).staff = authed;
    return true;
  }
}

export { STAFF_ISSUER, STAFF_AUDIENCE };
