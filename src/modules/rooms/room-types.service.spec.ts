import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { RoomTypesService } from './room-types.service';
import { AmenitiesService } from './amenities.service';
import { StorageService } from '../storage/storage.service';
import type { Database } from '../../database/database.module';

const MY_PROPERTY = 'prop-mine';
const TYPE_ID = '11111111-1111-4111-8111-111111111111';
const AMENITY_ID = '22222222-2222-4222-8222-222222222222';

function svc(db: MockDb) {
  return new RoomTypesService(
    db as unknown as Database,
    new AmenitiesService(db as unknown as Database),
    // The local driver signs nothing and touches no network — presigned URLs
    // come back as `local://<key>`, which is all these tests need.
    new StorageService({}),
  );
}

const typeRow = (over: Record<string, unknown> = {}) => ({
  id: TYPE_ID,
  propertyId: MY_PROPERTY,
  name: 'Deluxe',
  description: null,
  unitKind: 'ROOM',
  unitRoomCount: 1,
  privatePool: false,
  bedType: 'KING',
  bedCount: 1,
  maxOccupancy: 2,
  baseOccupancy: 2,
  maxAdults: 2,
  maxChildren: 1,
  maxInfants: 0,
  code: null,
  floorLabel: null,
  smokingPolicy: 'NON_SMOKING',
  accessible: false,
  extraBedAvailable: false,
  extraBedType: null,
  extraBedCapacity: null,
  extraBedPricePaise: null,
  dynamicPricingEnabled: false,
  pricesIncludeTax: false,
  airConditioned: true,
  baseRate: 450000,
  currency: 'INR',
  sizeSqft: 320,
  sizeValue: 320,
  sizeUnit: 'SQFT',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

const input = {
  name: 'Deluxe',
  bedType: 'KING' as const,
  bedCount: 1,
  maxOccupancy: 2,
  maxAdults: 2,
  maxChildren: 1,
  airConditioned: true,
  baseRate: 450000,
};

describe('RoomTypesService — tenant isolation', () => {
  it('resolves a room type only inside the caller’s own property', async () => {
    const db = mockDb({ select: { room_types: [[typeRow()]] } });
    await svc(db).requireRoomType(MY_PROPERTY, TYPE_ID);

    const where = sqlText(db.wheresFor('room_types')[0]);
    expect(where).toContain(MY_PROPERTY);
    expect(where).toContain('deleted_at');
    expect(where).toContain('is null');
  });

  // Same rule as the staff team endpoints: a foreign row and a missing row are
  // indistinguishable, so property membership never leaks.
  it('404s for a room type belonging to another property', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(svc(db).requireRoomType(MY_PROPERTY, TYPE_ID)).rejects.toMatchObject({
      status: 404,
      response: { error: 'ROOM_TYPE_NOT_FOUND' },
    });
  });

  it('404s on update and delete of a foreign room type, without writing', async () => {
    for (const call of [
      (s: RoomTypesService) => s.update(MY_PROPERTY, TYPE_ID, { name: 'Renamed' }),
      (s: RoomTypesService) => s.remove(MY_PROPERTY, TYPE_ID),
    ]) {
      const db = mockDb({ select: { room_types: [[]] } });
      await expect(call(svc(db))).rejects.toMatchObject({ status: 404 });
      expect(db.updates).toEqual([]);
      expect(db.deletes).toEqual([]);
    }
  });

  it('always writes the caller’s own propertyId on create — never a client value', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await svc(db).create(MY_PROPERTY, input);
    expect(db.inserts.find((i) => i.table === 'room_types')?.values).toMatchObject({
      propertyId: MY_PROPERTY,
    });
  });

  it('scopes the list to the caller’s property and live rows', async () => {
    const db = mockDb({ select: { room_types: [[typeRow()], [{ count: 1 }]], rooms: [[]] } });
    await svc(db).list(MY_PROPERTY, {});
    const where = sqlText(db.wheresFor('room_types')[0]);
    expect(where).toContain(MY_PROPERTY);
    expect(where).toContain('deleted_at');
  });
});

