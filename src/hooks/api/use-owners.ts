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
  phone: string;
  company: string;
  /** Street address line. */
  address: string;
  pinCode: string;
  /** location_states.id */
  state: string;
  /** location_districts.id — must belong to `state`. */
  district: string;
  /** Required: an owner cannot be created without a subscription plan. */
  planId: string;
  gstNumber?: string | undefined;
  startsAt?: string | undefined;
  country?: string | undefined;
};

export type CreatedOwner = Owner & {
  subscription: {
    id: string;
    planId: string;
    plan: string;
    status: string;
    durationMonths: number;
    periodPrice: number;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  };
};

export function useCreateOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOwnerInput) =>
      apiFetch<CreatedOwner>("/owners", { method: "POST", body: input }),
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

/**
 * Soft-deletes an owner: the account leaves the platform, its subscription is
 * cancelled and its properties are archived. Billing history is preserved.
 */
export function useDeleteOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiFetch<{
        deleted: boolean;
        ownerId: string;
        subscriptionsCancelled: number;
        propertiesArchived: number;
      }>(`/owners/${id}`, { method: "DELETE", body: { reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.owners.all });
      qc.invalidateQueries({ queryKey: qk.properties.all });
      qc.invalidateQueries({ queryKey: qk.subscriptions.all });
      qc.invalidateQueries({ queryKey: qk.audit.all });
      qc.invalidateQueries({ queryKey: qk.dashboard });
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
