import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type { Feature, Plan, PlanDetail } from "@/hooks/api/types";

export function usePlans() {
  return useQuery({
    queryKey: qk.plans.list,
    queryFn: () => apiFetch<Plan[]>("/plans"),
  });
}

export function usePlan(id: string) {
  return useQuery({
    queryKey: qk.plans.detail(id),
    queryFn: () => apiFetch<PlanDetail>(`/plans/${id}`),
    enabled: !!id,
  });
}

export function useFeatureCatalog() {
  return useQuery({
    queryKey: qk.plans.features,
    queryFn: () => apiFetch<Feature[]>("/plans/features"),
  });
}

export type CreatePlanInput = {
  name: string;
  description?: string | undefined;
  monthlyPrice: number;
  annualPrice: number;
  propertyLimit: number;
  currency?: string | undefined;
  features?: string[] | undefined;
};

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlanInput) =>
      apiFetch<PlanDetail>("/plans", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plans.all }),
  });
}

export type UpdatePlanInput = Partial<Omit<CreatePlanInput, "features">> & {
  status?: "ACTIVE" | "ARCHIVED" | undefined;
};

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePlanInput & { id: string }) =>
      apiFetch<PlanDetail>(`/plans/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plans.all }),
  });
}

export function useSetPlanFeatures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, features }: { id: string; features: string[] }) =>
      apiFetch(`/plans/${id}/features`, { method: "PUT", body: { features } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plans.all }),
  });
}

export function useArchivePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/plans/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plans.all }),
  });
}
