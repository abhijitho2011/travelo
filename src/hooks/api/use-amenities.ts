/**
 * The platform-wide amenity catalogue, managed from Platform Settings.
 *
 * One catalogue for every hotel is the whole point: it is what makes "Wifi" the
 * same row everywhere, so cross-property reporting can group on `key` instead
 * of on whatever each General Manager typed. Hotels pick from this list in the
 * staff and owner apps; they never extend it.
 *
 * NOT the same thing as `features` / plan entitlements. Those decide what a
 * subscription includes; these are physical things in a room or a hotel.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type { Amenity, AmenityScope, NewAmenity, AmenityPatch } from "@/hooks/api/types";

type AmenityList = { items: Amenity[]; total: number };

export function useAmenities(scope: AmenityScope | "ALL") {
  return useQuery({
    queryKey: qk.amenities.list(scope),
    // Deliberately unfiltered by status: an archived entry still has to be
    // manageable from here, even though the pickers no longer offer it.
    queryFn: () =>
      apiFetch<AmenityList>("/settings/amenities", {
        query: scope === "ALL" ? {} : { scope },
      }),
    retry: false,
  });
}

export function useCreateAmenity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewAmenity) =>
      apiFetch<Amenity>("/settings/amenities", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.amenities.all }),
  });
}

export function useUpdateAmenity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AmenityPatch }) =>
      apiFetch<Amenity>(`/settings/amenities/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.amenities.all }),
  });
}

/**
 * DELETE archives rather than deletes, server-side.
 *
 * A hard delete would cascade every room, room-type and property attachment
 * away and silently rewrite what hundreds of live rooms advertise. Archiving
 * removes the entry from future pickers and leaves existing rooms untouched —
 * which is why the button says "Archive", not "Delete".
 */
export function useArchiveAmenity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Amenity>(`/settings/amenities/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.amenities.all }),
  });
}

/** Restore an archived entry — the same PATCH, named for what it means. */
export function useRestoreAmenity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Amenity>(`/settings/amenities/${id}`, {
        method: "PATCH",
        body: { status: "ACTIVE" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.amenities.all }),
  });
}

/**
 * Derive the slug from the display name, the way the create form suggests one.
 *
 * The key is the stable identity every client and every seed matches on, so it
 * is lower-case, underscore-separated and never contains punctuation. Exported
 * because the form needs it and because it is worth reading once.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}
