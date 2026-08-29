/**
 * Cross-tenant hotel staff directory. Owners create General Managers and
 * Assistant GMs in the owner app; this reads them across every owner for the
 * admin monitoring view via `GET /staff`.
 */
import { useQuery } from "@tanstack/react-query";

import { apiFetch, type Paginated } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type { StaffMember } from "@/hooks/api/types";

export type StaffListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  /** Matches property name OR staff name. */
  q?: string | undefined;
  /** Staff member's state — a catalogue name, not an id. */
  state?: string | undefined;
  role?: string | undefined;
  status?: string | undefined;
  propertyId?: string | undefined;
  ownerId?: string | undefined;
};

export function useStaff(params: StaffListParams) {
  return useQuery({
    queryKey: qk.staff.list(params),
    queryFn: () => apiFetch<Paginated<StaffMember>>("/staff", { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useStaffMember(id: string) {
  return useQuery({
    queryKey: qk.staff.detail(id),
    queryFn: () => apiFetch<StaffMember>(`/staff/${id}`),
    enabled: !!id,
  });
}
