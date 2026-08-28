/**
 * Tavelo Super Admin — HTTP client for the platform API.
 *
 * Every screen in this app talks to the backend through `apiFetch`.
 * There is deliberately no development fallback host: if `VITE_API_URL` is
 * not baked into the bundle the client throws so the misconfiguration is loud.
 */

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: Record<string, unknown> | undefined;
};

export type ApiErrorBody = {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta?: Record<string, unknown>;
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Admin API base, e.g. https://api.example.com/api/v1/admin */
export function apiBaseUrl(): string {
  const raw = import.meta.env["VITE_API_URL"] as string | undefined;
  if (!raw || !raw.trim()) {
    throw new ApiError(
      "VITE_API_URL is not configured. Set it on the deployment and rebuild.",
      "CONFIG_MISSING",
      0,
    );
  }
  return raw.trim().replace(/\/+$/, "");
}

/** Platform root (base with the `/api/v1/admin` prefix stripped) — used for /health. */
export function platformRootUrl(): string {
  return apiBaseUrl().replace(/\/api\/v\d+\/admin$/, "");
}

export const TOKEN_KEYS = {
  access: "tavelo.admin.accessToken",
  refresh: "tavelo.admin.refreshToken",
} as const;

const canStore = () => typeof window !== "undefined" && !!window.localStorage;

export function readAccessToken(): string | null {
  if (!canStore()) return null;
  try {
    return window.localStorage.getItem(TOKEN_KEYS.access);
  } catch {
    return null;
  }
}

export function readRefreshToken(): string | null {
  if (!canStore()) return null;
  try {
    return window.localStorage.getItem(TOKEN_KEYS.refresh);
  } catch {
    return null;
  }
}

export function storeTokens(accessToken: string, refreshToken: string) {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(TOKEN_KEYS.access, accessToken);
    window.localStorage.setItem(TOKEN_KEYS.refresh, refreshToken);
  } catch {
    /* storage unavailable — session stays in-memory for this page load */
  }
}

export function clearTokens() {
  if (!canStore()) return;
  try {
    window.localStorage.removeItem(TOKEN_KEYS.access);
    window.localStorage.removeItem(TOKEN_KEYS.refresh);
  } catch {
    /* ignore */
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export type ApiFetchOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | undefined;
  body?: unknown;
  query?: QueryParams | undefined;
  /** Attach the bearer token. Defaults to true. */
  auth?: boolean | undefined;
  /** Absolute base override (used for the unprefixed /health endpoints). */
  baseUrl?: string | undefined;
  signal?: AbortSignal | undefined;
  headers?: Record<string, string> | undefined;
};

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?next=${next}`);
}

/** Single-flight refresh: concurrent 401s share one refresh round-trip. */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) return null;

  const payload = (await res.json().catch(() => null)) as ApiEnvelope<{
    accessToken: string;
    refreshToken: string;
  }> | null;
  const data = payload?.data;
  if (!data?.accessToken || !data?.refreshToken) return null;

  storeTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

function runRefresh(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken()
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function parseError(res: Response): Promise<ApiError> {
  let code = `HTTP_${res.status}`;
  let message = res.statusText || "Request failed";
  let details: unknown;

  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  if (body?.error) {
    code = body.error.code ?? code;
    message = body.error.message ?? message;
    details = body.error.details;
  }
  if (res.status === 404 && message === "Request failed") {
    message = "This endpoint is not available yet.";
  }
  return new ApiError(message, code, res.status, details);
}

async function rawFetch(path: string, options: ApiFetchOptions, token: string | null) {
  const base = options.baseUrl ?? apiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}${buildQuery(options.query)}`;

  const headers: Record<string, string> = { accept: "application/json", ...options.headers };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["authorization"] = `Bearer ${token}`;

  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;
  return fetch(url, init);
}

/**
 * Performs a request against the admin API and unwraps `{ success, data, meta }`.
 * On 401 it refreshes once (single-flight) and retries; if that fails the
 * session is cleared and the browser is sent to /login.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const useAuth = options.auth !== false;
  let token = useAuth ? readAccessToken() : null;

  let res: Response;
  try {
    res = await rawFetch(path, options, token);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(
      "Could not reach the platform API. Check your connection and try again.",
      "NETWORK_ERROR",
      0,
    );
  }

  if (res.status === 401 && useAuth) {
    const fresh = await runRefresh();
    if (fresh) {
      token = fresh;
      res = await rawFetch(path, options, token);
    }
    if (res.status === 401) {
      clearTokens();
      redirectToLogin();
      throw new ApiError("Your session has expired. Please sign in again.", "UNAUTHORIZED", 401);
    }
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;

  const payload = (await res.json().catch(() => null)) as ApiEnvelope<T> | T | null;
  if (payload === null) return undefined as T;
  if (
    typeof payload === "object" &&
    payload !== null &&
    "data" in payload &&
    "success" in payload
  ) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

/** Paginated list envelope used by every list endpoint on the backend. */
export type Paginated<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

/** Some endpoints return a bare array; normalise both into `Paginated`. */
export function toPaginated<T>(
  value: Paginated<T> | T[] | undefined,
  limit: number,
  offset: number,
): Paginated<T> {
  if (Array.isArray(value)) {
    // Endpoints that return a bare array do not report a total; derive a
    // best-effort one so pagination can still advance while more rows exist.
    const total = offset + value.length + (value.length === limit ? 1 : 0);
    return { items: value, total, limit, offset };
  }
  if (!value) return { items: [], total: 0, limit, offset };
  return {
    items: value.items ?? [],
    total: value.total ?? value.items?.length ?? 0,
    limit: value.limit ?? limit,
    offset: value.offset ?? offset,
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
