import type {
  PurchaseOrderStatus,
  StockMovementType,
  PurchaseOrderLine,
} from '../../database/schema';
import { InventoryErrors } from './inventory-errors';

/**
 * The correctness core of the inventory module, kept PURE and testable: the two
 * things that must never quietly change — how a stock movement moves on-hand,
 * and the purchase-order lifecycle.
 */

// ---------- Stock movement → signed delta ----------

/**
 * The SIGNED effect a movement has on `current_qty`.
 *   IN       — receiving stock, positive.
 *   OUT      — issuing/consuming stock, negative.
 *   WASTAGE  — spoilage/breakage, negative.
 *   ADJUST   — a stock-take correction; `qty` is already signed (may be < 0).
 *
 * For IN/OUT/WASTAGE `qty` is a positive magnitude; the sign is applied here so
 * a caller can never accidentally issue a negative "OUT" that adds stock.
 */
export function stockDelta(type: StockMovementType, qty: number): number {
  switch (type) {
    case 'IN':
      return Math.abs(qty);
    case 'OUT':
    case 'WASTAGE':
      return -Math.abs(qty);
    case 'ADJUST':
      return qty;
  }
}

/** True when applying `delta` to `current` keeps on-hand at or above zero. */
export function stockStaysNonNegative(current: number, delta: number): boolean {
  return current + delta >= 0;
}

// ---------- Purchase-order state machine ----------

/**
 * DRAFT → SENT → RECEIVED is the happy path; DRAFT and SENT may be CANCELLED.
 * RECEIVED and CANCELLED are terminal. Receiving is what turns the order into
 * IN movements, so it can only ever happen once, from SENT.
 */
export const PO_TRANSITIONS: Readonly<Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>> =
  {
    DRAFT: ['SENT', 'CANCELLED'],
    SENT: ['RECEIVED', 'CANCELLED'],
    RECEIVED: [],
    CANCELLED: [],
  };

export function canTransitionPo(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return PO_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPoTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): void {
  if (!canTransitionPo(from, to)) throw InventoryErrors.invalidPoTransition(from, to);
}

/** A PO's lines may only be edited while it is still a DRAFT. */
export function poIsEditable(status: PurchaseOrderStatus): boolean {
  return status === 'DRAFT';
}

// ---------- Money ----------

export interface PoLineInput {
  itemId: string;
  nameSnapshot: string;
  unitSnapshot: string;
  qty: number;
  unitPricePaise: number;
}

/** Compute each line's total and the PO total, all integer paise. */
export function computePoTotals(lines: readonly PoLineInput[]): {
  lines: PurchaseOrderLine[];
  totalPaise: number;
} {
  const computed: PurchaseOrderLine[] = lines.map((l) => ({
    itemId: l.itemId,
    nameSnapshot: l.nameSnapshot,
    unitSnapshot: l.unitSnapshot,
    qty: l.qty,
    unitPricePaise: l.unitPricePaise,
    lineTotalPaise: l.qty * l.unitPricePaise,
  }));
  const totalPaise = computed.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  return { lines: computed, totalPaise };
}

// ---------- PO number ----------

/** `PO-00001`. Per-property sequence, zero-padded to five, wider if it grows. */
export function formatPoNumber(sequence: number): string {
  return `PO-${String(sequence).padStart(5, '0')}`;
}
