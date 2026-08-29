import { HttpException, HttpStatus } from '@nestjs/common';
import type { HousekeepingTaskStatus, WorkOrderStatus } from '../../database/schema';

/**
 * Domain errors for the housekeeping and maintenance surface. `error` is
 * surfaced verbatim by the global AllExceptionsFilter as `error.code`, so these
 * strings are the contract the staff app branches on — same rule as
 * `RoomErrors` and `ReservationErrors`.
 */
export function housekeepingError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

const humanise = (s: string) => s.toLowerCase().replace(/_/g, ' ');

export const HousekeepingErrors = {
  /**
   * Returned both for a task that does not exist AND for one belonging to
   * ANOTHER property — a 403 would leak that the row is real.
   */
  taskNotFound: () =>
    housekeepingError('HK_TASK_NOT_FOUND', 'Task not found', HttpStatus.NOT_FOUND),
  workOrderNotFound: () =>
    housekeepingError('WORK_ORDER_NOT_FOUND', 'Work order not found', HttpStatus.NOT_FOUND),
  roomNotFound: () => housekeepingError('ROOM_NOT_FOUND', 'Room not found', HttpStatus.NOT_FOUND),
  staffNotFound: () =>
    housekeepingError('STAFF_NOT_FOUND', 'Staff member not found', HttpStatus.NOT_FOUND),

  /** Exactly one of roomId / area must be supplied on a task. */
  locationRequired: () =>
    housekeepingError(
      'HK_LOCATION_REQUIRED',
      'A task must name either a room or an area, not both and not neither',
      HttpStatus.BAD_REQUEST,
    ),

  /** The single refusal produced by the central task `canTransition` map. */
  invalidTaskTransition: (from: HousekeepingTaskStatus, to: HousekeepingTaskStatus) =>
    housekeepingError(
      'HK_INVALID_TRANSITION',
      `A ${humanise(from)} task cannot become ${humanise(to)}`,
      HttpStatus.CONFLICT,
    ),

  /** The single refusal produced by the central work-order `canTransition` map. */
  invalidWorkOrderTransition: (from: WorkOrderStatus, to: WorkOrderStatus) =>
    housekeepingError(
      'WORK_ORDER_INVALID_TRANSITION',
      `A ${humanise(from)} work order cannot become ${humanise(to)}`,
      HttpStatus.CONFLICT,
    ),

  /**
   * An attendant tried to act on a task assigned to someone else. Supervisors
   * bypass this; attendants may only touch their own (or claim an unassigned
   * one on start).
   */
  notYourTask: () =>
    housekeepingError(
      'HK_NOT_YOUR_TASK',
      'This task is assigned to another staff member',
      HttpStatus.FORBIDDEN,
    ),

  /** Completing a work order requires the technician to say what was done. */
  resolutionRequired: () =>
    housekeepingError(
      'WORK_ORDER_RESOLUTION_REQUIRED',
      'Describe how the job was resolved before completing it',
      HttpStatus.BAD_REQUEST,
    ),

  /** Cancelling a work order requires a reason. */
  cancelReasonRequired: () =>
    housekeepingError(
      'WORK_ORDER_CANCEL_REASON_REQUIRED',
      'A reason is required to cancel a work order',
      HttpStatus.BAD_REQUEST,
    ),
};