describe('RoomTypesService — unique name per property', () => {
  it('turns the partial unique index into ROOM_TYPE_NAME_TAKEN on create', async () => {
    const db = mockDb({});
    db.insert = (() => ({
      values: () => ({
        returning: () => Promise.reject({ code: '23505' }),
        then: (_r: unknown, j: (e: unknown) => void) => j({ code: '23505' }),
      }),
    })) as MockDb['insert'];

    await expect(svc(db).create(MY_PROPERTY, input)).rejects.toMatchObject({
      status: 409,
      response: { error: 'ROOM_TYPE_NAME_TAKEN' },
    });
  });

  it('turns it into the same typed conflict on rename', async () => {
    const db = mockDb({ select: { room_types: [[typeRow()]] } });
    db.update = (() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.reject({ code: '23505' }),
          then: (_r: unknown, j: (e: unknown) => void) => j({ code: '23505' }),
        }),
      }),
    })) as MockDb['update'];

    await expect(svc(db).update(MY_PROPERTY, TYPE_ID, { name: 'Deluxe' })).rejects.toMatchObject({
      response: { error: 'ROOM_TYPE_NAME_TAKEN' },
    });
  });
});

describe('RoomTypesService — air conditioning is a column, not an amenity', () => {
  it('persists airConditioned as a boolean on the room type', async () => {
    const db = mockDb({ insert: { room_types: [typeRow({ airConditioned: false })] } });
    await svc(db).create(MY_PROPERTY, { ...input, airConditioned: false });
    expect(db.inserts.find((i) => i.table === 'room_types')?.values).toMatchObject({
      airConditioned: false,
    });
  });

  it('reports it on the DTO, so a client never has to infer AC from an amenity list', async () => {
    const dto = RoomTypesService.toDto(typeRow({ airConditioned: true }) as never, []);
    expect(dto.airConditioned).toBe(true);
    expect(dto.amenities).toEqual([]);
  });
});

describe('RoomTypesService — villa unit kinds', () => {
  it('defaults to a 1-room ROOM unit when the client sends nothing', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await svc(db).create(MY_PROPERTY, { ...input });
    expect(db.inserts.find((i) => i.table === 'room_types')?.values).toMatchObject({
      unitKind: 'ROOM',
      unitRoomCount: 1,
      privatePool: false,
    });
  });

  it('persists a multi-room private-pool villa as sent', async () => {
    const db = mockDb({
      insert: { room_types: [typeRow({ unitKind: 'VILLA', unitRoomCount: 3, privatePool: true })] },
    });
    await svc(db).create(MY_PROPERTY, {
      ...input,
      unitKind: 'VILLA' as const,
      unitRoomCount: 3,
      privatePool: true,
    });
    expect(db.inserts.find((i) => i.table === 'room_types')?.values).toMatchObject({
      unitKind: 'VILLA',
      unitRoomCount: 3,
      privatePool: true,
    });
  });

  it('forces unitRoomCount back to 1 when a ROOM kind is created with a stray count', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await svc(db).create(MY_PROPERTY, { ...input, unitKind: 'ROOM' as const, unitRoomCount: 4 });
    expect(db.inserts.find((i) => i.table === 'room_types')?.values).toMatchObject({
      unitRoomCount: 1,
    });
  });

  it('resets the room count when a villa is converted back to a plain room', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow({ unitKind: 'VILLA', unitRoomCount: 3 })]],
        room_type_amenities: [[]],
      },
      update: { room_types: [typeRow()] },
    });
    await svc(db).update(MY_PROPERTY, TYPE_ID, { unitKind: 'ROOM' });
    expect(db.updates.find((u) => u.table === 'room_types')?.values).toMatchObject({
      unitKind: 'ROOM',
      unitRoomCount: 1,
    });
  });

  it('reports unit fields on the DTO', () => {
    const dto = RoomTypesService.toDto(
      typeRow({ unitKind: 'VILLA', unitRoomCount: 2, privatePool: true }) as never,
      [],
    );
    expect(dto.unitKind).toBe('VILLA');
    expect(dto.unitRoomCount).toBe(2);
    expect(dto.privatePool).toBe(true);
  });
});

