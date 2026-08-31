import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { OwnerRoomsService } from './owner-rooms.service';
import { AmenitiesService } from './amenities.service';
import { StorageService } from '../storage/storage.service';
import { RoomTypesService } from './room-types.service';
import { RoomsService } from './rooms.service';
import type { Database } from '../../database/database.module';

const OWNER = 'owner-mine';
const PROPERTY = 'prop-1';
const POOL = '44444444-4444-4444-8444-444444444444';

function svc(db: MockDb) {
  const d = db as unknown as Database;
  const amenities = new AmenitiesService(d);
  const roomTypes = new RoomTypesService(d, amenities, new StorageService({}));
  // OwnerRoomsService recomputes the listing score after amenity changes; the
  // amenity tests don't assert on scoring, so a no-op stub suffices.
  const propertiesService = { recomputeCompleteness: async () => 0 } as never;
  return new OwnerRoomsService(
    d,
    amenities,
    roomTypes,
    new RoomsService(d, roomTypes, amenities, new StorageService({})),
    propertiesService,
  );
}

const propertyRow = { id: PROPERTY, name: 'Kochi Grand', roomCount: 40 };
const poolRow = {
  id: POOL,
  key: 'pool',
  name: 'Pool',
  scope: 'PROPERTY',
  icon: 'pool',
  sortOrder: 10,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * The owner reads their own hotels and nobody else's. The property is resolved
 * by (id, ownerId, not deleted) before any other query runs, so a foreign id is
 * a 404 rather than a leak.
 */
describe('OwnerRoomsService — ownership is checked first', () => {
  it('scopes the property lookup by owner AND live rows', async () => {
    const db = mockDb({ select: { properties: [[propertyRow]], property_amenities: [[]] } });
    await svc(db).getPropertyAmenities(OWNER, PROPERTY);

    const where = sqlText(db.wheresFor('properties')[0]);
    expect(where).toContain(OWNER);
    expect(where).toContain(PROPERTY);
    expect(where).toContain('deleted_at');
  });

  it('404s on every route for a property this owner does not hold', async () => {
    const calls: ((s: OwnerRoomsService) => Promise<unknown>)[] = [
      (s) => s.getPropertyAmenities(OWNER, PROPERTY),
      (s) => s.setPropertyAmenities(OWNER, PROPERTY, []),
      (s) => s.listRoomTypes(OWNER, PROPERTY, {}),
      (s) => s.listRooms(OWNER, PROPERTY, {}),
    ];
    for (const call of calls) {
      const db = mockDb({ select: { properties: [[]] } });
      await expect(call(svc(db))).rejects.toMatchObject({
        status: 404,
        response: { error: 'PROPERTY_NOT_FOUND' },
      });
      expect(db.updates).toEqual([]);
      expect(db.inserts).toEqual([]);
      expect(db.deletes).toEqual([]);
    }
  });
});

describe('OwnerRoomsService — property amenities', () => {
  it('returns the selection AND the catalogue, so the editor needs one call', async () => {
    const db = mockDb({
      select: {
        properties: [[propertyRow]],
        // The selection reads from the join table; the catalogue reads amenities.
        property_amenities: [[{ amenity: poolRow }]],
        amenities: [[poolRow]],
      },
    });
    const res = await svc(db).getPropertyAmenities(OWNER, PROPERTY);
    expect(res.selectedIds).toEqual([POOL]);
    expect(res.catalogue.map((a) => a.key)).toEqual(['pool']);
  });

  // PUT, not PATCH: the body is the complete desired set, so unticking a box
  // has to actually remove the row.
  it('clears then re-inserts, so an omitted id is removed', async () => {
    const db = mockDb({ select: { properties: [[propertyRow]], amenities: [[poolRow]] } });
    await svc(db).setPropertyAmenities(OWNER, PROPERTY, [POOL]);

    expect(db.deletes.some((d) => d.table === 'property_amenities')).toBe(true);
    const insert = db.inserts.find((i) => i.table === 'property_amenities');
    expect(insert?.values).toEqual([{ propertyId: PROPERTY, amenityId: POOL }]);
  });

  it('clears the set when handed an empty list, without inserting anything', async () => {
    const db = mockDb({ select: { properties: [[propertyRow]] } });
    const res = await svc(db).setPropertyAmenities(OWNER, PROPERTY, []);

    expect(res.selected).toEqual([]);
    expect(db.deletes.some((d) => d.table === 'property_amenities')).toBe(true);
    expect(db.inserts.filter((i) => i.table === 'property_amenities')).toEqual([]);
  });

  // "Bathtub" is not a hotel facility. The scope check is what keeps the two
  // levels from bleeding into each other.
  it('refuses a ROOM-scoped amenity on a property', async () => {
    const db = mockDb({
      select: {
        properties: [[propertyRow]],
        amenities: [[{ ...poolRow, key: 'bathtub', name: 'Bathtub', scope: 'ROOM' }]],
      },
    });
    await expect(svc(db).setPropertyAmenities(OWNER, PROPERTY, [POOL])).rejects.toMatchObject({
      status: 400,
      response: { error: 'AMENITY_SCOPE_MISMATCH' },
    });
    expect(db.deletes).toEqual([]);
  });
});

describe('OwnerRoomsService — reads delegate to the same services the staff app uses', () => {
  it('lists room types for the owned property', async () => {
    const db = mockDb({
      select: { properties: [[propertyRow]], room_types: [[], [{ count: 0 }]], rooms: [[]] },
    });
    const res = await svc(db).listRoomTypes(OWNER, PROPERTY, {});
    expect(res).toMatchObject({ items: [], total: 0 });
    // Scoped to the property, not to every property the owner holds.
    expect(sqlText(db.wheresFor('room_types')[0])).toContain(PROPERTY);
  });

  it('lists rooms for the owned property', async () => {
    const db = mockDb({ select: { properties: [[propertyRow]], rooms: [[], [{ count: 0 }]] } });
    const res = await svc(db).listRooms(OWNER, PROPERTY, {});
    expect(res).toMatchObject({ items: [], total: 0 });
    expect(sqlText(db.wheresFor('rooms')[0])).toContain(PROPERTY);
  });
});
