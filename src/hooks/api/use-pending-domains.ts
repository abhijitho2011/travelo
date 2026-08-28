/**
 * Domains whose admin endpoints are not on the API yet.
 *
 * These hooks call the agreed paths so the screens light up the moment the
 * backend ships them. Until then the requests 404 and the screens render an
 * explicit "not available yet" state rather than invented data.
 */
import { useQuery } from "@tanstack/react-query";

import { apiFetch, type Paginated } from "@/lib/api";

export type Discount = {
  id: string;
  code: string;
  description: string | null;
  type: string;
  value: number;
  status: string;
  redemptions: number;
  maxRedemptions: number | null;
  validFrom: string | null;
  validUntil: string | null;
};

export function useDiscounts(params: { limit?: number; offset?: number; status?: string }) {
  return useQuery({
    queryKey: ["discounts", params],
    queryFn: () => apiFetch<Paginated<Discount>>("/discounts", { query: params }),
    retry: false,
  });
}

export type HotelStaff = {
  id: string;
  ownerId: string | null;
  propertyId: string | null;
  property: string | null;
  owner: string | null;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
};

export function useHotelStaff(params: { limit?: number; offset?: number; q?: string }) {
  return useQuery({
    queryKey: ["staff", params],
    queryFn: () => apiFetch<Paginated<HotelStaff>>("/staff", { query: params }),
    retry: false,
  });
}
