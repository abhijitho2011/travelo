/**
 * Admin session handling. Tokens live in localStorage under `tavelo.admin.*`
 * and are attached to every request by `apiFetch`.
 */
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { apiFetch, clearTokens, readAccessToken, readRefreshToken, storeTokens } from "@/lib/api";

export type AdminRole = { key: string; name: string };

export type CurrentAdmin = {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: string[];
  permissions: string[];
};

/**
 * What the first factor returns when the admin has TOTP enabled: a
 * short-lived, single-purpose token and NO session. `completeMfaChallenge` is
 * the only way past it.
 */
export type MfaChallengeResponse = {
  mfaRequired: true;
  mfaToken: string;
  /** Seconds. */
  expiresIn: number;
};

export type SignInResult = LoginResponse | MfaChallengeResponse;

export function isMfaChallenge(result: SignInResult): result is MfaChallengeResponse {
  return (result as MfaChallengeResponse).mfaRequired === true;
}

export type LoginResponse = {
  admin: {
    id: string;
    email: string;
    name: string;
    roles: string[];
    permissions: string[];
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  refreshExpiresIn: string;
};

export function getToken(): string | null {
  return readAccessToken();
}

export function isAuthenticated(): boolean {
  return !!readAccessToken();
}

// Password sign-in has been removed from the platform: the API no longer
// exposes /auth/login. Google and mobile OTP below are the only ways in.

/**
 * Exchanges a Firebase ID token for an admin session. The backend re-verifies
 * the token and checks the email against its own allowlist — the browser never
 * decides who is allowed in.
 */
export async function loginWithGoogle(idToken: string): Promise<SignInResult> {
  const data = await apiFetch<SignInResult>("/auth/google", {
    method: "POST",
    auth: false,
    body: { idToken },
  });
  // Nothing to store yet when a second factor is owed.
  if (!isMfaChallenge(data)) storeTokens(data.accessToken, data.refreshToken);
  return data;
}

/**
 * Requests a sign-in code. The response is deliberately identical whether or
 * not the number is registered, so nothing can be learned from it.
 */
export async function requestLoginOtp(mobile: string) {
  return apiFetch<{ message: string; expiresAt: string }>("/auth/otp/request", {
    method: "POST",
    auth: false,
    body: { mobile },
  });
}

export async function loginWithOtp(mobile: string, otp: string): Promise<SignInResult> {
  const data = await apiFetch<SignInResult>("/auth/otp/verify", {
    method: "POST",
    auth: false,
    body: { mobile, otp },
  });
  if (!isMfaChallenge(data)) storeTokens(data.accessToken, data.refreshToken);
  return data;
}

/**
 * Second factor. Exchanges the challenge token for a real session; the code is
 * either a 6-digit TOTP or one of the recovery codes issued at enrolment.
 */
export async function completeMfaChallenge(mfaToken: string, code: string) {
  const data = await apiFetch<LoginResponse>("/auth/mfa", {
    method: "POST",
    auth: false,
    body: { mfaToken, code },
  });
  storeTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function logout() {
  try {
    if (readRefreshToken() || readAccessToken()) {
      await apiFetch<void>("/auth/logout", { method: "POST" });
    }
  } catch {
    /* the session is being discarded either way */
  } finally {
    clearTokens();
  }
}

export const currentAdminKey = ["auth", "me"] as const;

export function useCurrentAdmin(): UseQueryResult<CurrentAdmin> {
  return useQuery({
    queryKey: currentAdminKey,
    queryFn: () => apiFetch<CurrentAdmin>("/auth/me"),
    enabled: typeof window !== "undefined" && isAuthenticated(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** Clears every cached query — call after sign-out. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await logout();
    queryClient.clear();
    if (typeof window !== "undefined") window.location.assign("/login");
  };
}

export function hasPermission(admin: CurrentAdmin | undefined, permission: string): boolean {
  if (!admin) return false;
  return admin.permissions.includes("*") || admin.permissions.includes(permission);
}

export function initials(name?: string | null): string {
  if (!name) return "AD";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "AD"
  );
}
