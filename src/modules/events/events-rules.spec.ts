import {
  ACTIVE_EVENT_STATUSES,
  EVENT_TRANSITIONS,
  assertEventTransition,
  canTransitionEvent,
} from './events-rules';
import type { EventStatus } from '../../database/schema';

describe('events rules', () => {
  it('allows the happy path ENQUIRY → CONFIRMED → IN_PROGRESS → COMPLETED', () => {
    expect(canTransitionEvent('ENQUIRY', 'CONFIRMED')).toBe(true);
    expect(canTransitionEvent('CONFIRMED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionEvent('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('allows cancelling from any live state', () => {
    for (const s of ['ENQUIRY', 'CONFIRMED', 'IN_PROGRESS'] as EventStatus[]) {
      expect(canTransitionEvent(s, 'CANCELLED')).toBe(true);
    }
  });

  it('forbids skipping stages', () => {
    expect(canTransitionEvent('ENQUIRY', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionEvent('ENQUIRY', 'COMPLETED')).toBe(false);
    expect(canTransitionEvent('CONFIRMED', 'COMPLETED')).toBe(false);
  });

  it('treats COMPLETED and CANCELLED as terminal', () => {
    expect(EVENT_TRANSITIONS.COMPLETED).toEqual([]);
    expect(EVENT_TRANSITIONS.CANCELLED).toEqual([]);
    expect(canTransitionEvent('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransitionEvent('COMPLETED', 'IN_PROGRESS')).toBe(false);
  });

  it('assertEventTransition throws on an illegal move', () => {
    expect(() => assertEventTransition('COMPLETED', 'ENQUIRY')).toThrow();
    expect(() => assertEventTransition('ENQUIRY', 'CONFIRMED')).not.toThrow();
  });

  it('the dashboard treats CONFIRMED and IN_PROGRESS as upcoming', () => {
    expect(ACTIVE_EVENT_STATUSES).toEqual(['CONFIRMED', 'IN_PROGRESS']);
  });
});
