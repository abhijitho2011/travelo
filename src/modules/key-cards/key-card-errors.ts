import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the key-card surface. `error` is surfaced verbatim by the
 * global AllExceptionsFilter as `error.code` — the strings the staff app
 * branches on, same rule as `ReservationErrors`.
 */
function keyCardError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const KeyCardErrors = {
  /** Missing card OR another property's card — indistinguishable on purpose. */
  notFound: () => keyCardError('KEYCARD_NOT_FOUND', 'Key card not found', HttpStatus.NOT_FOUND),

  /** Same 404-over-403 rule as the reservations surface. */
  reservationNotFound: () =>
    keyCardError('RESERVATION_NOT_FOUND', 'Reservation not found', HttpStatus.NOT_FOUND),

  /** Cards are only cut for committed or in-house stays. */
  reservationNotEligible: (status: string) =>
    keyCardError(
      'KEYCARD_RESERVATION_NOT_ELIGIBLE',
      `Key cards can only be issued for CONFIRMED or CHECKED_IN reservations (this one is ${status})`,
      HttpStatus.CONFLICT,
    ),

  /** Deactivating or replacing needs a card that is still stored ACTIVE. */
  notActive: () =>
    keyCardError('KEYCARD_NOT_ACTIVE', 'That key card is no longer active', HttpStatus.CONFLICT),

  /** The numbering retry loop gave up — should effectively never happen. */
  numberExhausted: () =>
    keyCardError(
      'KEYCARD_NUMBER_CONFLICT',
      'Could not allocate a card number, please retry',
      HttpStatus.CONFLICT,
    ),
};
