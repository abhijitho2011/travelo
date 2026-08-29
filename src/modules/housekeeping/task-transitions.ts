import type { HousekeepingTaskStatus, RoomStatus } from '../../database/schema';
import { HousekeepingErrors } from './housekeeping-errors';

/**
 * The correctness core of the housekeeping loop, kept PURE and in ONE file.
 *
 * Nothing here touches a database or a clock. The transition map is the single
 * answer to "can this status change happen", and every mutation in the service
 * goes through `assertTaskTransition`, so there is exactly one place the loop
 * is defined and exactly one place to change it.
 *
 *   PENDING → IN_PROGRESS → COMPLETED → INSPECTED   (pass)
 *                              COMPLETED → REJECTED  (fail)
 *
 * INSPECTED and REJECTED are terminal. A failed inspection does not reopen the
 * rejected task — the service raises a FRESH PENDING task pointing back at it,
 * so the audit trail keeps both the failure and the redo.
 */
export const HOUSEKEEPING_TASK_TRANSITIONS: Readonly<
  Record<HousekeepingTaskStatus, readonly HousekeepingTaskStatus[]>
> = {
  PENDING: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: ['INSPECTED', 'REJECTED'],
  INSPECTED: [],
  REJECTED: [],
};

export function canTaskTransition(
  from: HousekeepingTaskStatus,
  to: HousekeepingTaskStatus,
): boolean {
  return HOUSEKEEPING_TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTaskTransition(
  from: HousekeepingTaskStatus,
  to: HousekeepingTaskStatus,
): void {
  if (!canTaskTransition(from, to)) throw HousekeepingErrors.invalidTaskTransition(from, to);
}

/**
 * How a ROOM task's status drives the room it names. AREA tasks touch no room,
 * so this is only consulted for room tasks.
 *
 *   start    → CLEANING   (someone is in the room working)
 *   complete → INSPECTED  (waiting for the supervisor's eye)
 *   inspect pass → READY  (sellable again)
 *   inspect fail → DIRTY  (back to the start of the loop)
 *
 * Kept beside the task map so the two never drift.
 */
export const ROOM_STATUS_FOR_TASK: Readonly<Record<string, RoomStatus>> = {
  START: 'CLEANING',
  COMPLETE: 'INSPECTED',
  INSPECT_PASS: 'READY',
  INSPECT_FAIL: 'DIRTY',
};
