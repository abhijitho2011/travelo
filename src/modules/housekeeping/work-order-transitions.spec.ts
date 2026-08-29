import {
  WORK_ORDER_TRANSITIONS,
  assertWorkOrderTransition,
  canWorkOrderTransition,
  formatWorkOrderNumber,
} from './work-order-transitions';
import type { WorkOrderStatus } from '../../database/schema';

const ALL: WorkOrderStatus[] = [
  'OPEN',
  'ACCEPTED',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
];

describe('work order transitions', () => {
  it('walks OPEN → ACCEPTED → IN_PROGRESS → COMPLETED', () => {
    expect(canWorkOrderTransition('OPEN', 'ACCEPTED')).toBe(true);
    expect(canWorkOrderTransition('ACCEPTED', 'IN_PROGRESS')).toBe(true);
    expect(canWorkOrderTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('pauses and resumes: IN_PROGRESS ⇄ PAUSED', () => {
    expect(canWorkOrderTransition('IN_PROGRESS', 'PAUSED')).toBe(true);
    expect(canWorkOrderTransition('PAUSED', 'IN_PROGRESS')).toBe(true);
  });

  it('allows cancel from every non-terminal state', () => {
    for (const s of ['OPEN', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED'] as WorkOrderStatus[]) {
      expect(canWorkOrderTransition(s, 'CANCELLED')).toBe(true);
    }
  });

  it('treats COMPLETED and CANCELLED as terminal', () => {
    for (const to of ALL) {
      expect(canWorkOrderTransition('COMPLETED', to)).toBe(false);
      expect(canWorkOrderTransition('CANCELLED', to)).toBe(false);
    }
  });

  it('refuses to complete straight from OPEN or ACCEPTED', () => {
    expect(canWorkOrderTransition('OPEN', 'COMPLETED')).toBe(false);
    expect(canWorkOrderTransition('ACCEPTED', 'COMPLETED')).toBe(false);
  });

  it('cannot pause a job that has not started', () => {
    expect(canWorkOrderTransition('OPEN', 'PAUSED')).toBe(false);
    expect(canWorkOrderTransition('ACCEPTED', 'PAUSED')).toBe(false);
  });

  it('assertWorkOrderTransition throws the typed conflict on an illegal move', () => {
    try {
      assertWorkOrderTransition('OPEN', 'COMPLETED');
    } catch (e) {
      expect((e as { response: { error: string } }).response.error).toBe(
        'WORK_ORDER_INVALID_TRANSITION',
      );
    }
    expect(() => assertWorkOrderTransition('COMPLETED', 'OPEN')).toThrow();
  });

  it('every status has an entry in the map', () => {
    for (const s of ALL) expect(WORK_ORDER_TRANSITIONS[s]).toBeDefined();
  });

  it('formats work order numbers as WO- and five digits, per property', () => {
    expect(formatWorkOrderNumber(1)).toBe('WO-00001');
    expect(formatWorkOrderNumber(42)).toBe('WO-00042');
    expect(formatWorkOrderNumber(98_765)).toBe('WO-98765');
    // Wraps at the five-digit boundary, like the reservation number.
    expect(formatWorkOrderNumber(100_001)).toBe('WO-00001');
  });
});
