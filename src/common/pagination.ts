/**
 * The one pagination shape every list endpoint speaks.
 *
 * Historically each controller re-parsed `limit`/`offset` from query strings and
 * clamped them differently (some at 200, some not at all, some returning
 * unbounded lists). This centralises the contract: a bounded window plus the
 * total, so the client can render "showing N of total" and a load-more control.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Hard ceiling on a single page, so no caller can ask for the whole table. */
export const MAX_PAGE_LIMIT = 200;
export const DEFAULT_PAGE_LIMIT = 50;

/**
 * Normalises raw `limit`/`offset` (numbers or query strings) into a safe window:
 * limit is clamped to [1, MAX_PAGE_LIMIT] (default DEFAULT_PAGE_LIMIT), offset to
 * >= 0. Non-numeric or missing values fall back to the defaults.
 */
export function resolvePage(
  limit?: number | string | undefined,
  offset?: number | string | undefined,
  fallbackLimit: number = DEFAULT_PAGE_LIMIT,
): { limit: number; offset: number } {
  const rawLimit = typeof limit === 'string' ? Number(limit) : limit;
  const rawOffset = typeof offset === 'string' ? Number(offset) : offset;
  const safeLimit =
    Number.isFinite(rawLimit) && (rawLimit as number) > 0
      ? Math.min(Math.floor(rawLimit as number), MAX_PAGE_LIMIT)
      : fallbackLimit;
  const safeOffset =
    Number.isFinite(rawOffset) && (rawOffset as number) > 0 ? Math.floor(rawOffset as number) : 0;
  return { limit: safeLimit, offset: safeOffset };
}

/** Assemble a `Paginated<T>` from a page of rows and the total count. */
export function paginated<T>(
  items: T[],
  total: number,
  page: { limit: number; offset: number },
): Paginated<T> {
  return { items, total, limit: page.limit, offset: page.offset };
}
