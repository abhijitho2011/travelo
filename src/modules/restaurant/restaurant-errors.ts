import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the restaurant surface. `error` is surfaced verbatim by the
 * global AllExceptionsFilter as `error.code`, so these strings are the contract
 * the staff app branches on — same rule as `RoomErrors` and `ReservationErrors`.
 */
export function restaurantError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const RestaurantErrors = {
  // --- not found: a foreign id looks exactly like a missing one (404, never 403) ---
  tableNotFound: () => restaurantError('TABLE_NOT_FOUND', 'Table not found', HttpStatus.NOT_FOUND),
  categoryNotFound: () =>
    restaurantError('MENU_CATEGORY_NOT_FOUND', 'Menu category not found', HttpStatus.NOT_FOUND),
  menuItemNotFound: () =>
    restaurantError('MENU_ITEM_NOT_FOUND', 'Menu item not found', HttpStatus.NOT_FOUND),
  orderNotFound: () => restaurantError('ORDER_NOT_FOUND', 'Order not found', HttpStatus.NOT_FOUND),
  orderItemNotFound: () =>
    restaurantError('ORDER_ITEM_NOT_FOUND', 'Order item not found', HttpStatus.NOT_FOUND),

  // --- conflicts ---
  duplicateName: (what: string) =>
    restaurantError(
      'DUPLICATE_NAME',
      `A ${what} with that name already exists`,
      HttpStatus.CONFLICT,
    ),

  /** One OPEN order per table — the headline table rule. */
  tableOccupied: (name?: string) =>
    restaurantError(
      'TABLE_OCCUPIED',
      name ? `Table ${name} already has an open order` : 'That table already has an open order',
      HttpStatus.CONFLICT,
    ),

  tableUnavailable: (name: string, status: string) =>
    restaurantError(
      'TABLE_UNAVAILABLE',
      `Table ${name} is ${status.toLowerCase()} and cannot take an order`,
      HttpStatus.CONFLICT,
    ),

  invalidOrderTransition: (from: string, to: string) =>
    restaurantError(
      'INVALID_ORDER_TRANSITION',
      `An order cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),

  invalidKotTransition: (from: string, to: string) =>
    restaurantError(
      'INVALID_KOT_TRANSITION',
      `A kitchen ticket cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),

  /** The caller's role may not make this KOT move (chef vs waiter split). */
  kotNotPermittedForRole: (to: string) =>
    restaurantError(
      'KOT_NOT_PERMITTED_FOR_ROLE',
      `Your role cannot mark an item ${to}`,
      HttpStatus.FORBIDDEN,
    ),

  /** Item cancel is a NEW-only move; anything cooked needs a manager void. */
  itemCancelTooLate: () =>
    restaurantError(
      'ITEM_CANCEL_TOO_LATE',
      'This item is already being prepared; a manager must void it',
      HttpStatus.CONFLICT,
    ),

  orderNotOpen: () =>
    restaurantError(
      'ORDER_NOT_OPEN',
      'This order is no longer open for changes',
      HttpStatus.CONFLICT,
    ),

  orderNotBilled: () =>
    restaurantError('ORDER_NOT_BILLED', 'This order has not been billed yet', HttpStatus.CONFLICT),

  emptyBill: () =>
    restaurantError(
      'EMPTY_BILL',
      'An order with no active items cannot be billed',
      HttpStatus.CONFLICT,
    ),

  /** Cancel is refused once anything has been served. */
  orderHasServedItems: () =>
    restaurantError(
      'ORDER_HAS_SERVED_ITEMS',
      'This order has served items and cannot be cancelled — bill it instead',
      HttpStatus.CONFLICT,
    ),

  itemUnavailable: (name: string) =>
    restaurantError(
      'MENU_ITEM_UNAVAILABLE',
      `${name} is not available right now`,
      HttpStatus.CONFLICT,
    ),

  // --- ROOM_CHARGE ---
  /** A room charge needs an in-house guest at THIS property to land on. */
  reservationNotInHouse: () =>
    restaurantError(
      'RESERVATION_NOT_IN_HOUSE',
      'A room charge needs a checked-in reservation at this property',
      HttpStatus.CONFLICT,
    ),

  reservationRequired: () =>
    restaurantError(
      'RESERVATION_REQUIRED',
      'A room charge requires a reservation to bill it to',
      HttpStatus.BAD_REQUEST,
    ),
};
