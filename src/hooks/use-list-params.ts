import { useCallback, useEffect, useState } from "react";

/**
 * Local state for a server-driven list screen: a debounced search term,
 * an optional status filter and an offset that resets whenever they change.
 */
export function useListParams(options?: { limit?: number; debounceMs?: number }) {
  const limit = options?.limit ?? 25;
  const debounceMs = options?.debounceMs ?? 300;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, debounceMs);
    return () => clearTimeout(id);
  }, [search, debounceMs]);

  const changeStatus = useCallback((next: string) => {
    setStatus(next);
    setOffset(0);
  }, []);

  return {
    limit,
    offset,
    setOffset,
    search,
    setSearch,
    /** Debounced value — pass this to the API. */
    q: debouncedSearch || undefined,
    status,
    setStatus: changeStatus,
    /** Filter value for the API (`""` means "all"). */
    statusParam: status || undefined,
  };
}

/** Placeholder used by shadcn Selects, which cannot hold an empty string value. */
export const ALL_VALUE = "__all__";

export function fromSelect(value: string): string {
  return value === ALL_VALUE ? "" : value;
}

export function toSelect(value: string): string {
  return value === "" ? ALL_VALUE : value;
}
