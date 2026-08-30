import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { hotelStaff, owners, properties, type HotelStaff } from '../../database/schema';
import { FirebaseService } from '../shared-auth/firebase.service';
import { SMS_PROVIDER, SmsProvider } from '../shared-auth/sms/sms-provider.interface';
import { maskMobile } from '../shared-auth/mobile.util';
import { StaffOtpService } from './staff-otp.service';
import { StaffTokenService, StaffTokenPair } from './staff-token.service';
import { accountStatusError, StaffErrors } from './staff-errors';
import { permissionsForRole } from './role-permissions';
import { StaffMfaService, StaffMfaChallenge } from './staff-mfa.service';

/** Either a real session (first factor was enough) or an MFA challenge. */
export type StaffSignInResult = StaffTokenPair | StaffMfaChallenge;

export function isStaffMfaChallenge(r: StaffSignInResult): r is StaffMfaChallenge {
  return (r as StaffMfaChallenge).mfaRequired === true;
}

@Injectable()
export class StaffAuthService {
  private readonly logger = new Logger(StaffAuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly otp: StaffOtpService,
    private readonly tokens: StaffTokenService,
    private readonly firebase: FirebaseService,
    private readonly mfa: StaffMfaService,
  ) {}

  /**
   * ALWAYS the same envelope, whether or not the number belongs to a staff
   * member — an SMS is dispatched only in the former case. The response body,
   * the status code and the expiry are identical either way, so the endpoint
   * cannot be used to enumerate the workforce.
   */
  async requestOtp(mobile: string): Promise<{ message: string; expiresAt: string }> {
    await this.otp.enforceRequestRateLimit(mobile);
    const generated = await this.otp.generateForMobile(mobile);
    const expiresAt = generated?.expiresAt ?? this.otp.genericExpiry();
    if (generated) {
      try {
        await this.sms.sendOtp(mobile, generated.otp);
      } catch (err) {
        // Never leak SMS failure to the client; the response stays generic.
        this.logger.error(
          `Failed to dispatch staff OTP SMS to ${maskMobile(mobile)}: ${(err as Error).message}`,
        );
      }
    }
    return {
      message: 'If a staff account exists for this number, an OTP has been sent.',
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * A wrong code — or any code on an unregistered number — yields the generic
   * INVALID_OTP. A correct code on a non-ACTIVE row yields the SPECIFIC status
   * error: possession of the number is already proved, so naming the status
   * tells the holder nothing new and lets the app show the right screen.
   */
  async verifyOtp(mobile: string, otp: string): Promise<StaffSignInResult> {
    const staff = await this.otp.verify(mobile, otp);
    if (staff.status !== 'ACTIVE') throw accountStatusError(staff.status);
    if (staff.mfaEnabled) return this.mfa.issueChallenge(staff.id, 'otp');
    return this.tokens.issueForStaff({
      id: staff.id,
      propertyId: staff.propertyId,
      role: staff.role,
    });
  }

  /**
   * Google sign-in NEVER provisions an account. The verified email must already
   * match a live `hotel_staff` row — staff exist because an owner or a GM
   * created them, never because someone showed up with a Google identity.
   */
  async google(idToken: string): Promise<StaffSignInResult> {
    const verified = await this.firebase.verifyIdToken(idToken);
    if (!verified.email) throw StaffErrors.staffNotFound();
    const staff = await this.findByEmail(verified.email.toLowerCase());
    if (!staff) throw StaffErrors.staffNotFound();
    if (staff.status !== 'ACTIVE') throw accountStatusError(staff.status);
    if (staff.mfaEnabled) return this.mfa.issueChallenge(staff.id, 'google');
    return this.tokens.issueForStaff({
      id: staff.id,
      propertyId: staff.propertyId,
      role: staff.role,
    });
  }

  /**
   * The other side of the MFA gate: called ONLY after StaffMfaService has
   * verified a TOTP or a recovery code against a live challenge token.
   */
  async completeLoginAfterMfa(staffId: string): Promise<StaffTokenPair> {
    const [staff] = await this.db
      .select()
      .from(hotelStaff)
      .where(and(eq(hotelStaff.id, staffId), isNull(hotelStaff.deletedAt)))
      .limit(1);
    if (!staff) throw StaffErrors.staffNotFound();
    if (staff.status !== 'ACTIVE') throw accountStatusError(staff.status);
    return this.tokens.issueForStaff({
      id: staff.id,
      propertyId: staff.propertyId,
      role: staff.role,
    });
  }

  async refresh(refreshToken: string): Promise<StaffTokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(sessionId: string): Promise<{ message: string }> {
    await this.tokens.revoke(sessionId);
    return { message: 'Logged out' };
  }

  /**
   * The role-detection payload the app boots from: who I am, which hotel and
   * organisation I belong to, my role, and the permissions that role resolves
   * to right now.
   */
  async me(staffId: string) {
    const [row] = await this.db
      .select({
        s: hotelStaff,
        propertyName: properties.name,
        propertyCity: properties.city,
        propertyState: properties.state,
        ownerName: owners.name,
        ownerCompany: owners.company,
      })
      .from(hotelStaff)
      .leftJoin(properties, eq(hotelStaff.propertyId, properties.id))
      .leftJoin(owners, eq(hotelStaff.ownerId, owners.id))
      .where(and(eq(hotelStaff.id, staffId), isNull(hotelStaff.deletedAt)))
      .limit(1);
    if (!row) throw StaffErrors.staffNotFound();
    const s = row.s;

    return {
      user: {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        fullName: `${s.firstName} ${s.lastName}`.trim(),
        email: s.email,
        mobile: s.mobile,
        employeeId: s.employeeId,
        department: s.department,
        status: s.status,
      },
      hotel: {
        id: s.propertyId,
        name: row.propertyName,
        city: row.propertyCity,
        state: row.propertyState,
      },
      organization: {
        id: s.ownerId,
        name: row.ownerCompany ?? row.ownerName,
      },
      role: s.role,
      permissions: permissionsForRole(s.role),
    };
  }

  /**
   * An email is unique per property, not globally, so an ACTIVE row wins and
   * the oldest live row is the fallback used to raise the status error.
   */
  private async findByEmail(email: string): Promise<HotelStaff | null> {
    const rows = await this.db
      .select()
      .from(hotelStaff)
      .where(and(eq(hotelStaff.email, email), isNull(hotelStaff.deletedAt)))
      .orderBy(
        sql`CASE WHEN ${hotelStaff.status} = 'ACTIVE' THEN 0 ELSE 1 END`,
        asc(hotelStaff.createdAt),
      )
      .limit(1);
    return rows[0] ?? null;
  }
}
