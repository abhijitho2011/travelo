/** The signed-in admin's own two-factor settings. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

export type MfaStatus = {
  enabled: boolean;
  /** False when the deployment has no MFA_SECRET_KEY: enrolment is refused. */
  available: boolean;
  unusedRecoveryCodes: number;
};

export type MfaEnrolment = {
  otpauthUrl: string;
  /** data:image/png;base64,… — rendered inline, nothing is fetched. */
  qrDataUri: string;
  recoveryCodes: string[];
  secret: string;
};

export const mfaKey = ["auth", "mfa"] as const;

export function useMfaStatus() {
  return useQuery({
    queryKey: mfaKey,
    queryFn: () => apiFetch<MfaStatus>("/profile/mfa"),
    staleTime: 60 * 1000,
    retry: false,
  });
}

/** Returns the recovery codes ONCE — nothing can show them again. */
export function useEnrollMfa() {
  return useMutation({
    mutationFn: () => apiFetch<MfaEnrolment>("/profile/mfa/enroll", { method: "POST" }),
  });
}

export function useVerifyMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<{ mfaEnabled: true }>("/profile/mfa/verify", { method: "POST", body: { code } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: mfaKey }),
  });
}

export function useDisableMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<{ mfaEnabled: false }>("/profile/mfa/disable", { method: "POST", body: { code } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: mfaKey }),
  });
}
