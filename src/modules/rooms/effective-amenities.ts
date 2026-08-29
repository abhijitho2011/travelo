import type { Amenity } from '../../database/schema';

/** The shape every surface renders an amenity as. */
export interface AmenityRef {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  /** True when it came from the room type; false when it is a per-room extra. */
  fromRoomType: boolean;
}

type AmenityLike = Pick<Amenity, 'id' | 'key' | 'name' | 'icon'>;

/**
 * THE rule for what a room actually offers:
 *
 *     effective(room) = amenities(room.type)  ∪  extras(room)
 *
 * Two levels exist because both are real. Every Deluxe room has a minibar —
 * that belongs on the type, entered once. But only 304 has the bathtub, and
 * duplicating the whole type list onto every room to say so would guarantee
 * drift the first time the type changes. So the type carries the shared truth
 * and the room carries only the delta.
 *
 * This is the SINGLE implementation of that union. Nothing else anywhere may
 * merge these two lists — a second copy is how the two levels start disagreeing.
 *
 * Guarantees:
 *   - deduplicated BY ID, so an extra that repeats a type amenity appears once;
 *   - the type wins that tie, and `fromRoomType` says so, so a UI can render
 *     the shared set differently from the per-room delta;
 *   - deterministic order — type amenities first, then extras, each sorted by
 *     name — so two callers never see the same room in a different order;
 *   - pure: it takes rows and returns rows, touching no database, which is what
 *     makes it directly testable.
 */
export function effectiveAmenities(
  typeAmenities: readonly AmenityLike[],
  roomExtras: readonly AmenityLike[],
): AmenityRef[] {
  const byName = (a: AmenityLike, b: AmenityLike) => a.name.localeCompare(b.name);

  const seen = new Set<string>();
  const out: AmenityRef[] = [];

  for (const a of [...typeAmenities].sort(byName)) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push({ id: a.id, key: a.key, name: a.name, icon: a.icon ?? null, fromRoomType: true });
  }
  // An extra already provided by the type is not a second amenity; it is the
  // same one, and the type is where it is maintained.
  for (const a of [...roomExtras].sort(byName)) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push({ id: a.id, key: a.key, name: a.name, icon: a.icon ?? null, fromRoomType: false });
  }
  return out;
}

/**
 * The union across many rooms at once, so a list endpoint issues two queries
 * for the whole page instead of two per room.
 */
export function effectiveAmenitiesByRoom(
  rooms: readonly { id: string; roomTypeId: string }[],
  typeAmenitiesByType: ReadonlyMap<string, readonly AmenityLike[]>,
  extrasByRoom: ReadonlyMap<string, readonly AmenityLike[]>,
): Map<string, AmenityRef[]> {
  const out = new Map<string, AmenityRef[]>();
  for (const room of rooms) {
    out.set(
      room.id,
      effectiveAmenities(
        typeAmenitiesByType.get(room.roomTypeId) ?? [],
        extrasByRoom.get(room.id) ?? [],
      ),
    );
  }
  return out;
}
