import type { TransportStatus, DriverStage } from '../../database/schema';
import { TransportErrors } from './transport-errors';

/**
 * The correctness core shared by the Travel Desk and the Driver: two coupled
 * state machines kept PURE and testable.
 *
 * The DESK owns the request status:
 *   REQUESTED → ASSIGNED → IN_PROGRESS → COMPLETED
 * with CANCELLED reachable from any non-terminal state, and ASSIGNED → REQUESTED
 * to hand a trip back (unassign). COMPLETED and CANCELLED are terminal.
 *
 * The DRIVER owns the finer progress WHILE the request is IN_PROGRESS. It is a
 * separate machine so the desk's status stays coarse and reportable while the
 * driver ticks through the doorstep steps.
 */
export const TRANSPORT_TRANSITIONS: Readonly<Record<TransportStatus, readonly TransportStatus[]>> =
  {
    REQUESTED: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['IN_PROGRESS', 'REQUESTED', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };

export function canTransitionTransport(from: TransportStatus, to: TransportStatus): boolean {
  return TRANSPORT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransportTransition(from: TransportStatus, to: TransportStatus): void {
  if (!canTransitionTransport(from, to)) throw TransportErrors.invalidTransportTransition(from, to);
}

// ---------- Driver stage machine (within IN_PROGRESS) ----------

/**
 * The driver's steps once they pick a trip up. `null` is the pre-accept state on
 * a merely ASSIGNED request. Accepting sets ACCEPTED; the driver then walks
 * ACCEPTED → EN_ROUTE → ARRIVED → PICKED_UP, and completing the trip closes it.
 */
export const DRIVER_STAGE_TRANSITIONS: Readonly<Record<DriverStage, readonly DriverStage[]>> = {
  ACCEPTED: ['EN_ROUTE'],
  EN_ROUTE: ['ARRIVED'],
  ARRIVED: ['PICKED_UP'],
  PICKED_UP: [],
};

export function canTransitionDriverStage(from: DriverStage | null, to: DriverStage): boolean {
  // Accepting is the only move out of the pre-accept (null) state.
  if (from === null) return to === 'ACCEPTED';
  return DRIVER_STAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertDriverStage(from: DriverStage | null, to: DriverStage): void {
  if (!canTransitionDriverStage(from, to))
    throw TransportErrors.invalidDriverStep(from ?? 'ASSIGNED', to);
}

/**
 * The driver actions, mapped to the two machines. The service reads this to know
 * what a step does; the machines above prove each step is legal.
 *
 *   accept    — request ASSIGNED → IN_PROGRESS,   stage null → ACCEPTED
 *   onTheWay  — stage ACCEPTED → EN_ROUTE
 *   arrived   — stage EN_ROUTE → ARRIVED
 *   pickedUp  — stage ARRIVED → PICKED_UP
 *   complete  — request IN_PROGRESS → COMPLETED   (requires stage PICKED_UP)
 */
export const driverStepValues = ['accept', 'onTheWay', 'arrived', 'pickedUp', 'complete'] as const;
export type DriverStep = (typeof driverStepValues)[number];

/** The driver-stage a step targets, or null for `complete` (a status move). */
export function driverStepStage(step: DriverStep): DriverStage | null {
  switch (step) {
    case 'accept':
      return 'ACCEPTED';
    case 'onTheWay':
      return 'EN_ROUTE';
    case 'arrived':
      return 'ARRIVED';
    case 'pickedUp':
      return 'PICKED_UP';
    case 'complete':
      return null;
  }
}