describe('RoomTypesService — amenity attachment', () => {
  it('refuses a PROPERTY-scoped amenity on a room type', async () => {
    const db = mockDb({
      select: { amenities: [[{ id: AMENITY_ID, key: 'pool', name: 'Pool', scope: 'PROPERTY' }]] },
    });
    await expect(
      svc(db).create(MY_PROPERTY, { ...input, amenityIds: [AMENITY_ID] }),
    ).rejects.toMatchObject({ status: 400, response: { error: 'AMENITY_SCOPE_MISMATCH' } });
    expect(db.inserts).toEqual([]);
  });

  it('refuses an amenity id that is not in the catalogue at all', async () => {
    const db = mockDb({ select: { amenities: [[]] } });
    await expect(
      svc(db).create(MY_PROPERTY, { ...input, amenityIds: [AMENITY_ID] }),
    ).rejects.toMatchObject({ response: { error: 'AMENITY_NOT_FOUND' } });
  });

  it('replaces the whole set when amenityIds is present (PUT semantics)', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow()]],
        amenities: [[{ id: AMENITY_ID, key: 'wifi', name: 'Wifi', scope: 'ROOM', icon: null }]],
      },
      update: { room_types: [typeRow()] },
    });
    await svc(db).update(MY_PROPERTY, TYPE_ID, { amenityIds: [AMENITY_ID] });

    // Clear, then re-attach — both inside the one transaction.
    expect(db.deletes.some((d) => d.table === 'room_type_amenities')).toBe(true);
    expect(db.inserts.some((i) => i.table === 'room_type_amenities')).toBe(true);
  });

  it('leaves the set alone when amenityIds is absent', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow()]], room_type_amenities: [[]] },
      update: { room_types: [typeRow({ baseRate: 500000 })] },
    });
    await svc(db).update(MY_PROPERTY, TYPE_ID, { baseRate: 500000 });
    expect(db.deletes.filter((d) => d.table === 'room_type_amenities')).toEqual([]);
  });

  it('rejects an update carrying nothing at all', async () => {
    const db = mockDb({ select: { room_types: [[typeRow()]] } });
    await expect(svc(db).update(MY_PROPERTY, TYPE_ID, {})).rejects.toMatchObject({
      response: { error: 'NOTHING_TO_UPDATE' },
    });
  });
});

describe('RoomTypesService — deletion protects live rooms', () => {
  it('refuses to delete a type that still has rooms, and says how many', async () => {
    const db = mockDb({ select: { room_types: [[typeRow()]], rooms: [[{ count: 12 }]] } });
    await expect(svc(db).remove(MY_PROPERTY, TYPE_ID)).rejects.toMatchObject({
      status: 409,
      response: {
        error: 'ROOM_TYPE_IN_USE',
        message: 'This room type still has 12 room(s). Move or delete them first.',
      },
    });
    expect(db.updates).toEqual([]);
  });

  it('soft-deletes and archives when no rooms reference it', async () => {
    const db = mockDb({ select: { room_types: [[typeRow()]], rooms: [[{ count: 0 }]] } });
    const res = await svc(db).remove(MY_PROPERTY, TYPE_ID);

    expect(res.deleted).toBe(true);
    const values = db.updates.find((u) => u.table === 'room_types')!.values!;
    expect(values).toHaveProperty('deletedAt');
    expect(values).toMatchObject({ status: 'ARCHIVED' });
    expect(db.deletes.filter((d) => d.table === 'room_types')).toEqual([]);
  });

  it('counts only LIVE rooms when deciding', async () => {
    const db = mockDb({ select: { room_types: [[typeRow()]], rooms: [[{ count: 0 }]] } });
    await svc(db).remove(MY_PROPERTY, TYPE_ID);
    expect(sqlText(db.wheresFor('rooms')[0])).toContain('deleted_at');
  });
});

