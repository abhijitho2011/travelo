import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors for the accounts surface. `error` is surfaced verbatim by the
 * global AllExceptionsFilter as `error.code`, so these strings are the contract
 * the staff app branches on — same rule as `RestaurantErrors`.
 */
export function accountsError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const AccountsErrors = {
  // A foreign id looks exactly like a missing one: 404, never 403.
  expenseNotFound: () =>
    accountsError('EXPENSE_NOT_FOUND', 'Expense not found', HttpStatus.NOT_FOUND),

  invalidExpenseTransition: (from: string, to: string) =>
    accountsError(
      'INVALID_EXPENSE_TRANSITION',
      `An expense cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),
};
