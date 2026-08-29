import {
  addDays,
  assertDateOrder,
  assertTransition,
  canTransition,
  coversDate,
  formatReservationNumber,
  monthBounds,
  nightsBetween,
  overlaps,
  RESERVATION_TRANSITIONS,
  today,
  totalPaise,
} from './reservation-rules';
import type { ReservationStatus } from '../../database/schema';

/**
 * The correctness core. Everything here is pure, so it is tested exhaustively
 * rather than sampled — these are the rules a hotel loses money on.
 */

describe('overlaps — the double-booking rule', () => {
  const stay = (checkIn: string, checkOut: string) => ({ checkIn, checkOut });

  it('two stays sharing a night overlap', () => {
    expect(overlaps(stay('2026-03-10', '2026-03-14'), stay('2026-03-13', '2026-03-16'))).toBe(true);
  });

  it('a stay entirely inside another overlaps', () => {
    expect(overlaps(stay('2026-03-10', '2026-03-20'), stay('2026-03-12', '2026-03-14'))).toBe(true);
  });

  it('a one-night stay on the same night as another overlaps', () => {
    expect(overlaps(stay('2026-03-10', '2026-03-11'), stay('2026-03-10', '2026-03-11'))).toBe(true);
  });

  /**
   * THE boundary. check_out is EXCLUSIVE: the departing guest is out on the
   * morning the arriving guest walks in, and hotels sell that room twice on
   * purpose. A `<=` anywhere in the overlap rule refuses this, which would
   * silently cost a busy hotel a large share of its bookings — this is the
   * classic bug in this exact function, so it is asserted from both sides.
   */
  it('same-day turnover is NOT an overlap — departure day equals arrival day', () => {
    const leaving = stay('2026-03-10', '2026-03-15');
    const arriving = stay('2026-03-15', '2026-03-18');
    expect(overlaps(leaving, arriving)).toBe(false);
    expect(overlaps(arriving, leaving)).toBe(false);
  });

  it('stays separated by a night do not overlap', () => {
    expect(overlaps(stay('2026-03-10', '2026-03-12'), stay('2026-03-13', '2026-03-15'))).toBe(
      false,
    );
  });

  it('is symmetric for every pair', () => {
    const dates = ['2026-03-10', '2026-03-12', '2026-03-15', '2026-03-18'];
    for (const a1 of dates) {
      for (const a2 of dates) {
        if (a2 <= a1) continue;
        for (const b1 of dates) {
          for (const b2 of dates) {
            if (b2 <= b1) continue;
            expect(overlaps(stay(a1, a2), stay(b1, b2))).toBe(overlaps(stay(b1, b2), stay(a1, a2)));
          }
        }
      }
    }
  });
});