describe('RoomTypesService — occupancy is validated against the MERGED row', () => {
  it('refuses a maximum occupancy below the base occupancy', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await expect(
      svc(db).create(MY_PROPERTY, { ...input, maxOccupancy: 2, baseOccupancy: 4 }),
    ).rejects.toMatchObject({ status: 400, response: { error: 'OCCUPANCY_INVALID' } });
    expect(db.inserts).toEqual([]);
  });

  it('refuses a maximum occupancy that cannot fit the adults it admits', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await expect(
      svc(db).create(MY_PROPERTY, { ...input, maxOccupancy: 2, maxAdults: 4, baseOccupancy: 2 }),
    ).rejects.toMatchObject({ response: { error: 'OCCUPANCY_INVALID' } });
    expect(db.inserts).toEqual([]);
  });

  // The headline: a two-step edit must not walk past the rule. Lowering
  // maxOccupancy alone is weighed against the baseOccupancy already stored.
  it('weighs a lone maxOccupancy edit against the STORED base occupancy', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow({ baseOccupancy: 4, maxOccupancy: 6, maxAdults: 4 })]] },
      update: { room_types: [typeRow()] },
    });
    await expect(svc(db).update(MY_PROPERTY, TYPE_ID, { maxOccupancy: 2 })).rejects.toMatchObject({
      response: { error: 'OCCUPANCY_INVALID' },
    });
    expect(db.updates).toEqual([]);
  });

  it('rejects a negative extra-bed price as RATE_INVALID', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await expect(
      svc(db).create(MY_PROPERTY, { ...input, extraBedPricePaise: -1 }),
    ).rejects.toMatchObject({ status: 400, response: { error: 'RATE_INVALID' } });
  });

  it('accepts a well-formed occupancy split and persists every part of it', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await svc(db).create(MY_PROPERTY, {
      ...input,
      maxOccupancy: 4,
      baseOccupancy: 2,
      maxAdults: 3,
      maxChildren: 2,
      maxInfants: 1,
      extraBedAvailable: true,
      extraBedType: 'EXTRA_BED' as const,
      extraBedCapacity: 1,
      extraBedPricePaise: 90000,
    });
    expect(db.inserts.find((i) => i.table === 'room_types')?.values).toMatchObject({
      maxOccupancy: 4,
      baseOccupancy: 2,
      maxAdults: 3,
      maxChildren: 2,
      maxInfants: 1,
      extraBedAvailable: true,
      extraBedType: 'EXTRA_BED',
      extraBedCapacity: 1,
      extraBedPricePaise: 90000,
    });
  });
});

describe('RoomTypesService — size_sqft stays canonical', () => {
  it('converts square metres to square feet so existing readers keep working', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await svc(db).create(MY_PROPERTY, { ...input, sizeValue: 30, sizeUnit: 'SQM' as const });
    expect(db.inserts.find((i) => i.table === 'room_types')?.values).toMatchObject({
      sizeValue: 30,
      sizeUnit: 'SQM',
      // round(30 * 10.7639)
      sizeSqft: 323,
    });
  });

  it('stores square feet unchanged', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await svc(db).create(MY_PROPERTY, { ...input, sizeValue: 420, sizeUnit: 'SQFT' as const });
    expect(db.inserts.find((i) => i.table === 'room_types')?.values).toMatchObject({
      sizeValue: 420,
      sizeUnit: 'SQFT',
      sizeSqft: 420,
    });
  });

  it('fills value/unit in for a legacy caller that sends only sizeSqft', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await svc(db).create(MY_PROPERTY, { ...input, sizeSqft: 500 });
    expect(db.inserts.find((i) => i.table === 'room_types')?.values).toMatchObject({
      sizeSqft: 500,
      sizeValue: 500,
      sizeUnit: 'SQFT',
    });
  });

  it('re-converts on update when only the unit changes', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow({ sizeValue: 30, sizeUnit: 'SQFT', sizeSqft: 30 })]] },
      update: { room_types: [typeRow()] },
    });
    await svc(db).update(MY_PROPERTY, TYPE_ID, { sizeUnit: 'SQM' });
    expect(db.updates.find((u) => u.table === 'room_types')?.values).toMatchObject({
      sizeValue: 30,
      sizeUnit: 'SQM',
      sizeSqft: 323,
    });
  });
});

