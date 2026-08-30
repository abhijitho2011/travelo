import type { IncidentStatus, SecurityShiftStatus } from '../../database/schema';
import { SecurityErrors } from './security-errors';

/**
 * The correctness core of the security module, kept PURE and in ONE file: the
 * two state machines (incident status, shift status). They take plain values and
 * touch no database or clock, so they are cheap to test exhaustively.
 */

// ---------- Incident state machine ----------

/**
 * OPEN → ASSIGNED → RESOLVED is the worked path; OPEN → RESOLVED lets a manager
 * close a trivial report without assigning it first. RESOLVED is terminal — a
 * reopened incident is a new report, so revenue-of-attention is never rewritten.
 */
export const INCIDENT_TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  OPEN: ['ASSIGNED', 'RESOLVED'],
  ASSIGNED: ['RESOLVED', 'OPEN'],
  RESOLVED: [],
};

export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertIncidentTransition(from: IncidentStatus, to: IncidentStatus): void {
  if (!canTransitionIncident(from, to)) throw SecurityErrors.invalidIncidentTransition(from, to);
}

// ---------- Shift state machine ----------

/**
 * SCHEDULED → ACTIVE → ENDED is the roster's day; SCHEDULED → ENDED cancels a
 * shift that never started. ENDED is terminal.
 */
export const SHIFT_TRANSITIONS: Readonly<
  Record<SecurityShiftStatus, readonly SecurityShiftStatus[]>
> = {
  SCHEDULED: ['ACTIVE', 'ENDED'],
  ACTIVE: ['ENDED'],
  ENDED: [],
};

export function canTransitionShift(from: SecurityShiftStatus, to: SecurityShiftStatus): boolean {
  return SHIFT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertShiftTransition(from: SecurityShiftStatus, to: SecurityShiftStatus): void {
  if (!canTransitionShift(from, to)) throw SecurityErrors.invalidShiftTransition(from, to);
}

/** Incidents the manager dashboard still cares about: everything not resolved. */
export const OPEN_INCIDENT_STATUSES: readonly IncidentStatus[] = ['OPEN', 'ASSIGNED'];
