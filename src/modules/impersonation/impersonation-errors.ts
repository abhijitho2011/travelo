import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for impersonated requests. The `error` field is surfaced
 * verbatim as the envelope `code` by AllExceptionsFilter.
 */
export function impersonationError(
  code: string,
  message: string,
  status: HttpStatus,
): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const ImpersonationErrors = {
  /**
   * The token verified, but the row behind it is no longer ACTIVE. Terminating
   * a session has to bite on the very next request, so this is checked against
   * the database every time rather than trusted from the token.
   */
  sessionEnded: () =>
    impersonationError(
      'IMPERSONATION_SESSION_ENDED',
      'This support session has ended. Ask Tavelo support to start a new one.',
      HttpStatus.UNAUTHORIZED,
    ),
  /** Token audience/target does not match the app it was presented to. */
  wrongTarget: () =>
    impersonationError(
      'IMPERSONATION_WRONG_TARGET',
      'This support session is not for this account',
      HttpStatus.UNAUTHORIZED,
    ),
  /**
   * See READ_ONLY_RATIONALE in impersonation-access.service.ts — support
   * diagnoses, it never acts as the customer.
   */
  readOnly: () =>
    impersonationError(
      'IMPERSONATION_READ_ONLY',
      'Support sessions are read-only. Ask the account owner to make this change.',
      HttpStatus.FORBIDDEN,
    ),
};
