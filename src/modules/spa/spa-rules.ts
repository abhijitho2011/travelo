import type { SpaAppointmentStatus, SpaBillStatus } from '../../database/schema';
import { SpaErrors } from './spa-errors';

/**
 * The correctness core of the spa module, kept PURE and in ONE file.
 *
 * Nothing here touches a database or a clock it did not receive. The two state
 * machines (appointment status, bill status) and the bill computation are the
 * things that must never quietly change, and they are cheap to test exhaustively
 * only because they take plain values.
 */

// ---------- Appointment state machine ----------

/**
 * BOOKED → IN_PROGRESS → COMPLETED is the happy path. From BOOKED the guest may
 * also CANCEL or NO_SHOW; a started treatment may still be CANCELLED. Terminal
 * states (COMPLETED, CANCELLED, NO_SHOW) have no outgoing edges.
 */
export const APPOINTMENT_TRANSITIONS: Readonly<
  Record<SpaAppointmentStatus, readonly SpaAppointmentStatus[]>
> = {
  BOOKED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionAppointment(
  from: SpaAppointmentStatus,
  to: SpaAppointmentStatus,
): boolean {
  return APPOINTMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertAppointmentTransition(
  from: SpaAppointmentStatus,
  to: SpaAppointmentStatus,
): void {
  if (!canTransitionAppointment(from, to)) throw SpaErrors.invalidAppointmentTransition(from, to);
}

// ---------- Bill state machine ----------

/**
 * UNPAID → PAID → REFUNDED. A refund is record-only and terminal — the money
 * moved back outside the system; the row just records that it did. There is no
 * PAID → UNPAID edge: a mistaken settlement is refunded, not un-rung.
 */
export const BILL_TRANSITIONS: Readonly<Record<SpaBillStatus, readonly SpaBillStatus[]>> = {
  UNPAID: ['PAID'],
  PAID: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransitionBill(from: SpaBillStatus, to: SpaBillStatus): boolean {
  return BILL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertBillTransition(from: SpaBillStatus, to: SpaBillStatus): void {
  if (!canTransitionBill(from, to)) throw SpaErrors.invalidBillTransition(from, to);
}

// ---------- Money ----------

/**
 * The single tax rate, from `SPA_TAX_PERCENT` (default 5). Read once and passed
 * in, so the pure math never reaches for the environment itself.
 */
export function resolveSpaTaxPercent(raw: string | number | undefined): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 5;
  return n;
}

export interface SpaBillTotals {
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/**
 * A spa bill is one line: the appointment's SNAPSHOT price. Tax is a flat
 * percentage of the subtotal, rounded to the nearest paise; total is subtotal
 * + tax. Integer paise in, integer paise out — never the live service price.
 */
export function computeSpaBill(pricePaiseSnapshot: number, taxPercent: number): SpaBillTotals {
  const subtotalPaise = Math.max(0, Math.round(pricePaiseSnapshot));
  const taxPaise = Math.round((subtotalPaise * taxPercent) / 100);
  return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
}

/** An appointment is billable only once the treatment is COMPLETED. */
export function isBillable(status: SpaAppointmentStatus): boolean {
  return status === 'COMPLETED';
}
