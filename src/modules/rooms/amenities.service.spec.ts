import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { AmenitiesService } from './amenities.service';
import { RoomsService } from './rooms.service';
import { RoomTypesService } from './room-types.service';
import { effectiveAmenities } from './effective-amenities';
import type { Database } from '../../database/database.module';

const ID = '33333333-3333-4333-8333-333333333333';

const amenityRow = (over: Record<string, unknown> = {}) => ({
  id: ID,
  key: 'bathtub',
  name: 'Bathtub',
  scope: 'ROOM',
  icon: 'bathtub',
  sortOrder: 60,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const svc = (db: MockDb) => new AmenitiesService(db as unknown as Database);

describe('AmenitiesService — the admin catalogue', () => {
  it('rejects a duplicate key as a typed conflict', async () => {
    const db = mockDb({});
    db.insert = (() => ({
      values: () => ({
        returning: () => Promise.reject({ code: '23505' }),
        then: (_r: unknown, j: (e: unknown) => void) => j({ code: '23505' }),
      }),
    })) as MockDb['insert'];

    await expect(
      svc(db).create({ key: 'bathtub', name: 'Bathtub', scope: 'ROOM' }),
    ).rejects.toMatchObject({ status: 409, response: { error: 'AMENITY_KEY_TAKEN' } });
  });

  it('404s on an unknown id rather than updating nothing silently', async () => {
    const db = mockDb({ select: { amenities: [[]] } });
    await expect(svc(db).update(ID, { name: 'x' })).rejects.toMatchObject({
      status: 404,
      response: { error: 'AMENITY_NOT_FOUND' },
    });
  });

  it('serves the picker with ACTIVE rows only', async () => {
    const db = mockDb({ select: { amenities: [[amenityRow()]] } });
    await svc(db).listActive('ROOM');
    const where = sqlText(db.wheresFor('amenities')[0]);
    expect(where).toContain('ACTIVE');
    expect(where).toContain('ROOM');
  });
});

/**
 * The archive rule is the reason "delete" is not a delete.
 *
 * A hard delete would cascade room_type_amenities / room_amenities /
 * property_amenities away and silently change what hundreds of live rooms
 * advertise. Archiving takes the entry out of future pickers and leaves every
 * existing attachment exactly where it is.
 */
describe('archiving an amenity does not break rooms already using it', () => {
  it('ARCHIVES rather than deleting the row', async () => {
    const db = mockDb({
      select: { amenities: [[amenityRow()]] },
      update: { amenities: [amenityRow({ status: 'ARCHIVED' })] },
    });
    const { after } = await svc(db).archive(ID);

    expect(after.status).toBe('ARCHIVED');
    expect(db.deletes).toEqual([]);
    expect(db.updates.find((u) => u.table === 'amenities')?.values).toMatchObject({
      status: 'ARCHIVED',
    });
  });

  it('touches no join table, so existing attachments survive', async () => {
    const db = mockDb({
      select: { amenities: [[amenityRow()]] },
      update: { amenities: [amenityRow({ status: 'ARCHIVED' })] },
    });
    await svc(db).archive(ID);

    for (const t of ['room_type_amenities', 'room_amenities', 'property_amenities']) {
      expect(db.deletes.filter((d) => d.table === t)).toEqual([]);
      expect(db.updates.filter((u) => u.table === t)).toEqual([]);
    }
  });

  it('keeps reporting the archived amenity on a room that already had it', () => {
    // The room's effective list is built from the JOIN rows, not from the
    // catalogue's status — so an archived entry keeps showing on 304.
    const archived = { id: ID, key: 'bathtub', name: 'Bathtub', icon: 'bathtub' };
    const out = effectiveAmenities([], [archived]);
    expect(out.map((a) => a.key)).toEqual(['bathtub']);
  });

  it('still accepts an ARCHIVED id when re-saving a room type that already holds it', async () => {
    // Otherwise every edit to a room type would fail the moment an admin
    // retired one of its amenities — the edit would be impossible to save.
    const db = mockDb({ select: { amenities: [[amenityRow({ status: 'ARCHIVED' })]] } });
    const resolved = await svc(db).resolveForScope([ID], 'ROOM');
    expect(resolved).toHaveLength(1);
  });

  it('drops it from the picker feed even so', async () => {
    const db = mockDb({ select: { amenities: [[]] } });
    const res = await svc(db).listActive('ROOM');
    expect(res.items).toEqual([]);
    expect(sqlText(db.wheresFor('amenities')[0])).toContain('ACTIVE');
  });

  it('leaves a room using it fully readable end to end', async () => {
    const roomRow = {
      id: 'room-1',
      propertyId: 'p1',
      roomTypeId: 't1',
      number: '304',
      floor: '3',
      status: 'AVAILABLE',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const db = mockDb({
      select: {
        rooms: [[roomRow]],
        room_types: [[{ id: 't1', name: 'Deluxe', bedType: 'KING', airConditioned: true }]],
        // The type's amenity join and the room's extras join both still resolve
        // the archived row.
        room_type_amenities: [[]],
        room_amenities: [[{ roomId: 'room-1', amenity: amenityRow({ status: 'ARCHIVED' }) }]],
      },
    });
    const amenities = new AmenitiesService(db as unknown as Database);
    const roomTypes = new RoomTypesService(db as unknown as Database, amenities);
    const rooms = new RoomsService(db as unknown as Database, roomTypes, amenities);

    const dto = await rooms.get('p1', 'room-1');
    expect(dto.amenities.map((a) => a.key)).toEqual(['bathtub']);
    expect(dto.roomTypeName).toBe('Deluxe');
  });
});

describe('AmenitiesService.resolveForScope — the attachment gate', () => {
  it('returns nothing for an empty request without touching the database', async () => {
    const db = mockDb({});
    expect(await svc(db).resolveForScope([], 'ROOM')).toEqual([]);
    expect(db.selects).toEqual([]);
  });

  it('refuses when an id does not resolve', async () => {
    const db = mockDb({ select: { amenities: [[amenityRow()]] } });
    await expect(svc(db).resolveForScope([ID, 'missing'], 'ROOM')).rejects.toMatchObject({
      response: { error: 'AMENITY_NOT_FOUND' },
    });
  });

  it('refuses a scope mismatch in either direction', async () => {
    const roomOnProperty = mockDb({ select: { amenities: [[amenityRow({ scope: 'ROOM' })]] } });
    await expect(svc(roomOnProperty).resolveForScope([ID], 'PROPERTY')).rejects.toMatchObject({
      response: { error: 'AMENITY_SCOPE_MISMATCH' },
    });

    const propOnRoom = mockDb({ select: { amenities: [[amenityRow({ scope: 'PROPERTY' })]] } });
    await expect(svc(propOnRoom).resolveForScope([ID], 'ROOM')).rejects.toMatchObject({
      response: { error: 'AMENITY_SCOPE_MISMATCH' },
    });
  });

  it('de-duplicates repeated ids before checking them', async () => {
    const db = mockDb({ select: { amenities: [[amenityRow()]] } });
    const out = await svc(db).resolveForScope([ID, ID, ID], 'ROOM');
    expect(out).toHaveLength(1);
  });
});