describe('date maths', () => {
  it('counts nights with an exclusive check-out', () => {
    expect(nightsBetween('2026-03-14', '2026-03-15')).toBe(1);
    expect(nightsBetween('2026-03-14', '2026-03-17')).toBe(3);
    expect(nightsBetween('2026-02-27', '2026-03-02')).toBe(3);
  });

  // A zero-length stay is still a night the hotel sells; multiplying the rate
  // by zero would silently report the booking as free.
  it('floors a same-day stay at one night', () => {
    expect(nightsBetween('2026-03-14', '2026-03-14')).toBe(1);
  });

  it('crosses a DST boundary without losing or gaining a night', () => {
    // India has no DST, but the arithmetic runs in UTC precisely so a server
    // in a zone that does cannot shift a hotel's night.
    expect(nightsBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(nightsBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('multiplies the rate by the nights, not by the days on the calendar', () => {
    expect(totalPaise(450_000, '2026-03-14', '2026-03-17')).toBe(1_350_000);
    expect(totalPaise(450_000, '2026-03-14', '2026-03-15')).toBe(450_000);
  });

  it('adds days across a month end', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('bounds a month with an exclusive end', () => {
    expect(monthBounds('2026-03-17')).toEqual({ start: '2026-03-01', end: '2026-04-01' });
    expect(monthBounds('2026-12-31')).toEqual({ start: '2026-12-01', end: '2027-01-01' });
  });

  it('reads today off the clock it is handed', () => {
    expect(today(new Date('2026-03-14T22:30:00.000Z'))).toBe('2026-03-14');
  });

  it('covers the nights of a stay but not the departure day', () => {
    const stay = { checkIn: '2026-03-14', checkOut: '2026-03-17' };
    expect(coversDate(stay, '2026-03-14')).toBe(true);
    expect(coversDate(stay, '2026-03-16')).toBe(true);
    expect(coversDate(stay, '2026-03-17')).toBe(false);
    expect(coversDate(stay, '2026-03-13')).toBe(false);
  });

  it('refuses a check-out that is not after the check-in', () => {
    expect(() => assertDateOrder('2026-03-14', '2026-03-14')).toThrow(
      expect.objectContaining({
        response: { message: expect.any(String), error: 'INVALID_DATES' },
      }),
    );
    expect(() => assertDateOrder('2026-03-14', '2026-03-13')).toThrow();
    expect(() => assertDateOrder('14/03/2026', '2026-03-15')).toThrow();
    expect(() => assertDateOrder('2026-03-14', '2026-03-15')).not.toThrow();
  });
});

describe('the transition map', () => {
  const all: ReservationStatus[] = [
    'PENDING',
    'CONFIRMED',
    'CHECKED_IN',
    'CHECKED_OUT',
    'CANCELLED',
    'NO_SHOW',
  ];

  it('allows exactly the front-office path', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransition('CONFIRMED', 'CHECKED_IN')).toBe(true);
    expect(canTransition('CHECKED_IN', 'CHECKED_OUT')).toBe(true);
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'NO_SHOW')).toBe(true);
  });

  it('never lets a booking skip confirmation', () => {
    expect(canTransition('PENDING', 'CHECKED_IN')).toBe(false);
    expect(canTransition('PENDING', 'CHECKED_OUT')).toBe(false);
    expect(canTransition('PENDING', 'NO_SHOW')).toBe(false);
  });

  it('never lets a guest who is in the building be cancelled or no-showed', () => {
    expect(canTransition('CHECKED_IN', 'CANCELLED')).toBe(false);
    expect(canTransition('CHECKED_IN', 'NO_SHOW')).toBe(false);
  });

  /**
   * Terminal really is terminal. Reversing a check-out or un-cancelling a
   * booking rewrites history that occupancy and revenue have already been
   * reported against; the desk raises a NEW reservation instead.
   */
  it('has no way out of a terminal state', () => {
    for (const from of ['CHECKED_OUT', 'CANCELLED', 'NO_SHOW'] as ReservationStatus[]) {
      expect(RESERVATION_TRANSITIONS[from]).toEqual([]);
      for (const to of all) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it('never allows a status to transition to itself', () => {
    for (const s of all) expect(canTransition(s, s)).toBe(false);
  });

  it('refuses an illegal move with INVALID_TRANSITION rather than a raw error', () => {
    expect(() => assertTransition('CHECKED_OUT', 'CHECKED_IN')).toThrow(
      expect.objectContaining({
        status: 409,
        response: expect.objectContaining({ error: 'INVALID_TRANSITION' }),
      }),
    );
    expect(() => assertTransition('CONFIRMED', 'CHECKED_IN')).not.toThrow();
  });
});

describe('reservation numbers', () => {
  it('pads to the RSV-XXXXXX shape a clerk can read over the phone', () => {
    expect(formatReservationNumber(1)).toBe('RSV-000001');
    expect(formatReservationNumber(42)).toBe('RSV-000042');
    expect(formatReservationNumber(987_654)).toBe('RSV-987654');
  });

  it('wraps rather than widening past six digits', () => {
    expect(formatReservationNumber(1_000_001)).toBe('RSV-000001');
  });
});
