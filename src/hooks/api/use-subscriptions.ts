import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, type Paginated } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type { Subscription, SubscriptionEvent } from "@/hooks/api/types";

export type SubscriptionListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  ownerId?: string | undefined;
  status?: string | undefined;
};

export function useSubscriptions(params: SubscriptionListParams) {
  return useQuery({
    queryKey: qk.subscriptions.list(params),
    queryFn: () => apiFetch<Paginated<Subscription>>("/subscriptions", { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useSubscription(id: string) {
  return useQuery({
    queryKey: qk.subscriptions.detail(id),
    queryFn: () => apiFetch<Subscription>(`/subscriptions/${id}`),
    enabled: !!id,
  });
}

export function useSubscriptionEvents(id: string) {
  return useQuery({
    queryKey: qk.subscriptions.events(id),
    queryFn: () => apiFetch<SubscriptionEvent[]>(`/subscriptions/${id}/events`),
    enabled: !!id,
  });
}

function useSubscriptionInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.subscriptions.all });
    qc.invalidateQueries({ queryKey: qk.owners.all });
    qc.invalidateQueries({ queryKey: qk.dashboard });
    qc.invalidateQueries({ queryKey: qk.audit.all });
  };
}

export type CreateSubscriptionInput = {
  ownerId: string;
  planId: string;
  billingCycle?: "MONTHLY" | "ANNUAL" | undefined;
  propertyLimitOverride?: number | undefined;
  priceOverride?: number | undefined;
};

export function useCreateSubscription() {
  const invalidate = useSubscriptionInvalidation();
  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) =>
      apiFetch<Subscription>("/subscriptions", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export type UpdateSubscriptionInput = {
  planId?: string | undefined;
  billingCycle?: "MONTHLY" | "ANNUAL" | undefined;
  autoRenew?: boolean | undefined;
  propertyLimitOverride?: number | undefined;
  priceOverride?: number | undefined;
};

export function useUpdateSubscription() {
  const invalidate = useSubscriptionInvalidation();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSubscriptionInput & { id: string }) =>
      apiFetch<Subscription>(`/subscriptions/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useExtendSubscription() {
  const invalidate = useSubscriptionInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      days,
      reason,
      extendFrom,
    }: {
      id: string;
      days: number;
      reason?: string | undefined;
      extendFrom?: "expiry" | "now" | undefined;
    }) =>
      apiFetch(`/subscriptions/${id}/extend`, {
        method: "POST",
        body: { days, reason, extendFrom },
        headers: { "idempotency-key": `extend-${id}-${days}-${Date.now()}` },
      }),
    onSuccess: invalidate,
  });
}

export type SubscriptionAction = "suspend" | "reactivate" | "cancel";

export function useSubscriptionAction() {
  const invalidate = useSubscriptionInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: SubscriptionAction;
      reason?: string;
    }) =>
      apiFetch<Subscription>(`/subscriptions/${id}/${action}`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: invalidate,
  });
}
