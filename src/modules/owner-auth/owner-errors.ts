import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Throw a domain error whose `code` is surfaced verbatim by the global
 * AllExceptionsFilter (it reads the `error` field, uppercases + underscores).
 */
export function ownerError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const OwnerErrors = {
  ownerNotFound: () => ownerError('OWNER_NOT_FOUND', 'Owner not found', HttpStatus.NOT_FOUND),
  accountSuspended: () =>
    ownerError('ACCOUNT_SUSPENDED', 'Account is suspended', HttpStatus.FORBIDDEN),
  accountBlocked: () => ownerError('ACCOUNT_BLOCKED', 'Account is blocked', HttpStatus.FORBIDDEN),
  propertyLimitReached: () =>
    ownerError(
      'PROPERTY_LIMIT_REACHED',
      'Property limit for your subscription has been reached',
      HttpStatus.FORBIDDEN,
    ),
  invalidOtp: () => ownerError('INVALID_OTP', 'Invalid OTP', HttpStatus.UNAUTHORIZED),
  otpExpired: () => ownerError('OTP_EXPIRED', 'OTP has expired', HttpStatus.UNAUTHORIZED),
  otpThrottled: () =>
    ownerError(
      'OTP_THROTTLED',
      'Too many OTP requests, try again later',
      HttpStatus.TOO_MANY_REQUESTS,
    ),

  // ---------- Staff ----------
  /**
   * 404 rather than 403 for a staff row the owner does not hold: a 403 would
   * confirm the row exists at some other property.
   */
  staffNotFound: () => ownerError('STAFF_NOT_FOUND', 'Team member not found', HttpStatus.NOT_FOUND),
  /** Surfaces the partial unique (property_id, email) as a typed conflict. */
  staffEmailTaken: () =>
    ownerError(
      'STAFF_EMAIL_TAKEN',
      'Another team member at this hotel already uses that email address',
      HttpStatus.CONFLICT,
    ),
  propertyNotFound: () => ownerError('PROPERTY_NOT_FOUND', 'Hotel not found', HttpStatus.NOT_FOUND),

  // ---------- Shared input validation ----------
  invalidLocation: (message: string) =>
    ownerError('INVALID_LOCATION', message, HttpStatus.BAD_REQUEST),
  invalidPhone: (field = 'mobile') =>
    ownerError(
      'INVALID_PHONE',
      `${field} must be a valid 10-digit Indian mobile number`,
      HttpStatus.BAD_REQUEST,
    ),
  invalidGstin: () =>
    ownerError(
      'INVALID_GSTIN',
      'gstNumber must be a valid 15-character GSTIN',
      HttpStatus.BAD_REQUEST,
    ),
  nothingToUpdate: () =>
    ownerError('NOTHING_TO_UPDATE', 'No editable fields were supplied', HttpStatus.BAD_REQUEST),

  // ---------- Profile ----------
  emailNotEditable: () =>
    ownerError(
      'EMAIL_NOT_EDITABLE',
      'Your email address identifies your account at sign-in and cannot be changed here. Contact Tavelo support to update it.',
      HttpStatus.BAD_REQUEST,
    ),

  // ---------- Subscription ----------
  subscriptionNotFound: () =>
    ownerError(
      'SUBSCRIPTION_NOT_FOUND',
      'No subscription is on file for this account',
      HttpStatus.NOT_FOUND,
    ),

  // ---------- Support ----------
  ticketNotFound: () =>
    ownerError('TICKET_NOT_FOUND', 'Support ticket not found', HttpStatus.NOT_FOUND),

  // ---------- Sessions ----------
  sessionNotFound: () => ownerError('SESSION_NOT_FOUND', 'Session not found', HttpStatus.NOT_FOUND),

  // ---------- TOTP MFA ----------
  mfaNotConfigured: () =>
    ownerError(
      'MFA_NOT_CONFIGURED',
      'Two-factor authentication is not available on this deployment (no encryption key is configured). Contact your platform operator.',
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
  mfaNotEnrolled: () =>
    ownerError('MFA_NOT_ENROLLED', 'Start enrolment before verifying a code', HttpStatus.BAD_REQUEST),
  mfaAlreadyEnabled: () =>
    ownerError(
      'MFA_ALREADY_ENABLED',
      'Two-factor authentication is already enabled',
      HttpStatus.CONFLICT,
    ),
  mfaNotEnabled: () =>
    ownerError('MFA_NOT_ENABLED', 'Two-factor authentication is not enabled', HttpStatus.BAD_REQUEST),
  mfaInvalidCode: () =>
    ownerError('MFA_INVALID_CODE', 'Invalid or expired code', HttpStatus.UNAUTHORIZED),
  mfaChallengeInvalid: () =>
    ownerError(
      'MFA_CHALLENGE_INVALID',
      'This sign-in attempt has expired. Start again.',
      HttpStatus.UNAUTHORIZED,
    ),
  mfaLocked: (seconds: number) =>
    ownerError(
      'MFA_LOCKED',
      `Too many incorrect codes. Try again in ${Math.ceil(seconds / 60)} minute(s).`,
      HttpStatus.TOO_MANY_REQUESTS,
    ),
};
