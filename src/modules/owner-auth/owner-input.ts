import { normalizeMobile } from '../shared-auth/mobile.util';
import { GSTIN_PATTERN } from '../owners/dto';
import { OwnerErrors } from './owner-errors';

/**
 * Shared normalisers for owner-supplied input.
 *
 * These deliberately mirror `OwnersService`'s admin-side rules so a number or a
 * GSTIN typed into the owner app is stored in exactly the same canonical form
 * as one typed into the admin console — the two surfaces write the same rows.
 */

/**
 * Runs the number through the same normaliser the auth code uses (so
 * `+91 98950 77492`, `09895077492` and `9895077492` all store identically),
 * then insists on a real 10-digit Indian mobile (leading 6-9).
 */
export function normalizeIndianMobile(raw: string, field = 'mobile'): string {
  const normalized = normalizeMobile(raw);
  if (!normalized || !/^[6-9]\d{9}$/.test(normalized)) {
    throw OwnerErrors.invalidPhone(field);
  }
  return normalized;
}

/** Empty GST is stored as NULL, never as an empty string. */
export function normalizeGstin(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim().toUpperCase();
  if (!trimmed) return null;
  if (!GSTIN_PATTERN.test(trimmed)) throw OwnerErrors.invalidGstin();
  return trimmed;
}

/** Trims to null so an emptied optional text field clears the column. */
export function trimToNull(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}
