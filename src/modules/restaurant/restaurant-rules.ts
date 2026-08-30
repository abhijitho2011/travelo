import type { KotStatus, RestaurantOrderStatus } from '../../database/schema';
import { RestaurantErrors } from './restaurant-errors';

/**
 * The correctness core of the F&B module, kept PURE and in ONE file.
 *
 * Nothing here touches a database or a clock it did not receive. The two state
 * machines (order status, KOT line status), the tax calculation and the bill
 * computation are the things that must never quietly change, and they are cheap
 * to test exhaustively only because they take plain values.
 */

// ---------- Order state machine ----------

/**
 * OPEN → BILLED → PAID is the happy path; OPEN → CANCELLED is the manager void.
 * Terminal states (PAID, CANCELLED) have no outgoing edges: a settled or voided
 * order is history that revenue has been reported against. You open a new one.
 *
 * Note there is deliberately NO BILLED → OPEN edge here. Re-opening a billed
 * order is a correction, not a normal move; the desk cancels and re-rings.
 */
export const ORDER_TRANSITIONS: Readonly<
  Record<RestaurantOrderStatus, readonly RestaurantOrderStatus[]>
> = {
  OPEN: ['BILLED', 'CANCELLED'],
  BILLED: ['PAID'],
  PAID: [],
  CANCELLED: [],
};

export function canTransitionOrder(
  from: RestaurantOrderStatus,
  to: RestaurantOrderStatus,
): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertOrderTransition(
  from: RestaurantOrderStatus,
  to: RestaurantOrderStatus,
): void {
  if (!canTransitionOrder(from, to)) throw RestaurantErrors.invalidOrderTransition(from, to);
}

// ---------- KOT (kitchen ticket) state machine ----------

/**
 * NEW → PREPARING → READY → SERVED is the kitchen-then-floor flow.
 * NEW → CANCELLED is the only cancel a line takes on its own: once the kitchen
 * has started (PREPARING onward) pulling it is a manager void, not a waiter's
 * to make. SERVED and CANCELLED are terminal.
 */
export const KOT_TRANSITIONS: Readonly<Record<KotStatus, readonly KotStatus[]>> = {
  NEW: ['PREPARING', 'READY', 'CANCELLED'],
  // A busy kitchen sometimes plates straight from NEW; PREPARING → READY is the
  // usual path and PREPARING → SERVED is allowed for the same reason.
  PREPARING: ['READY', 'SERVED'],
  READY: ['SERVED'],
  SERVED: [],
  CANCELLED: [],
};

export function canTransitionKot(from: KotStatus, to: KotStatus): boolean {
  return KOT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertKotTransition(from: KotStatus, to: KotStatus): void {
  if (!canTransitionKot(from, to)) throw RestaurantErrors.invalidKotTransition(from, to);
}

/**
 * Which KOT moves each role may make. The endpoint holds a single `kot.update`
 * permission; this map is what stops a chef marking a line SERVED (a floor act)
 * or a waiter marking one PREPARING (a kitchen act). The manager may do either.
 *
 * Keyed by TARGET status because that is what the request carries.
 */
const KOT_ROLE_TARGETS: Readonly<Record<string, readonly KotStatus[]>> = {
  CHEF: ['PREPARING', 'READY'],
  WAITER: ['SERVED', 'CANCELLED'],
  RESTAURANT_MANAGER: ['PREPARING', 'READY', 'SERVED', 'CANCELLED'],
};

export function roleMaySetKot(role: string, to: KotStatus): boolean {
  return KOT_ROLE_TARGETS[role]?.includes(to) ?? false;
}

/** KOT lines the kitchen display still cares about: everything not off the pass. */
export const KITCHEN_ACTIVE_KOT: readonly KotStatus[] = ['NEW', 'PREPARING', 'READY'];

/** A CANCELLED line is excluded from the bill; everything else counts. */
export function countsTowardsBill(status: KotStatus): boolean {
  return status !== 'CANCELLED';
}

// ---------- Money ----------

/**
 * The single tax rate, from `RESTAURANT_TAX_PERCENT` (default 5). Read once and
 * passed in, so the pure math never reaches for the environment itself.
 */
export function resolveTaxPercent(raw: string | number | undefined): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 5;
  return n;
}

export interface BillLine {
  pricePaiseSnapshot: number;
  qty: number;
  kotStatus: KotStatus;
}

export interface BillTotals {
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/**
 * Compute a bill from item SNAPSHOTS — never the live menu. Cancelled lines are
 * excluded. Tax is a flat percentage of the subtotal, rounded to the nearest
 * paise; total is subtotal + tax. All integer paise in, integer paise out.
 */
export function computeBill(lines: readonly BillLine[], taxPercent: number): BillTotals {
  const subtotalPaise = lines
    .filter((l) => countsTowardsBill(l.kotStatus))
    .reduce((sum, l) => sum + l.pricePaiseSnapshot * l.qty, 0);
  const taxPaise = Math.round((subtotalPaise * taxPercent) / 100);
  return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
}

// ---------- Order number ----------

/** `ORD-00001`. Per-property sequence; zero-padded to five, wider if it grows. */
export function formatOrderNumber(sequence: number): string {
  return `ORD-${String(sequence).padStart(5, '0')}`;
}
