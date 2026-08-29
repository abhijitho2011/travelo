import type { ReservationStatus } from '../../database/schema';
import { ReservationErrors } from './reservation-errors';

/**
 * The correctness core of the booking engine, kept PURE and in ONE file.
 *
 * Nothing here touches a database or a clock it did not receive. That is
 * deliberate: the overlap rule and the transition map are the two things that
 * must never quietly change, and both are cheap to test exhaustively only if
 * they can be called with plain values.
 */

// ---------- Dates ----------

/**
 * Dates travel as `YYYY-MM-DD` everywhere in this module — the wire format, the
 * `date` column and the comparisons all agree, so a string compare IS a date
 * compare and no timezone can shift a hotel's night by one.
 */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

/** UTC midnight for a `YYYY-MM-DD`. UTC, so DST can never eat a night. */
function utc(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

const DAY_MS = 86_400_000;

/** Today as `YYYY-MM-DD`. Takes the clock so tests can pin it. */
export function today(now: Date = new Date()): IsoDate {
  return now.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** First day of `date`'s month, and the first day of the NEXT month (exclusive). */
export function monthBounds(date: IsoDate): { start: IsoDate; end: IsoDate } {
  const start = `${date.slice(0, 7)}-01`;
  const d = new Date(utc(start));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
  return { start, end };
}

/**
 * Nights in a stay. check_out is EXCLUSIVE, so 14th→15th is ONE night.
 *
 * Floored at 1: a same-day booking is still a night the hotel sells, and a rate
 * multiplied by zero would silently zero the revenue for it.
 */
export function nightsBetween(checkIn: IsoDate, checkOut: IsoDate): number {
  return Math.max(1, Math.round((utc(checkOut) - utc(checkIn)) / DAY_MS));
}

/**
 * THE overlap rule, in one place.
 *
 *     a.checkIn < b.checkOut  AND  b.checkIn < a.checkOut
 *
 * Both comparisons are STRICT, which is what makes same-day turnover legal:
 * a stay ending on the 15th and a stay starting on the 15th do NOT overlap,
 * because the departing guest is out before the arriving one is in. Using `<=`
 * on either side would refuse a large share of the bookings a busy hotel takes,
 * and is the classic bug in this exact function.
 */
export function overlaps(
  a: { checkIn: IsoDate; checkOut: IsoDate },
  b: { checkIn: IsoDate; checkOut: IsoDate },
): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

/** `date` falls inside [checkIn, checkOut) — the nights the guest is in-house. */
export function coversDate(stay: { checkIn: IsoDate; checkOut: IsoDate }, date: IsoDate): boolean {
  return stay.checkIn <= date && date < stay.checkOut;
}

/** rate x nights. Kept next to `nightsBetween` so the two never disagree. */
export function totalPaise(ratePaise: number, checkIn: IsoDate, checkOut: IsoDate): number {
  return ratePaise * nightsBetween(checkIn, checkOut);
}

export function assertDateOrder(checkIn: IsoDate, checkOut: IsoDate): void {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) {
    throw ReservationErrors.invalidDates();
  }
}

// ---------- Transitions ----------

/**
 * The ONE transition map. Every status change in the service goes through
 * `assertTransition`, so there is a single answer to "can this happen" and a
 * single place to change it.
 *
 * Terminal states (CHECKED_OUT, CANCELLED, NO_SHOW) have no outgoing edges on
 * purpose: reversing a check-out or un-cancelling a booking rewrites history
 * that money and occupancy have already been reported against. The desk makes a
 * NEW reservation instead.
 */
export const RESERVATION_TRANSITIONS: Readonly<
  Record<ReservationStatus, readonly ReservationStatus[]>
> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  // NO_SHOW only from CONFIRMED: a guest who never arrived must have had a
  // committed booking to fail to arrive against.
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return RESERVATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!canTransition(from, to)) throw ReservationErrors.invalidTransition(from, to);
}

/**
 * Room statuses a room may be in and still take an arriving guest. DIRTY,
 * CLEANING, OCCUPIED, MAINTENANCE and OUT_OF_ORDER are all refusals — the first
 * three because someone or something is still in the room, the last two because
 * the room is off the board.
 */
export const ASSIGNABLE_ROOM_STATUSES = ['AVAILABLE', 'READY', 'INSPECTED'] as const;

/**
 * `RSV-XXXXXX`, six digits. Per property, so the desk quotes a short number
 * over the phone rather than a uuid.
 */
export function formatReservationNumber(sequence: number): string {
  return `RSV-${String(sequence % 1_000_000).padStart(6, '0')}`;
}
