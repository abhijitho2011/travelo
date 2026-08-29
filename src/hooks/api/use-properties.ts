import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, type Paginated } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type { IntegrationConnection, Property, PropertyOverview } from "@/hooks/api/types";

export type PropertyListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  q?: string | undefined;
  status?: string | undefined;
  ownerId?: string | undefined;
  /** Properties store location as text names, so filtering is by name. */
  state?: string | undefined;
  district?: string | undefined;
};

export function useProperties(params: PropertyListParams) {
  return useQuery({
    queryKey: qk.properties.list(params),
    queryFn: () => apiFetch<Paginated<Property>>("/properties", { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: qk.properties.detail(id),
    queryFn: () => apiFetch<Property>(`/properties/${id}`),
    enabled: !!id,
  });
}

export function usePropertyOverview(id: string) {
  return useQuery({
    queryKey: qk.properties.overview(id),
    queryFn: () => apiFetch<PropertyOverview>(`/properties/${id}/overview`),
    enabled: !!id,
  });
}

export function usePropertyIntegrations(id: string) {
  return useQuery({
    queryKey: qk.properties.integrations(id),
    queryFn: () => apiFetch<IntegrationConnection[]>(`/properties/${id}/integrations`),
    enabled: !!id,
  });
}

export type CreatePropertyInput = {
  ownerId: string;
  name: string;
  slug?: string | undefined;
  starRating?: number | undefined;
  category?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  country?: string | undefined;
  timezone?: string | undefined;
  roomCount?: number | undefined;
};

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePropertyInput) =>
      apiFetch<Property>("/properties", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.properties.all });
      qc.invalidateQueries({ queryKey: qk.owners.all });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}
