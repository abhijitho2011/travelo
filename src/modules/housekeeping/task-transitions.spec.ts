import {
  HOUSEKEEPING_TASK_TRANSITIONS,
  ROOM_STATUS_FOR_TASK,
  assertTaskTransition,
  canTaskTransition,
} from './task-transitions';
import type { HousekeepingTaskStatus } from '../../database/schema';

const ALL: HousekeepingTaskStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'INSPECTED',
  'REJECTED',
];

describe('housekeeping task transitions', () => {
  it('walks the happy path PENDING → IN_PROGRESS → COMPLETED → INSPECTED', () => {
    expect(canTaskTransition('PENDING', 'IN_PROGRESS')).toBe(true);
    expect(canTaskTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTaskTransition('COMPLETED', 'INSPECTED')).toBe(true);
  });

  it('allows a failed inspection COMPLETED → REJECTED', () => {
    expect(canTaskTransition('COMPLETED', 'REJECTED')).toBe(true);
  });

  it('treats INSPECTED and REJECTED as terminal', () => {
    for (const to of ALL) {
      expect(canTaskTransition('INSPECTED', to)).toBe(false);
      expect(canTaskTransition('REJECTED', to)).toBe(false);
    }
  });

  it('refuses to skip a stage (PENDING cannot jump to COMPLETED)', () => {
    expect(canTaskTransition('PENDING', 'COMPLETED')).toBe(false);
    expect(canTaskTransition('PENDING', 'INSPECTED')).toBe(false);
    expect(canTaskTransition('IN_PROGRESS', 'INSPECTED')).toBe(false);
  });

  it('never allows a self-transition', () => {
    for (const s of ALL) expect(canTaskTransition(s, s)).toBe(false);
  });

  it('assertTaskTransition throws the typed conflict on an illegal move', () => {
    expect(() => assertTaskTransition('PENDING', 'INSPECTED')).toThrow();
    try {
      assertTaskTransition('INSPECTED', 'PENDING');
    } catch (e) {
      expect((e as { response: { error: string } }).response.error).toBe('HK_INVALID_TRANSITION');
    }
  });

  it('every status has an entry in the map', () => {
    for (const s of ALL) expect(HOUSEKEEPING_TASK_TRANSITIONS[s]).toBeDefined();
  });

  it('maps each work step to the room status it drives', () => {
    expect(ROOM_STATUS_FOR_TASK.START).toBe('CLEANING');
    expect(ROOM_STATUS_FOR_TASK.COMPLETE).toBe('INSPECTED');
    expect(ROOM_STATUS_FOR_TASK.INSPECT_PASS).toBe('READY');
    expect(ROOM_STATUS_FOR_TASK.INSPECT_FAIL).toBe('DIRTY');
  });
});
