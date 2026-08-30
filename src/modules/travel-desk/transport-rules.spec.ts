import {
  canTransitionTransport,
  assertTransportTransition,
  canTransitionDriverStage,
  assertDriverStage,
  driverStepStage,
} from './transport-rules';

describe('transport request state machine', () => {
  it('walks REQUESTED → ASSIGNED → IN_PROGRESS → COMPLETED', () => {
    expect(canTransitionTransport('REQUESTED', 'ASSIGNED')).toBe(true);
    expect(canTransitionTransport('ASSIGNED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionTransport('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('can unassign (ASSIGNED → REQUESTED) and cancel from any active state', () => {
    expect(canTransitionTransport('ASSIGNED', 'REQUESTED')).toBe(true);
    expect(canTransitionTransport('REQUESTED', 'CANCELLED')).toBe(true);
    expect(canTransitionTransport('ASSIGNED', 'CANCELLED')).toBe(true);
    expect(canTransitionTransport('IN_PROGRESS', 'CANCELLED')).toBe(true);
  });

  it('will not skip assignment or reopen terminals', () => {
    expect(canTransitionTransport('REQUESTED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionTransport('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionTransport('CANCELLED', 'REQUESTED')).toBe(false);
  });

  it('assert throws on an illegal move', () => {
    expect(() => assertTransportTransition('REQUESTED', 'ASSIGNED')).not.toThrow();
    expect(() => assertTransportTransition('COMPLETED', 'REQUESTED')).toThrow(
      /cannot move from/,
    );
  });
});

describe('driver stage machine', () => {
  it('accepts only out of the pre-accept (null) state', () => {
    expect(canTransitionDriverStage(null, 'ACCEPTED')).toBe(true);
    expect(canTransitionDriverStage(null, 'EN_ROUTE')).toBe(false);
  });

  it('walks ACCEPTED → EN_ROUTE → ARRIVED → PICKED_UP', () => {
    expect(canTransitionDriverStage('ACCEPTED', 'EN_ROUTE')).toBe(true);
    expect(canTransitionDriverStage('EN_ROUTE', 'ARRIVED')).toBe(true);
    expect(canTransitionDriverStage('ARRIVED', 'PICKED_UP')).toBe(true);
  });

  it('will not skip a doorstep step', () => {
    expect(canTransitionDriverStage('ACCEPTED', 'ARRIVED')).toBe(false);
    expect(canTransitionDriverStage('PICKED_UP', 'ARRIVED')).toBe(false);
  });

  it('assert throws on an illegal step', () => {
    expect(() => assertDriverStage('ACCEPTED', 'EN_ROUTE')).not.toThrow();
    expect(() => assertDriverStage('ACCEPTED', 'PICKED_UP')).toThrow(/cannot move from/);
  });

  it('maps each driver step to its target stage', () => {
    expect(driverStepStage('accept')).toBe('ACCEPTED');
    expect(driverStepStage('onTheWay')).toBe('EN_ROUTE');
    expect(driverStepStage('arrived')).toBe('ARRIVED');
    expect(driverStepStage('pickedUp')).toBe('PICKED_UP');
    expect(driverStepStage('complete')).toBeNull();
  });
});
