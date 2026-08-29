import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the alternative super-admin sign-in methods. The `error`
 * field is surfaced verbatim as the envelope `code` by AllExceptionsFilter.
 */
export function adminAuthError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const AdminAuthErrors = {
  /**
   * Deliberately generic: also thrown when the supplied mobile is not the
   * allowlisted one, so a caller can never probe which number is configured.
   */
  invalidOtp: () =>
    adminAuthError('INVALID_OTP', 'Invalid or expired code', HttpStatus.UNAUTHORIZED),
  otpExpired: () => adminAuthError('OTP_EXPIRED', 'The code has expired', HttpStatus.UNAUTHORIZED),
  otpThrottled: () =>
    adminAuthError(
      'OTP_THROTTLED',
      'Too many code requests, try again later',
      HttpStatus.TOO_MANY_REQUESTS,
    ),
  /**
   * Google only. Safe to be specific: the caller has already proved ownership
   * of the Google account, so nothing about the allowlist is disclosed.
   */
  adminNotFound: () =>
    adminAuthError(
      'ADMIN_NOT_FOUND',
      'No administrator account for this identity',
      HttpStatus.FORBIDDEN,
    ),
  accountBlocked: () =>
    adminAuthError('ACCOUNT_BLOCKED', 'Account is blocked', HttpStatus.FORBIDDEN),
  accountSuspended: () =>
    adminAuthError('ACCOUNT_SUSPENDED', 'Account is suspended', HttpStatus.FORBIDDEN),
  // ---------- TOTP MFA ----------
  /** MFA_SECRET_KEY is absent or unusable: refuse to enrol rather than store a plaintext secret. */
  mfaNotConfigured: () =>
    adminAuthError(
      'MFA_NOT_CONFIGURED',
      'Two-factor authentication is not available on this deployment (no encryption key is configured). Contact your platform operator.',
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
  mfaNotEnrolled: () =>
    adminAuthError(
      'MFA_NOT_ENROLLED',
      'Start enrolment before verifying a code',
      HttpStatus.BAD_REQUEST,
    ),
  mfaAlreadyEnabled: () =>
    adminAuthError(
      'MFA_ALREADY_ENABLED',
      'Two-factor authentication is already enabled',
      HttpStatus.CONFLICT,
    ),
  mfaNotEnabled: () =>
    adminAuthError(
      'MFA_NOT_ENABLED',
      'Two-factor authentication is not enabled',
      HttpStatus.BAD_REQUEST,
    ),
  /** Same message for a wrong TOTP and a wrong recovery code — nothing to probe. */
  mfaInvalidCode: () =>
    adminAuthError('MFA_INVALID_CODE', 'Invalid or expired code', HttpStatus.UNAUTHORIZED),
  mfaChallengeInvalid: () =>
    adminAuthError(
      'MFA_CHALLENGE_INVALID',
      'This sign-in attempt has expired. Start again.',
      HttpStatus.UNAUTHORIZED,
    ),
  mfaLocked: (seconds: number) =>
    adminAuthError(
      'MFA_LOCKED',
      `Too many incorrect codes. Try again in ${Math.ceil(seconds / 60)} minute(s).`,
      HttpStatus.TOO_MANY_REQUESTS,
    ),

  googleDisabled: () =>
    adminAuthError(
      'GOOGLE_SIGNIN_DISABLED',
      'Google sign-in is not enabled for this deployment',
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
};
