import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the events surface. `error` is surfaced verbatim by the
 * global AllExceptionsFilter as `error.code` — the contract the staff app
 * branches on, same rule as the other modules.
 */
export function eventError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const EventErrors = {
  notFound: () => eventError('EVENT_NOT_FOUND', 'Event not found', HttpStatus.NOT_FOUND),
  taskNotFound: () =>
    eventError('EVENT_TASK_NOT_FOUND', 'Event task not found', HttpStatus.NOT_FOUND),
  assigneeNotFound: () =>
    eventError(
      'EVENT_ASSIGNEE_NOT_FOUND',
      'That staff member is not on this property',
      HttpStatus.NOT_FOUND,
    ),

  invalidTransition: (from: string, to: string) =>
    eventError(
      'INVALID_EVENT_TRANSITION',
      `An event cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),
};
