/**
 * Canonical form for an Indian mobile number so that `9895077492`,
 * `+91 98950 77492`, `09895077492` and `919895077492` all compare equal.
 *
 * The same function is applied to the value read from the environment and to
 * anything supplied by a client, so an allowlist comparison can never be
 * defeated by formatting.
 *
 * Returns `null` when the input cannot be reduced to a plausible number.
 */
export function normalizeMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Keep digits only (drops spaces, dashes, brackets and the leading `+`).
  let digits = String(raw).replace(/\D+/g, '');
  if (!digits) return null;
  // Strip an Indian country code, then any remaining trunk zeros.
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  digits = digits.replace(/^0+/, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** True when both values normalise to the same non-null number. */
export function mobileMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeMobile(a);
  const right = normalizeMobile(b);
  return left !== null && right !== null && left === right;
}

/** Canonical form for an email used in an allowlist comparison. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

/** True when both values normalise to the same non-null email. */
export function emailMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeEmail(a);
  const right = normalizeEmail(b);
  return left !== null && right !== null && left === right;
}
