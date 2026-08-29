import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the rooms surface. `error` is surfaced verbatim by the
 * global AllExceptionsFilter as `error.code`, so these strings are the contract
 * the mobile apps and the admin panel branch on.
 */
export function roomError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const RoomErrors = {
  /**
   * Returned both for a room type that does not exist AND for one that belongs
   * to ANOTHER property. A 403 would confirm the row is real and leak which
   * hotel it sits at, so cross-property reads look exactly like misses — the
   * same rule the staff team endpoints already follow.
   */
  roomTypeNotFound: () =>
    roomError('ROOM_TYPE_NOT_FOUND', 'Room type not found', HttpStatus.NOT_FOUND),
  roomNotFound: () => roomError('ROOM_NOT_FOUND', 'Room not found', HttpStatus.NOT_FOUND),
  propertyNotFound: () => roomError('PROPERTY_NOT_FOUND', 'Hotel not found', HttpStatus.NOT_FOUND),
  amenityNotFound: () => roomError('AMENITY_NOT_FOUND', 'Amenity not found', HttpStatus.NOT_FOUND),

  /** Surfaces the partial unique (property_id, name) as a typed conflict. */
  roomTypeNameTaken: () =>
    roomError(
      'ROOM_TYPE_NAME_TAKEN',
      'Another room type at this hotel already uses that name',
      HttpStatus.CONFLICT,
    ),
  /** Surfaces the partial unique (property_id, number). */
  roomNumberTaken: (number: string) =>
    roomError(
      'ROOM_NUMBER_TAKEN',
      `Room ${number} already exists at this hotel`,
      HttpStatus.CONFLICT,
    ),
  amenityKeyTaken: () =>
    roomError('AMENITY_KEY_TAKEN', 'An amenity with that key already exists', HttpStatus.CONFLICT),

  /**
   * The rooms FK is ON DELETE RESTRICT, so a type with rooms on it cannot be
   * removed. Refusing here with a countable reason beats a raw 23503.
   */
  roomTypeInUse: (count: number) =>
    roomError(
      'ROOM_TYPE_IN_USE',
      `This room type still has ${count} room(s). Move or delete them first.`,
      HttpStatus.CONFLICT,
    ),

  /**
   * An amenity whose scope does not match where it is being attached — a
   * PROPERTY amenity ("Swimming pool") on a room type, or vice versa.
   */
  amenityScopeMismatch: (expected: string) =>
    roomError(
      'AMENITY_SCOPE_MISMATCH',
      `Only ${expected}-scoped amenities can be attached here`,
      HttpStatus.BAD_REQUEST,
    ),

  /**
   * A status outside the eight-state set. Normally unreachable — the DTO's
   * `@IsIn(roomStatusValues)` rejects it first — but kept so a non-HTTP caller
   * gets the same typed refusal rather than a raw constraint error.
   */
  invalidStatus: (status: string) =>
    roomError(
      'INVALID_ROOM_STATUS',
      `${status} is not a valid room status`,
      HttpStatus.BAD_REQUEST,
    ),

  /** A bulk range that would create more rooms than one request may. */
  bulkTooLarge: (asked: number, max: number) =>
    roomError(
      'BULK_TOO_LARGE',
      `That range covers ${asked} rooms; ${max} is the most one request may create.`,
      HttpStatus.BAD_REQUEST,
    ),

  /** A bulk create that resolved to zero new numbers — every one was a dupe. */
  nothingToCreate: () =>
    roomError(
      'NOTHING_TO_CREATE',
      'Every room number in the request already exists',
      HttpStatus.CONFLICT,
    ),

  nothingToUpdate: () =>
    roomError('NOTHING_TO_UPDATE', 'No fields to update', HttpStatus.BAD_REQUEST),
};
