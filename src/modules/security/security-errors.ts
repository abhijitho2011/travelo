import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the security surface. `error` is surfaced verbatim by the
 * global AllExceptionsFilter as `error.code` — the contract the staff app
 * branches on, same rule as the other modules.
 */
export function securityError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const SecurityErrors = {
  visitorNotFound: () =>
    securityError('VISITOR_NOT_FOUND', 'Visitor not found', HttpStatus.NOT_FOUND),
  incidentNotFound: () =>
    securityError('INCIDENT_NOT_FOUND', 'Incident not found', HttpStatus.NOT_FOUND),
  lostFoundNotFound: () =>
    securityError('LOST_FOUND_NOT_FOUND', 'Lost & found item not found', HttpStatus.NOT_FOUND),
  shiftNotFound: () => securityError('SHIFT_NOT_FOUND', 'Shift not found', HttpStatus.NOT_FOUND),
  staffNotFound: () =>
    securityError(
      'SECURITY_STAFF_NOT_FOUND',
      'That staff member is not on this property',
      HttpStatus.NOT_FOUND,
    ),

  visitorAlreadyDeparted: () =>
    securityError(
      'VISITOR_ALREADY_DEPARTED',
      'This visitor has already been checked out',
      HttpStatus.CONFLICT,
    ),

  invalidIncidentTransition: (from: string, to: string) =>
    securityError(
      'INVALID_INCIDENT_TRANSITION',
      `An incident cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),

  invalidShiftTransition: (from: string, to: string) =>
    securityError(
      'INVALID_SHIFT_TRANSITION',
      `A shift cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),
};
