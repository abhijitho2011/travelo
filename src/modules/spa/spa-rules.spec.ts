import {
  APPOINTMENT_TRANSITIONS,
  BILL_TRANSITIONS,
  assertAppointmentTransition,
  assertBillTransition,
  canTransitionAppointment,
  canTransitionBill,
  computeSpaBill,
  isBillable,
  resolveSpaTaxPercent,
} from './spa-rules';
import type { SpaAppointmentStatus, SpaBillStatus } from '../../database/schema';

describe('spa rules', () => {
  describe('appointment state machine', () => {
    it('allows the happy path BOOKED → IN_PROGRESS → COMPLETED', () => {
      expect(canTransitionAppointment('BOOKED', 'IN_PROGRESS')).toBe(true);
      expect(canTransitionAppointment('IN_PROGRESS', 'COMPLETED')).toBe(true);
    });

    it('allows BOOKED → CANCELLED and BOOKED → NO_SHOW', () => {
      expect(canTransitionAppointment('BOOKED', 'CANCELLED')).toBe(true);
      expect(canTransitionAppointment('BOOKED', 'NO_SHOW')).toBe(true);
    });

    it('allows a started treatment to be cancelled', () => {
      expect(canTransitionAppointment('IN_PROGRESS', 'CANCELLED')).toBe(true);
    });

    it('forbids skipping straight from BOOKED to COMPLETED', () => {
      expect(canTransitionAppointment('BOOKED', 'COMPLETED')).toBe(false);
    });

    it('forbids a NO_SHOW from being completed or started', () => {
      expect(canTransitionAppointment('NO_SHOW', 'COMPLETED')).toBe(false);
      expect(canTransitionAppointment('NO_SHOW', 'IN_PROGRESS')).toBe(false);
    });

    it('treats COMPLETED, CANCELLED and NO_SHOW as terminal', () => {
      const terminal: SpaAppointmentStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
      for (const s of terminal) expect(APPOINTMENT_TRANSITIONS[s]).toEqual([]);
    });

    it('assertAppointmentTransition throws on an illegal move', () => {
      expect(() => assertAppointmentTransition('COMPLETED', 'BOOKED')).toThrow();
      expect(() => assertAppointmentTransition('BOOKED', 'IN_PROGRESS')).not.toThrow();
    });
  });

  describe('bill state machine', () => {
    it('allows UNPAID → PAID → REFUNDED', () => {
      expect(canTransitionBill('UNPAID', 'PAID')).toBe(true);
      expect(canTransitionBill('PAID', 'REFUNDED')).toBe(true);
    });

    it('forbids un-ringing a paid bill and refunding an unpaid one', () => {
      expect(canTransitionBill('PAID', 'UNPAID')).toBe(false);
      expect(canTransitionBill('UNPAID', 'REFUNDED')).toBe(false);
    });

    it('treats REFUNDED as terminal', () => {
      const terminal: SpaBillStatus = 'REFUNDED';
      expect(BILL_TRANSITIONS[terminal]).toEqual([]);
    });

    it('assertBillTransition throws on an illegal move', () => {
      expect(() => assertBillTransition('REFUNDED', 'PAID')).toThrow();
      expect(() => assertBillTransition('UNPAID', 'PAID')).not.toThrow();
    });
  });

  describe('computeSpaBill', () => {
    it('applies the tax percent and rounds to the nearest paise', () => {
      // 25000 paise @ 5% = 1250 tax, 26250 total.
      expect(computeSpaBill(25_000, 5)).toEqual({
        subtotalPaise: 25_000,
        taxPaise: 1_250,
        totalPaise: 26_250,
      });
    });

    it('rounds a fractional tax to the nearest paise', () => {
      // 999 @ 5% = 49.95 → 50.
      expect(computeSpaBill(999, 5)).toEqual({
        subtotalPaise: 999,
        taxPaise: 50,
        totalPaise: 1_049,
      });
    });

    it('never produces a negative subtotal', () => {
      expect(computeSpaBill(-100, 5)).toEqual({ subtotalPaise: 0, taxPaise: 0, totalPaise: 0 });
    });

    it('is computed from the snapshot passed in — a zero-tax outlet totals to the subtotal', () => {
      expect(computeSpaBill(50_000, 0)).toEqual({
        subtotalPaise: 50_000,
        taxPaise: 0,
        totalPaise: 50_000,
      });
    });
  });

  describe('resolveSpaTaxPercent', () => {
    it('defaults to 5 for junk and negatives', () => {
      expect(resolveSpaTaxPercent(undefined)).toBe(5);
      expect(resolveSpaTaxPercent('nonsense')).toBe(5);
      expect(resolveSpaTaxPercent(-3)).toBe(5);
    });

    it('accepts a valid number or numeric string', () => {
      expect(resolveSpaTaxPercent(12)).toBe(12);
      expect(resolveSpaTaxPercent('18')).toBe(18);
      expect(resolveSpaTaxPercent(0)).toBe(0);
    });
  });

  describe('isBillable', () => {
    it('is true only for COMPLETED', () => {
      expect(isBillable('COMPLETED')).toBe(true);
      for (const s of ['BOOKED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'] as SpaAppointmentStatus[]) {
        expect(isBillable(s)).toBe(false);
      }
    });
  });
});
