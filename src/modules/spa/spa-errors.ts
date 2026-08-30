import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the spa surface. `error` is surfaced verbatim by the global
 * AllExceptionsFilter as `error.code`, so these strings are the contract the
 * staff app branches on — same rule as `RestaurantErrors`.
 */
export function spaError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const SpaErrors = {
  // --- not found: a foreign id looks exactly like a missing one (404, never 403) ---
  serviceNotFound: () =>
    spaError('SPA_SERVICE_NOT_FOUND', 'Spa service not found', HttpStatus.NOT_FOUND),
  appointmentNotFound: () =>
    spaError('SPA_APPOINTMENT_NOT_FOUND', 'Spa appointment not found', HttpStatus.NOT_FOUND),
  billNotFound: () => spaError('SPA_BILL_NOT_FOUND', 'Spa bill not found', HttpStatus.NOT_FOUND),
  therapistNotFound: () =>
    spaError(
      'SPA_THERAPIST_NOT_FOUND',
      'That therapist is not on this property',
      HttpStatus.NOT_FOUND,
    ),

  // --- conflicts ---
  duplicateName: () =>
    spaError('SPA_DUPLICATE_NAME', 'A service with that name already exists', HttpStatus.CONFLICT),

  serviceArchived: (name: string) =>
    spaError(
      'SPA_SERVICE_ARCHIVED',
      `${name} is archived and cannot be booked`,
      HttpStatus.CONFLICT,
    ),

  invalidAppointmentTransition: (from: string, to: string) =>
    spaError(
      'INVALID_APPOINTMENT_TRANSITION',
      `An appointment cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),

  invalidBillTransition: (from: string, to: string) =>
    spaError(
      'INVALID_BILL_TRANSITION',
      `A bill cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),

  /** A bill is raised only for a COMPLETED appointment. */
  notBillable: () =>
    spaError(
      'SPA_APPOINTMENT_NOT_BILLABLE',
      'Only a completed appointment can be billed',
      HttpStatus.CONFLICT,
    ),

  billExists: () =>
    spaError('SPA_BILL_EXISTS', 'This appointment already has a bill', HttpStatus.CONFLICT),

  billNotUnpaid: () =>
    spaError('SPA_BILL_NOT_UNPAID', 'This bill is not awaiting settlement', HttpStatus.CONFLICT),

  billNotPaid: () =>
    spaError('SPA_BILL_NOT_PAID', 'Only a paid bill can be refunded', HttpStatus.CONFLICT),

  // --- ROOM_CHARGE ---
  reservationRequired: () =>
    spaError(
      'RESERVATION_REQUIRED',
      'A room charge requires a reservation to bill it to',
      HttpStatus.BAD_REQUEST,
    ),

  reservationNotInHouse: () =>
    spaError(
      'RESERVATION_NOT_IN_HOUSE',
      'A room charge needs a checked-in reservation at this property',
      HttpStatus.CONFLICT,
    ),
};
