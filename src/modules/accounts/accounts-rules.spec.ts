import { canTransitionExpense, assertExpenseTransition } from './accounts-rules';

describe('expense state machine', () => {
  it('walks DRAFT → APPROVED → PAID', () => {
    expect(canTransitionExpense('DRAFT', 'APPROVED')).toBe(true);
    expect(canTransitionExpense('APPROVED', 'PAID')).toBe(true);
  });

  it('is forward-only — no skipping and no reversing', () => {
    expect(canTransitionExpense('DRAFT', 'PAID')).toBe(false);
    expect(canTransitionExpense('APPROVED', 'DRAFT')).toBe(false);
    expect(canTransitionExpense('PAID', 'APPROVED')).toBe(false);
  });

  it('treats PAID as terminal', () => {
    expect(canTransitionExpense('PAID', 'PAID')).toBe(false);
  });

  it('assert throws on an illegal move and is silent on a legal one', () => {
    expect(() => assertExpenseTransition('DRAFT', 'APPROVED')).not.toThrow();
    expect(() => assertExpenseTransition('PAID', 'DRAFT')).toThrow(/cannot move from/);
  });
});