describe('RoomTypesService — sleeping arrangement', () => {
  const beds = [
    { bedType: 'KING' as const, quantity: 1 },
    { bedType: 'SOFA_BED' as const, quantity: 2 },
  ];

  it('writes one row per bed group, in the order sent', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()], room_type_beds: [] } });
    await svc(db).create(MY_PROPERTY, { ...input, beds });
    expect(db.inserts.find((i) => i.table === 'room_type_beds')?.values).toEqual([
      { roomTypeId: TYPE_ID, bedType: 'KING', quantity: 1, sortOrder: 0 },
      { roomTypeId: TYPE_ID, bedType: 'SOFA_BED', quantity: 2, sortOrder: 1 },
    ]);
  });

  // The denormalised pair is what the rooms board and reservations read; it
  // must follow the FIRST bed row or the two views contradict each other.
  it('syncs room_types.bedType/bedCount from the FIRST bed row on create', async () => {
    const db = mockDb({ insert: { room_types: [typeRow()] } });
    await svc(db).create(MY_PROPERTY, {
      ...input,
      bedType: 'DOUBLE' as const,
      bedCount: 9,
      beds,
    });
    expect(db.inserts.find((i) => i.table === 'room_types')?.values).toMatchObject({
      bedType: 'KING',
      bedCount: 1,
    });
  });

  it('replaces the whole set on update, and re-syncs the pair', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow()]], room_type_beds: [[]], room_type_amenities: [[]] },
      update: { room_types: [typeRow()] },
    });
    await svc(db).update(MY_PROPERTY, TYPE_ID, {
      beds: [{ bedType: 'TWIN', quantity: 2 }],
    });
    expect(db.deletes.some((d) => d.table === 'room_type_beds')).toBe(true);
    expect(db.inserts.some((i) => i.table === 'room_type_beds')).toBe(true);
    expect(db.updates.find((u) => u.table === 'room_types')?.values).toMatchObject({
      bedType: 'TWIN',
      bedCount: 2,
    });
  });

  it('leaves the arrangement alone when beds is absent', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow()]], room_type_amenities: [[]], room_type_beds: [[]] },
      update: { room_types: [typeRow({ baseRate: 500000 })] },
    });
    await svc(db).update(MY_PROPERTY, TYPE_ID, { baseRate: 500000 });
    expect(db.deletes.filter((d) => d.table === 'room_type_beds')).toEqual([]);
  });

  it('returns the arrangement on get, alongside photos', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow()]],
        room_type_amenities: [[]],
        rooms: [[]],
        room_type_beds: [
          [{ id: 'bed-1', roomTypeId: TYPE_ID, bedType: 'KING', quantity: 1, sortOrder: 0 }],
        ],
        room_type_photos: [
          [
            {
              id: 'photo-1',
              roomTypeId: TYPE_ID,
              storageKey: 'room-types/t/a.jpg',
              contentType: 'image/jpeg',
              sizeBytes: 10,
              category: 'ROOM',
              isPrimary: true,
              sortOrder: 0,
              createdAt: new Date(),
            },
          ],
        ],
      },
    });
    const dto = await svc(db).get(MY_PROPERTY, TYPE_ID);
    expect(dto.beds).toEqual([{ id: 'bed-1', bedType: 'KING', quantity: 1, sortOrder: 0 }]);
    expect(dto.photos).toMatchObject([{ id: 'photo-1', isPrimary: true, category: 'ROOM' }]);
    expect(dto.primaryPhotoUrl).toBe('local://room-types/t/a.jpg');
  });
});

describe('RoomTypesService — list carries the thumbnail and the unit count', () => {
  it('reports unitCount from LIVE rooms and a presigned primaryPhotoUrl', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow()], [{ count: 1 }]],
        room_type_amenities: [[]],
        rooms: [[{ roomTypeId: TYPE_ID, n: 7 }]],
        room_type_photos: [[{ roomTypeId: TYPE_ID, storageKey: 'room-types/t/cover.jpg' }]],
      },
    });
    const res = await svc(db).list(MY_PROPERTY, {});
    expect(res.items[0]).toMatchObject({
      unitCount: 7,
      roomCount: 7,
      primaryPhotoUrl: 'local://room-types/t/cover.jpg',
    });
  });

  it('reports a null thumbnail when the type has no primary photo', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow()], [{ count: 1 }]],
        room_type_amenities: [[]],
        rooms: [[]],
        room_type_photos: [[]],
      },
    });
    const res = await svc(db).list(MY_PROPERTY, {});
    expect(res.items[0]).toMatchObject({ unitCount: 0, primaryPhotoUrl: null });
  });

  // One grouped query each — the list screen must never fan out per row.
  it('fetches counts and thumbnails in ONE query each, not one per row', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow(), typeRow({ id: 'other' })], [{ count: 2 }]],
        room_type_amenities: [[]],
        rooms: [[]],
        room_type_photos: [[]],
      },
    });
    await svc(db).list(MY_PROPERTY, {});
    expect(db.selects.filter((s) => s.table === 'rooms')).toHaveLength(1);
    expect(db.selects.filter((s) => s.table === 'room_type_photos')).toHaveLength(1);
  });
});
