import { canTransitionLead, assertLeadTransition, OPEN_STAGES, WON_STAGES } from './sales-rules';

describe('lead pipeline state machine', () => {
  it('walks the happy path to CONFIRMED', () => {
    expect(canTransitionLead('LEAD', 'CONTACTED')).toBe(true);
    expect(canTransitionLead('CONTACTED', 'PROPOSAL')).toBe(true);
    expect(canTransitionLead('PROPOSAL', 'NEGOTIATION')).toBe(true);
    expect(canTransitionLead('NEGOTIATION', 'CONFIRMED')).toBe(true);
  });

  it('lets a proposal be won on the spot', () => {
    expect(canTransitionLead('PROPOSAL', 'CONFIRMED')).toBe(true);
  });

  it('can drop to LOST from any active stage', () => {
    for (const s of OPEN_STAGES) {
      expect(canTransitionLead(s, 'LOST')).toBe(true);
    }
  });

  it('will not skip stages or reverse', () => {
    expect(canTransitionLead('LEAD', 'PROPOSAL')).toBe(false);
    expect(canTransitionLead('NEGOTIATION', 'PROPOSAL')).toBe(false);
  });

  it('treats CONFIRMED and LOST as terminal', () => {
    for (const won of WON_STAGES) {
      expect(canTransitionLead(won, 'LEAD')).toBe(false);
    }
    expect(canTransitionLead('LOST', 'LEAD')).toBe(false);
  });

  it('assert throws on an illegal move', () => {
    expect(() => assertLeadTransition('LEAD', 'CONTACTED')).not.toThrow();
    expect(() => assertLeadTransition('LOST', 'LEAD')).toThrow(/cannot move from/);
  });
});
