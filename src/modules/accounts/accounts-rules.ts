import type { ExpenseStatus } from '../../database/schema';
import { AccountsErrors } from './accounts-errors';

/**
 * The correctness core of the accounts module, kept PURE and testable.
 *
 * The expense register is deliberately NOT a double-entry ledger: an expense is
 * one row that walks a short lifecycle. DRAFT → APPROVED → PAID is the only
 * path; every state is forward-only, and PAID is terminal (a paid expense is
 * history the revenue rollup has been reconciled against — you raise a new one
 * to correct it, you do not un-pay it).
 */
export const EXPENSE_TRANSITIONS: Readonly<Record<ExpenseStatus, readonly ExpenseStatus[]>> = {
  DRAFT: ['APPROVED'],
  APPROVED: ['PAID'],
  PAID: [],
};

export function canTransitionExpense(from: ExpenseStatus, to: ExpenseStatus): boolean {
  return EXPENSE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertExpenseTransition(from: ExpenseStatus, to: ExpenseStatus): void {
  if (!canTransitionExpense(from, to)) throw AccountsErrors.invalidExpenseTransition(from, to);
}
