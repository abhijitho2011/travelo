import { effectiveAmenities, effectiveAmenitiesByRoom } from './effective-amenities';

const a = (id: string, name: string) => ({ id, key: name.toLowerCase(), name, icon: null });

const WIFI = a('a1', 'Wifi');
const TV = a('a2', 'TV');
const BATHTUB = a('a3', 'Bathtub');
const BALCONY = a('a4', 'Balcony');

/**
 * The union is the load-bearing rule of the whole rooms model: a room type
 * carries the shared truth, a room carries only its delta, and every screen
 * that says "what does 304 have?" must get the same answer.
 */
describe('effectiveAmenities — type ∪ room extras', () => {
  it('returns the type amenities when the room has no extras', () => {
    expect(effectiveAmenities([WIFI, TV], []).map((x) => x.key)).toEqual(['tv', 'wifi']);
  });

  it('returns the extras when the type has none', () => {
    expect(effectiveAmenities([], [BATHTUB]).map((x) => x.key)).toEqual(['bathtub']);
  });

  it('unions both levels', () => {
    const out = effectiveAmenities([WIFI, TV], [BATHTUB, BALCONY]);
    expect(out.map((x) => x.key).sort()).toEqual(['balcony', 'bathtub', 'tv', 'wifi']);
  });

  // The headline: only 304 has the bathtub, but every room has the wifi, and
  // ticking wifi on 304 as well must not make it appear twice.
  it('deduplicates an extra that repeats a type amenity', () => {
    const out = effectiveAmenities([WIFI, TV], [WIFI, BATHTUB]);
    expect(out).toHaveLength(3);
    expect(out.filter((x) => x.key === 'wifi')).toHaveLength(1);
  });

  it('lets the ROOM TYPE win the tie, so the shared source is what is reported', () => {
    const out = effectiveAmenities([WIFI], [WIFI]);
    expect(out).toEqual([{ id: 'a1', key: 'wifi', name: 'Wifi', icon: null, fromRoomType: true }]);
  });

  it('flags where each amenity came from', () => {
    const out = effectiveAmenities([WIFI], [BATHTUB]);
    expect(out.find((x) => x.key === 'wifi')!.fromRoomType).toBe(true);
    expect(out.find((x) => x.key === 'bathtub')!.fromRoomType).toBe(false);
  });

  it('deduplicates repeats WITHIN one level too', () => {
    expect(effectiveAmenities([WIFI, WIFI], [BATHTUB, BATHTUB])).toHaveLength(2);
  });

  it('is deterministic — type amenities first, each level sorted by name', () => {
    const out = effectiveAmenities([TV, WIFI], [BATHTUB, BALCONY]);
    expect(out.map((x) => x.name)).toEqual(['TV', 'Wifi', 'Balcony', 'Bathtub']);
  });

  it('does not mutate its inputs', () => {
    const type = [TV, WIFI];
    const extras = [BATHTUB];
    effectiveAmenities(type, extras);
    expect(type).toEqual([TV, WIFI]);
    expect(extras).toEqual([BATHTUB]);
  });

  it('normalises a missing icon to null rather than undefined', () => {
    const [out] = effectiveAmenities([{ id: 'x', key: 'k', name: 'K', icon: null }], []);
    expect(out.icon).toBeNull();
  });

  it('returns an empty list when neither level has anything', () => {
    expect(effectiveAmenities([], [])).toEqual([]);
  });
});

describe('effectiveAmenitiesByRoom — the batched form', () => {
  it('applies the type list to every room of that type, plus each room’s own extras', () => {
    const rooms = [
      { id: 'r1', roomTypeId: 't1' },
      { id: 'r2', roomTypeId: 't1' },
      { id: 'r3', roomTypeId: 't2' },
    ];
    const byType = new Map([
      ['t1', [WIFI, TV]],
      ['t2', [WIFI]],
    ]);
    // Only 304 (r2) has the bathtub.
    const extras = new Map([['r2', [BATHTUB]]]);

    const out = effectiveAmenitiesByRoom(rooms, byType, extras);
    expect(
      out
        .get('r1')!
        .map((x) => x.key)
        .sort(),
    ).toEqual(['tv', 'wifi']);
    expect(
      out
        .get('r2')!
        .map((x) => x.key)
        .sort(),
    ).toEqual(['bathtub', 'tv', 'wifi']);
    expect(out.get('r3')!.map((x) => x.key)).toEqual(['wifi']);
  });

  it('gives a room whose type has no amenities an empty list, not a crash', () => {
    const out = effectiveAmenitiesByRoom(
      [{ id: 'r1', roomTypeId: 'missing' }],
      new Map(),
      new Map(),
    );
    expect(out.get('r1')).toEqual([]);
  });
});
