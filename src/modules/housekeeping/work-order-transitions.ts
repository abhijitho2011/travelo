import type { WorkOrderStatus } from '../../database/schema';
import { HousekeepingErrors } from './housekeeping-errors';

/**
 * The work-order state machine, PURE and in ONE file — the twin of
 * `task-transitions.ts`.
 *
 *   OPEN → ACCEPTED → IN_PROGRESS ⇄ PAUSED → COMPLETED
 *   OPEN / ACCEPTED / IN_PROGRESS / PAUSED → CANCELLED
 *
 * COMPLETED and CANCELLED are terminal; a job needing more work is raised as a
 * new order rather than reopened, so a completed order's resolution and parts
 * list stay a true record of what closed it.
 */
export const WORK_ORDER_TRANSITIONS: Readonly<
  Record<WorkOrderStatus, readonly WorkOrderStatus[]>
> = {
  OPEN: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canWorkOrderTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return WORK_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertWorkOrderTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
  if (!canWorkOrderTransition(from, to))
    throw HousekeepingErrors.invalidWorkOrderTransition(from, to);
}

/**
 * `WO-XXXXX`, five digits, sequential per property so a technician quotes a
 * short number rather than a uuid. Mirrors `formatReservationNumber`.
 */
export function formatWorkOrderNumber(sequence: number): string {
  return `WO-${String(sequence % 100_000).padStart(5, '0')}`;
}
