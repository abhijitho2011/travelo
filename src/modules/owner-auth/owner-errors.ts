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
};
