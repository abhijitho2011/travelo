import {
  INCIDENT_TRANSITIONS,
  SHIFT_TRANSITIONS,
  OPEN_INCIDENT_STATUSES,
  assertIncidentTransition,
  assertShiftTransition,
  canTransitionIncident,
  canTransitionShift,
} from './security-rules';

describe('security rules', () => {
  describe('incident state machine', () => {
    it('allows OPEN → ASSIGNED → RESOLVED', () => {
      expect(canTransitionIncident('OPEN', 'ASSIGNED')).toBe(true);
      expect(canTransitionIncident('ASSIGNED', 'RESOLVED')).toBe(true);
    });

    it('allows a manager to resolve an OPEN incident directly', () => {
      expect(canTransitionIncident('OPEN', 'RESOLVED')).toBe(true);
    });

    it('allows re-opening an assigned incident', () => {
      expect(canTransitionIncident('ASSIGNED', 'OPEN')).toBe(true);
    });

    it('treats RESOLVED as terminal', () => {
      expect(INCIDENT_TRANSITIONS.RESOLVED).toEqual([]);
      expect(canTransitionIncident('RESOLVED', 'OPEN')).toBe(false);
    });

    it('assertIncidentTransition throws on an illegal move', () => {
      expect(() => assertIncidentTransition('RESOLVED', 'ASSIGNED')).toThrow();
      expect(() => assertIncidentTransition('OPEN', 'RESOLVED')).not.toThrow();
    });

    it('the dashboard counts OPEN and ASSIGNED as still-open', () => {
      expect(OPEN_INCIDENT_STATUSES).toEqual(['OPEN', 'ASSIGNED']);
    });
  });

  describe('shift state machine', () => {
    it('allows SCHEDULED → ACTIVE → ENDED', () => {
      expect(canTransitionShift('SCHEDULED', 'ACTIVE')).toBe(true);
      expect(canTransitionShift('ACTIVE', 'ENDED')).toBe(true);
    });

    it('allows cancelling a scheduled shift straight to ENDED', () => {
      expect(canTransitionShift('SCHEDULED', 'ENDED')).toBe(true);
    });

    it('treats ENDED as terminal', () => {
      expect(SHIFT_TRANSITIONS.ENDED).toEqual([]);
      expect(canTransitionShift('ENDED', 'ACTIVE')).toBe(false);
    });

    it('assertShiftTransition throws on an illegal move', () => {
      expect(() => assertShiftTransition('ENDED', 'ACTIVE')).toThrow();
      expect(() => assertShiftTransition('SCHEDULED', 'ACTIVE')).not.toThrow();
    });
  });
});
