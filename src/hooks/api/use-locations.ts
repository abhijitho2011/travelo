/**
 * States and districts managed from Platform Settings.
 * The owner mobile app reads these lists to populate its location dropdowns.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type { LocationDistrict, LocationState } from "@/hooks/api/types";

export function useLocationStates() {
  return useQuery({
    queryKey: qk.locations.states,
    queryFn: () => apiFetch<LocationState[]>("/settings/locations/states"),
    retry: false,
  });
}

export function useCreateLocationState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<LocationState>("/settings/locations/states", { method: "POST", body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.locations.all }),
  });
}

export function useDeleteLocationState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/settings/locations/states/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.locations.all }),
  });
}

export function useLocationDistricts(stateId: string | null) {
  return useQuery({
    queryKey: qk.locations.districts(stateId ?? "none"),
    queryFn: () => apiFetch<LocationDistrict[]>(`/settings/locations/states/${stateId}/districts`),
    enabled: !!stateId,
    retry: false,
  });
}

export function useCreateLocationDistrict(stateId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<LocationDistrict>(`/settings/locations/states/${stateId}/districts`, {
        method: "POST",
        body: { name },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.locations.all }),
  });
}

export function useDeleteLocationDistrict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/settings/locations/districts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.locations.all }),
  });
}
