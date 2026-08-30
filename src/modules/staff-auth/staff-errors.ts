import { HttpException, HttpStatus } from '@nestjs/common';
import type { HotelStaffStatus } from '../../database/schema';

/**
 * Domain errors for the staff surface. The `error` field is surfaced verbatim
 * by the global AllExceptionsFilter as `error.code`, so these strings are the
 * contract the mobile app branches on.
 */
export function staffError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const StaffErrors = {
  /**
   * Deliberately generic. Used for a wrong code AND for a code presented on a
   * mobile that belongs to nobody, so OTP verify never discloses whether a
   * number is registered.
   */
  invalidOtp: () => staffError('INVALID_OTP', 'Invalid OTP', HttpStatus.UNAUTHORIZED),
  otpExpired: () => staffError('OTP_EXPIRED', 'OTP has expired', HttpStatus.UNAUTHORIZED),
  otpThrottled: () =>
    staffError(
      'OTP_THROTTLED',
      'Too many OTP requests, try again later',
      HttpStatus.TOO_MANY_REQUESTS,
    ),
  /** Google sign-in only: no staff row for the verified email. Never auto-creates. */
  staffNotFound: () =>
    staffError('STAFF_NOT_FOUND', 'No staff account for this identity', HttpStatus.NOT_FOUND),
  accountInvited: () =>
    staffError(
      'ACCOUNT_INVITED',
      'Your invitation has not been completed yet',
      HttpStatus.FORBIDDEN,
    ),
  accountPendingApproval: () =>
    staffError(
      'ACCOUNT_PENDING_APPROVAL',
      'Your account is awaiting approval from your manager',
      HttpStatus.FORBIDDEN,
    ),
  accountBlocked: () => staffError('ACCOUNT_BLOCKED', 'Account is blocked', HttpStatus.FORBIDDEN),
  accountSuspended: () =>
    staffError('ACCOUNT_SUSPENDED', 'Account is suspended', HttpStatus.FORBIDDEN),
  accountDeactivated: () =>
    staffError('ACCOUNT_DEACTIVATED', 'Account is deactivated', HttpStatus.FORBIDDEN),
  accountNotActive: () =>
    staffError('ACCOUNT_NOT_ACTIVE', 'Account is not active', HttpStatus.FORBIDDEN),
  forbidden: (message = 'Insufficient permissions') =>
    staffError('STAFF_FORBIDDEN', message, HttpStatus.FORBIDDEN),
  // ---------- Sessions ----------
  sessionNotFound: () => staffError('SESSION_NOT_FOUND', 'Session not found', HttpStatus.NOT_FOUND),

  // ---------- TOTP MFA ----------
  mfaNotConfigured: () =>
    staffError(
      'MFA_NOT_CONFIGURED',
      'Two-factor authentication is not available on this deployment (no encryption key is configured). Contact your platform operator.',
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
  mfaNotEnrolled: () =>
    staffError(
      'MFA_NOT_ENROLLED',
      'Start enrolment before verifying a code',
      HttpStatus.BAD_REQUEST,
    ),
  mfaAlreadyEnabled: () =>
    staffError(
      'MFA_ALREADY_ENABLED',
      'Two-factor authentication is already enabled',
      HttpStatus.CONFLICT,
    ),
  mfaNotEnabled: () =>
    staffError(
      'MFA_NOT_ENABLED',
      'Two-factor authentication is not enabled',
      HttpStatus.BAD_REQUEST,
    ),
  mfaInvalidCode: () =>
    staffError('MFA_INVALID_CODE', 'Invalid or expired code', HttpStatus.UNAUTHORIZED),
  mfaChallengeInvalid: () =>
    staffError(
      'MFA_CHALLENGE_INVALID',
      'This sign-in attempt has expired. Start again.',
      HttpStatus.UNAUTHORIZED,
    ),
  mfaLocked: (seconds: number) =>
    staffError(
      'MFA_LOCKED',
      `Too many incorrect codes. Try again in ${Math.ceil(seconds / 60)} minute(s).`,
      HttpStatus.TOO_MANY_REQUESTS,
    ),
  /**
   * Also returned when the target row belongs to ANOTHER property: a 404 keeps
   * property membership from leaking, where a 403 would confirm the row exists.
   */
  notFound: (message = 'Not found') =>
    staffError('STAFF_MEMBER_NOT_FOUND', message, HttpStatus.NOT_FOUND),
  selfModification: () =>
    staffError(
      'SELF_MODIFICATION_FORBIDDEN',
      'You cannot change your own role, status or membership',
      HttpStatus.FORBIDDEN,
    ),
  /**
   * The role is off-limits to EVERY staff member: GM and AGM are appointed by
   * the owner, never from inside the property.
   */
  roleNotAssignable: () =>
    staffError(
      'ROLE_NOT_ASSIGNABLE',
      'You may not create a staff member with this role',
      HttpStatus.FORBIDDEN,
    ),
  /**
   * The role is creatable by somebody — just not by this actor. HR reaching for
   * GM, AGM or another HR lands here. Kept distinct from ROLE_NOT_ASSIGNABLE so
   * the app can say "not you" rather than "not ever".
   */
  roleNotPermitted: () =>
    staffError(
      'ROLE_NOT_PERMITTED',
      'Your role may not create a staff member with this role',
      HttpStatus.FORBIDDEN,
    ),
  /**
   * Making an account live is the approval decision itself, whichever route it
   * is reached by. Without this, `staff.update` would be a back door around
   * `staff.approve`: HR could raise a PENDING_APPROVAL row and then set it to
   * ACTIVE, and no manager would ever have decided anything.
   */
  activationRequiresApproval: () =>
    staffError(
      'ACTIVATION_NOT_PERMITTED',
      'Only a manager with approval rights can make an account active',
      HttpStatus.FORBIDDEN,
    ),
};

/**
 * The typed error for a staff row that exists but cannot sign in. Reached only
 * after the caller has already proved possession of the mobile (or of a Google
 * identity), so naming the exact status discloses nothing they did not know.
 */
export function accountStatusError(status: HotelStaffStatus | string): HttpException {
  switch (status) {
    case 'INVITED':
      return StaffErrors.accountInvited();
    // APPROVED means "approved but not yet activated" — from the staff member's
    // side that is still the waiting-for-approval screen.
    case 'PENDING_APPROVAL':
    case 'APPROVED':
      return StaffErrors.accountPendingApproval();
    case 'BLOCKED':
      return StaffErrors.accountBlocked();
    case 'SUSPENDED':
      return StaffErrors.accountSuspended();
    case 'DEACTIVATED':
      return StaffErrors.accountDeactivated();
    default:
      return StaffErrors.accountNotActive();
  }
}
