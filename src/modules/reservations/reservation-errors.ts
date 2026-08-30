import { HttpException, HttpStatus } from '@nestjs/common';
import type { ReservationStatus } from '../../database/schema';

/**
 * Domain errors for the reservations surface. `error` is surfaced verbatim by
 * the global AllExceptionsFilter as `error.code`, so these strings are the
 * contract the staff app branches on — same rule as `RoomErrors`.
 */
export function reservationError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const ReservationErrors = {
  /**
   * Returned both for a reservation that does not exist AND for one belonging
   * to ANOTHER property. A 403 would confirm the row is real and leak which
   * hotel the guest is staying at.
   */
  notFound: () =>
    reservationError('RESERVATION_NOT_FOUND', 'Reservation not found', HttpStatus.NOT_FOUND),
  roomNotFound: () => reservationError('ROOM_NOT_FOUND', 'Room not found', HttpStatus.NOT_FOUND),
  roomTypeNotFound: () =>
    reservationError('ROOM_TYPE_NOT_FOUND', 'Room type not found', HttpStatus.NOT_FOUND),

  /** The double-booking refusal. The one error this whole module exists for. */
  roomUnavailable: (number?: string) =>
    reservationError(
      'ROOM_UNAVAILABLE',
      number
        ? `Room ${number} is already booked for part of those dates`
        : 'That room is already booked for part of those dates',
      HttpStatus.CONFLICT,
    ),

  /** Every room of the type is spoken for on at least one night of the stay. */
  noAvailability: (date?: string) =>
    reservationError(
      'NO_AVAILABILITY',
      date
        ? `No rooms of that type are free on ${date}`
        : 'No rooms of that type are free for those dates',
      HttpStatus.CONFLICT,
    ),

  /**
   * The checkout gate. A guest cannot depart owing money unless a staff member
   * explicitly overrides with `allowOutstanding`. The balance rides on the
   * message so the desk sees exactly what is due.
   */
  balanceOutstanding: (balancePaise: number) =>
    reservationError(
      'BALANCE_OUTSTANDING',
      `Cannot check out: ₹${(balancePaise / 100).toFixed(2)} is still outstanding on the folio. ` +
        'Collect it, or check out with an explicit outstanding-balance override.',
      HttpStatus.CONFLICT,
    ),

  /** A room whose housekeeping state makes it unusable right now. */
  roomNotReady: (number: string, status: string) =>
    reservationError(
      'ROOM_NOT_READY',
      `Room ${number} is ${status.toLowerCase().replace(/_/g, ' ')} and cannot take a guest`,
      HttpStatus.CONFLICT,
    ),

  /** The room is of a different type than the reservation was sold as. */
  roomTypeMismatch: () =>
    reservationError(
      'ROOM_TYPE_MISMATCH',
      'That room is not of the type this reservation was booked for',
      HttpStatus.CONFLICT,
    ),

  /** The single refusal produced by the central `canTransition` map. */
  invalidTransition: (from: ReservationStatus, to: ReservationStatus) =>
    reservationError(
      'INVALID_TRANSITION',
      `A ${from.toLowerCase().replace(/_/g, ' ')} reservation cannot become ${to
        .toLowerCase()
        .replace(/_/g, ' ')}`,
      HttpStatus.CONFLICT,
    ),

  /** check_out must be strictly after check_in — a stay is at least one night. */
  invalidDates: () =>
    reservationError(
      'INVALID_DATES',
      'Check-out must be at least one day after check-in',
      HttpStatus.BAD_REQUEST,
    ),

  /** Check-in attempted on a day outside [check_in, check_out). */
  notArrivalDay: () =>
    reservationError(
      'NOT_ARRIVAL_DAY',
      'Today is outside this reservation’s stay dates',
      HttpStatus.CONFLICT,
    ),

  /** No room attached and none supplied — check-in has nothing to occupy. */
  noRoomAssigned: () =>
    reservationError(
      'NO_ROOM_ASSIGNED',
      'Assign a room before checking this guest in',
      HttpStatus.CONFLICT,
    ),

  /** Dates cannot move once the guest is in the building. */
  datesLocked: () =>
    reservationError(
      'DATES_LOCKED',
      'Stay dates can only be changed before check-in',
      HttpStatus.CONFLICT,
    ),

  nothingToUpdate: () =>
    reservationError('NOTHING_TO_UPDATE', 'No fields to update', HttpStatus.BAD_REQUEST),
};
