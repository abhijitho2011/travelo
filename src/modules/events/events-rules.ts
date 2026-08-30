import type { EventStatus } from '../../database/schema';
import { EventErrors } from './events-errors';

/**
 * The correctness core of the events module, kept PURE and in ONE file: the
 * event lifecycle state machine. It takes plain values and touches no database
 * or clock, so it is cheap to test exhaustively.
 */

/**
 * ENQUIRY → CONFIRMED → IN_PROGRESS → COMPLETED is the happy path; every live
 * state can still be CANCELLED. Terminal states (COMPLETED, CANCELLED) have no
 * outgoing edges — a finished or called-off function is history.
 */
export const EVENT_TRANSITIONS: Readonly<Record<EventStatus, readonly EventStatus[]>> = {
  ENQUIRY: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionEvent(from: EventStatus, to: EventStatus): boolean {
  return EVENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertEventTransition(from: EventStatus, to: EventStatus): void {
  if (!canTransitionEvent(from, to)) throw EventErrors.invalidTransition(from, to);
}

/** Events the dashboard treats as upcoming: confirmed or already running. */
export const ACTIVE_EVENT_STATUSES: readonly EventStatus[] = ['CONFIRMED', 'IN_PROGRESS'];
