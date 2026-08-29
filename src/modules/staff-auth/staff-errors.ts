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
  roleNotAssignable: () =>
    staffError(
      'ROLE_NOT_ASSIGNABLE',
      'You may not create a staff member with this role',
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
