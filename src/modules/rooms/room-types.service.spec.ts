import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { RoomTypesService } from './room-types.service';
import { AmenitiesService } from './amenities.service';
import type { Database } from '../../database/database.module';

const MY_PROPERTY = 'prop-mine';
const TYPE_ID = '11111111-1111-4111-8111-111111111111';
const AMENITY_ID = '22222222-2222-4222-8222-222222222222';

function svc(db: MockDb) {
  return new RoomTypesService(
    db as unknown as Database,
    new AmenitiesService(db as unknown as Database),
  );
}

const typeRow = (over: Record<string, unknown> = {}) => ({
  id: TYPE_ID,
  propertyId: MY_PROPERTY,
  name: 'Deluxe',
  description: null,
  bedType: 'KING',
  bedCount: 1,
  maxOccupancy: 2,
  maxAdults: 2,
  maxChildren: 1,
  airConditioned: true,
  baseRate: 450000,
  currency: 'INR',
  sizeSqft: 320,
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
