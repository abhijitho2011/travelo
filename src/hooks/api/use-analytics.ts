import { useQuery } from "@tanstack/react-query";

import { apiFetch, platformRootUrl } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type {
  AnalyticsOverview,
  DashboardData,
  HealthReport,
  RevenuePoint,
  SearchResults,
  StatusCount,
} from "@/hooks/api/types";

export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: () => apiFetch<DashboardData>("/dashboard"),
  });
}

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: qk.analytics.overview,
    queryFn: () => apiFetch<AnalyticsOverview>("/analytics/overview"),
  });
}

export function useSubscriptionHealth() {
  return useQuery({
    queryKey: qk.analytics.subscriptions,
    queryFn: () => apiFetch<StatusCount[]>("/analytics/subscriptions"),
  });
}

export function useOwnerBreakdown() {
  return useQuery({
    queryKey: qk.analytics.owners,
    queryFn: () => apiFetch<StatusCount[]>("/analytics/owners"),
  });
}

export function useRevenueSeries(from?: string, to?: string) {
  return useQuery({
    queryKey: qk.analytics.revenue(from, to),
    queryFn: () => apiFetch<RevenuePoint[]>("/analytics/revenue", { query: { from, to } }),
  });
}

export function useGlobalSearch(q: string, types?: string) {
  return useQuery({
    queryKey: qk.search(q, types),
    queryFn: () => apiFetch<SearchResults>("/search", { query: { q, types } }),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
}

/** `/health` lives at the platform root, outside the /api/v1/admin prefix. */
export function useSystemHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: () =>
      apiFetch<HealthReport>("/health", { baseUrl: platformRootUrl(), auth: false }),
    refetchInterval: 30_000,
  });
}
