/**
 * Tavelo — Indian GST (Goods & Services Tax) engine.
 *
 * Pure, DB-free tax math. All money is in paise (integer minor units), as
 * everywhere else in this codebase. Nothing here touches Drizzle, Nest, or
 * config — it is deliberately a plain function library so it can be unit tested
 * exhaustively (see gst.spec.ts).
 *
 * GST on a supply is levied either:
 *  - intra-state: split equally into CGST (central) + SGST (state), each at
 *    half the headline rate; or
 *  - inter-state: a single IGST at the full headline rate.
 * The total tax is identical either way — only the split differs.
 */

/** Supply categories Tavelo bills for, each mapped to an SAC/HSN code + slabs. */
export type GstCategory = 'accommodation' | 'restaurant' | 'saas' | 'other';

/** A single GST rate band. `maxAmountPaise` is an inclusive upper bound on the
 *  per-unit taxable amount (e.g. tariff per night); `null` means "no ceiling". */
export interface GstSlab {
  /** Inclusive upper bound (paise) for this slab, or null for the top slab. */
  readonly maxAmountPaise: number | null;
  /** Headline GST rate as a percentage, e.g. 12 or 18. */
  readonly ratePercent: number;
}

/** The result of applying GST to a taxable amount. All figures in paise. */
export interface GstBreakdown {
  readonly cgstPaise: number;
  readonly sgstPaise: number;
  readonly igstPaise: number;
  /** cgst + sgst + igst — the single total-tax figure. */
  readonly taxPaise: number;
  /** taxableAmountPaise + taxPaise. */
  readonly totalPaise: number;
}

/**
 * Hotel accommodation, SAC 996311. India's standard structure keys the rate to
 * the declared tariff per unit (per room per night):
 *   - tariff ≤ ₹7,500 (750000 paise)  → 12%
 *   - tariff  > ₹7,500                 → 18%
 */
export const HOTEL_GST_SLABS: readonly GstSlab[] = [
  { maxAmountPaise: 750000, ratePercent: 12 },
  { maxAmountPaise: null, ratePercent: 18 },
];

/** Restaurant service, SAC 996331. Standalone restaurant supply is a flat 5%. */
export const RESTAURANT_GST_SLABS: readonly GstSlab[] = [{ maxAmountPaise: null, ratePercent: 5 }];

/** SaaS / software subscription service, SAC 998319. Flat 18%. */
export const SAAS_GST_SLABS: readonly GstSlab[] = [{ maxAmountPaise: null, ratePercent: 18 }];

/** Generic fallback for anything uncategorised — the standard 18% slab. */
export const OTHER_GST_SLABS: readonly GstSlab[] = [{ maxAmountPaise: null, ratePercent: 18 }];

/** SAC/HSN service codes per category. */
const HSN_CODES: Record<GstCategory, string> = {
  accommodation: '996311',
  restaurant: '996331',
  saas: '998319',
  other: '9983',
};

const SLABS_BY_CATEGORY: Record<GstCategory, readonly GstSlab[]> = {
  accommodation: HOTEL_GST_SLABS,
  restaurant: RESTAURANT_GST_SLABS,
  saas: SAAS_GST_SLABS,
  other: OTHER_GST_SLABS,
};

/** The SAC/HSN code string for a category. */
export function hsnFor(category: GstCategory): string {
  return HSN_CODES[category];
}

/** The slab config for a category. */
export function slabsFor(category: GstCategory): readonly GstSlab[] {
  return SLABS_BY_CATEGORY[category];
}

/**
 * Resolves the applicable GST rate for a category given the per-unit taxable
 * amount (paise). Slabs are matched in order on their inclusive upper bound.
 */
export function resolveGstRate(category: GstCategory, amountPaise: number): number {
  const slabs = SLABS_BY_CATEGORY[category];
  for (const slab of slabs) {
    if (slab.maxAmountPaise === null || amountPaise <= slab.maxAmountPaise) {
      return slab.ratePercent;
    }
  }
  // Unreachable for well-formed configs (every list ends in a null-bound slab),
  // but keep a safe fallback rather than returning undefined.
  return slabs[slabs.length - 1].ratePercent;
}

export interface ComputeGstInput {
  /** The taxable base in paise (net of discount, exclusive of tax). */
  taxableAmountPaise: number;
  /** Headline rate as a percentage, e.g. 12 or 18. */
  ratePercent: number;
  /** true → CGST+SGST split; false → single IGST. */
  intraState: boolean;
}

/**
 * Applies a GST rate to a taxable amount and returns the paise breakdown.
 *
 * Rounding rule: the total tax is rounded to whole paise first, then, for an
 * intra-state supply, SGST takes the floor half and CGST takes the remainder,
 * so `cgstPaise + sgstPaise === taxPaise` exactly with zero drift. Inter-state
 * puts the whole rounded amount in IGST.
 */
export function computeGst(input: ComputeGstInput): GstBreakdown {
  const { taxableAmountPaise, ratePercent, intraState } = input;
  // Round the total tax once, up front, so the split can never drift.
  const taxPaise = Math.round((taxableAmountPaise * ratePercent) / 100);

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (intraState) {
    sgstPaise = Math.floor(taxPaise / 2);
    cgstPaise = taxPaise - sgstPaise; // absorbs the odd paise → cgst+sgst === tax
  } else {
    igstPaise = taxPaise;
  }

  return {
    cgstPaise,
    sgstPaise,
    igstPaise,
    taxPaise,
    totalPaise: taxableAmountPaise + taxPaise,
  };
}

/**
 * Convenience: resolve the rate for a category+amount and compute the breakdown
 * in one call. Uses `taxableAmountPaise` for both slab resolution and the base.
 */
export function computeGstForCategory(args: {
  category: GstCategory;
  taxableAmountPaise: number;
  /**
   * The amount the SLAB is chosen on, when it differs from the amount taxed.
   * For accommodation that is the declared tariff per room per night — the
   * law sets the rate by the room's price, not by how many nights were sold.
   * Defaults to the taxable amount, which is right for a single-unit invoice.
   */
  slabBasisPaise?: number;
  intraState: boolean;
}): GstBreakdown & { ratePercent: number; hsnCode: string } {
  const ratePercent = resolveGstRate(args.category, args.slabBasisPaise ?? args.taxableAmountPaise);
  const breakdown = computeGst({
    taxableAmountPaise: args.taxableAmountPaise,
    ratePercent,
    intraState: args.intraState,
  });
  return { ...breakdown, ratePercent, hsnCode: hsnFor(args.category) };
}
