import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, type Paginated } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type { Entitlements, Owner, OwnerOverview, Property } from "@/hooks/api/types";

export type OwnerListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  q?: string | undefined;
  status?: string | undefined;
};

export function useOwners(params: OwnerListParams) {
  return useQuery({
    queryKey: qk.owners.list(params),
    queryFn: () => apiFetch<Paginated<Owner>>("/owners", { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useOwner(id: string) {
  return useQuery({
    queryKey: qk.owners.detail(id),
    queryFn: () => apiFetch<Owner>(`/owners/${id}`),
    enabled: !!id,
  });
}

export function useOwnerOverview(id: string) {
  return useQuery({
    queryKey: qk.owners.overview(id),
    queryFn: () => apiFetch<OwnerOverview>(`/owners/${id}/overview`),
    enabled: !!id,
  });
}

export function useOwnerProperties(id: string) {
  return useQuery({
    queryKey: qk.owners.properties(id),
    queryFn: () => apiFetch<Property[]>(`/owners/${id}/properties`),
    enabled: !!id,
  });
}

export type CreateOwnerInput = {
  name: string;
  email: string;
  phone?: string | undefined;
  company?: string | undefined;
  gstNumber?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  address?: Record<string, unknown> | undefined;
};

export function useCreateOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOwnerInput) =>
      apiFetch<Owner>("/owners", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.owners.all });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useUpdateOwner(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateOwnerInput>) =>
      apiFetch<Owner>(`/owners/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.owners.all });
    },
  });
}

export type OwnerStatusAction = "activate" | "suspend" | "block" | "unblock";

export function useSetOwnerStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, reason }: { action: OwnerStatusAction; reason?: string }) =>
      apiFetch<Owner>(`/owners/${id}/${action}`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.owners.all });
      qc.invalidateQueries({ queryKey: qk.audit.all });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useOwnerEntitlements(ownerId: string) {
  return useQuery({
    queryKey: qk.owners.entitlements(ownerId),
    queryFn: () => apiFetch<Entitlements>(`/owners/${ownerId}/entitlements`),
    enabled: !!ownerId,
  });
}

export function useAddEntitlementOverride(ownerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { featureKey: string; granted: boolean; reason?: string }) =>
      apiFetch(`/owners/${ownerId}/entitlements/overrides`, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.owners.entitlements(ownerId) }),
  });
}

export function useRemoveEntitlementOverride(ownerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overrideId: string) =>
      apiFetch(`/owners/${ownerId}/entitlements/overrides/${overrideId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.owners.entitlements(ownerId) }),
  });
}
