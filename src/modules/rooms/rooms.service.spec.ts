import { HttpException } from '@nestjs/common';
import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { RoomsService } from './rooms.service';
import { RoomTypesService } from './room-types.service';
import { AmenitiesService } from './amenities.service';
import { StorageService } from '../storage/storage.service';
import type { Database } from '../../database/database.module';

const MY_PROPERTY = 'prop-mine';
const OTHER_PROPERTY = 'prop-theirs';
const TYPE_ID = '11111111-1111-4111-8111-111111111111';

function svc(db: MockDb) {
  const amenities = new AmenitiesService(db as unknown as Database);
  const roomTypes = new RoomTypesService(
    db as unknown as Database,
    amenities,
    new StorageService({}),
  );
  return new RoomsService(db as unknown as Database, roomTypes, amenities, new StorageService({}));
}

const roomRow = (over: Record<string, unknown> = {}) => ({
  id: 'room-1',
  propertyId: MY_PROPERTY,
  roomTypeId: TYPE_ID,
  number: '301',
  floor: '3',
  status: 'AVAILABLE',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

const typeRow = { id: TYPE_ID, propertyId: MY_PROPERTY, name: 'Deluxe', deletedAt: null };

describe('RoomsService — tenant isolation', () => {
  it('scopes every room lookup to the caller’s own property AND excludes deleted rows', async () => {
    const db = mockDb({ select: { rooms: [[roomRow()]] } });
    await svc(db).requireRoom(MY_PROPERTY, 'room-1');

    const where = sqlText(db.wheresFor('rooms')[0]);
    expect(where).toContain(MY_PROPERTY);
    expect(where).toContain('deleted_at');
    expect(where).toContain('is null');
  });

  // A room at ANOTHER hotel must be indistinguishable from a room that does not
  // exist. A 403 would confirm the row is real and leak which property it is at.
  it('404s — not 403 — for a room belonging to another property', async () => {
    const db = mockDb({ select: { rooms: [[]] } });
    await expect(svc(db).requireRoom(MY_PROPERTY, 'room-at-other-hotel')).rejects.toMatchObject({
      status: 404,
      response: { error: 'ROOM_NOT_FOUND' },
    });
  });

  it('never queries a room by id alone', async () => {
    const db = mockDb({ select: { rooms: [[]] } });
    await expect(svc(db).requireRoom(MY_PROPERTY, 'x')).rejects.toThrow(HttpException);
    expect(sqlText(db.wheresFor('rooms')[0])).toContain('property_id');
  });

  it('refuses to create a room against a room type from another property', async () => {
    // The room-type resolution is the first query and comes back empty because
    // the type belongs to OTHER_PROPERTY.
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(
      svc(db).create(MY_PROPERTY, { roomTypeId: TYPE_ID, number: '301' }),
    ).rejects.toMatchObject({ status: 404, response: { error: 'ROOM_TYPE_NOT_FOUND' } });
    expect(db.inserts.filter((i) => i.table === 'rooms')).toEqual([]);
  });

  it('refuses to move a room onto a room type from another property', async () => {
    const db = mockDb({ select: { rooms: [[roomRow()]], room_types: [[]] } });
    await expect(
      svc(db).update(MY_PROPERTY, 'room-1', { roomTypeId: TYPE_ID }),
    ).rejects.toMatchObject({ response: { error: 'ROOM_TYPE_NOT_FOUND' } });
    expect(db.updates.filter((u) => u.table === 'rooms')).toEqual([]);
  });
});

describe('RoomsService — unique room number per property', () => {
  it('surfaces the partial unique index as ROOM_NUMBER_TAKEN, naming the number', async () => {
    const db = mockDb({ select: { room_types: [[typeRow]] } });
    // The insert trips the (property_id, number) partial unique.
    db.insert = (() => ({
      values: () => ({
        returning: () => Promise.reject({ code: '23505' }),
        then: (_r: unknown, j: (e: unknown) => void) => j({ code: '23505' }),
      }),
    })) as MockDb['insert'];

    await expect(
      svc(db).create(MY_PROPERTY, { roomTypeId: TYPE_ID, number: '301' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'ROOM_NUMBER_TAKEN', message: 'Room 301 already exists at this hotel' },
    });
  });

  /**
   * The index is PARTIAL — `WHERE deleted_at IS NULL`. That is what lets a hotel
   * delete room 301 and later create a new 301, which is a thing hotels do when
   * a floor is renumbered. The predicate is asserted here because the guarantee
   * lives in the index definition, not in code.
   */
  it('scopes the duplicate check to LIVE rooms, so a soft-deleted number is reusable', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow]], rooms: [[], [{ count: 1 }]] },
      insert: { rooms: [roomRow({ number: '301' })] },
      update: { properties: [] },
    });
    await svc(db).bulkCreate(MY_PROPERTY, { roomTypeId: TYPE_ID, numbers: ['301'] });

    // The clash query only looks at rows that are still live; the deleted 301 is
    // invisible to it, so 301 is created rather than reported as taken.
    const clashWhere = sqlText(db.wheresFor('rooms')[0]);
    expect(clashWhere).toContain('deleted_at');
    expect(clashWhere).toContain('is null');
    expect(db.inserts.some((i) => i.table === 'rooms')).toBe(true);
  });
});

describe('RoomsService.expandNumbers — bulk input', () => {
  it('takes an explicit list', () => {
    expect(
      RoomsService.expandNumbers({ roomTypeId: TYPE_ID, numbers: ['301', '302', '305'] }),
    ).toEqual(['301', '302', '305']);
  });

  it('expands a numeric range with a prefix', () => {
    expect(
      RoomsService.expandNumbers({ roomTypeId: TYPE_ID, prefix: '3', from: 1, to: 4, pad: 2 }),
    ).toEqual(['301', '302', '303', '304']);
  });

  it('expands a bare range without a prefix or padding', () => {
    expect(RoomsService.expandNumbers({ roomTypeId: TYPE_ID, from: 8, to: 10 })).toEqual([
      '8',
      '9',
      '10',
    ]);
  });

  it('tolerates a reversed range', () => {
    expect(RoomsService.expandNumbers({ roomTypeId: TYPE_ID, from: 3, to: 1 })).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  // Otherwise the insert would trip its own unique index mid-batch.
  it('de-duplicates within the request itself', () => {
    expect(
      RoomsService.expandNumbers({ roomTypeId: TYPE_ID, numbers: ['301', '301', '302'] }),
    ).toEqual(['301', '302']);
  });

  it('trims and drops blank entries', () => {
    expect(
      RoomsService.expandNumbers({ roomTypeId: TYPE_ID, numbers: [' 301 ', '', '  '] }),
    ).toEqual(['301']);
  });

  it('refuses a range larger than the bulk ceiling, saying how big it was', () => {
    expect(() => RoomsService.expandNumbers({ roomTypeId: TYPE_ID, from: 1, to: 500 })).toThrow(
      HttpException,
    );
    try {
      RoomsService.expandNumbers({ roomTypeId: TYPE_ID, from: 1, to: 500 });
    } catch (err) {
      const res = (err as HttpException).getResponse() as { error: string; message: string };
      expect(res.error).toBe('BULK_TOO_LARGE');
      expect(res.message).toContain('500');
    }
  });

  it('returns nothing when neither form is supplied', () => {
    expect(RoomsService.expandNumbers({ roomTypeId: TYPE_ID })).toEqual([]);
  });
});

describe('RoomsService.bulkCreate — transactional, duplicate-safe', () => {
  it('creates the new numbers, SKIPS the ones that exist, and names the skips', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow]],
        // 1st rooms select = the clash read; 2nd = the recount.
        rooms: [[{ number: '302' }], [{ count: 3 }]],
      },
      insert: {
        rooms: [roomRow({ id: 'r1', number: '301' }), roomRow({ id: 'r3', number: '303' })],
      },
      update: { properties: [] },
    });

    const res = await svc(db).bulkCreate(MY_PROPERTY, {
      roomTypeId: TYPE_ID,
      floor: '3',
      numbers: ['301', '302', '303'],
    });

    expect(res.requested).toBe(3);
    expect(res.created).toBe(2);
    expect(res.skipped).toEqual(['302']);

    // Exactly one insert statement for the whole batch, inside the transaction.
    const inserted = db.inserts.filter((i) => i.table === 'rooms');
    expect(inserted).toHaveLength(1);
    expect((inserted[0].values as unknown as { number: string }[]).map((v) => v.number)).toEqual([
      '301',
      '303',
    ]);
  });

  it('reads the clash set with the property scope and the live-rows filter', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow]], rooms: [[], [{ count: 1 }]] },
      insert: { rooms: [roomRow()] },
      update: { properties: [] },
    });
    await svc(db).bulkCreate(MY_PROPERTY, { roomTypeId: TYPE_ID, numbers: ['301'] });
    const where = sqlText(db.wheresFor('rooms')[0]);
    expect(where).toContain(MY_PROPERTY);
    expect(where).toContain('deleted_at');
  });

  it('inserts nothing when every requested number already exists', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow]],
        rooms: [[{ number: '301' }, { number: '302' }], [{ count: 2 }]],
      },
      update: { properties: [] },
    });
    const res = await svc(db).bulkCreate(MY_PROPERTY, {
      roomTypeId: TYPE_ID,
      numbers: ['301', '302'],
    });
    expect(res.created).toBe(0);
    expect(res.skipped).toEqual(['301', '302']);
    expect(db.inserts.filter((i) => i.table === 'rooms')).toEqual([]);
  });

  it('refuses an empty expansion rather than committing a no-op', async () => {
    const db = mockDb({ select: { room_types: [[typeRow]] } });
    await expect(svc(db).bulkCreate(MY_PROPERTY, { roomTypeId: TYPE_ID })).rejects.toMatchObject({
      response: { error: 'NOTHING_TO_CREATE' },
    });
  });

  it('validates the room type BEFORE opening a transaction', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(
      svc(db).bulkCreate(MY_PROPERTY, { roomTypeId: TYPE_ID, numbers: ['301'] }),
    ).rejects.toMatchObject({ response: { error: 'ROOM_TYPE_NOT_FOUND' } });
    expect(db.inserts).toEqual([]);
  });
});

/**
 * `properties.room_count` used to be a number somebody typed. Where rooms
 * exist it is now derived — recomputed from live rows in the SAME transaction
 * as the write that changed them, so the portfolio total can never drift.
 */
describe('properties.room_count stays derived', () => {
  it('recomputes the count from live rooms and writes it to the property', async () => {
    const db = mockDb({ select: { rooms: [[{ count: 7 }]] }, update: { properties: [] } });
    const count = await RoomsService.recountRooms(db as never, MY_PROPERTY);

    expect(count).toBe(7);
    const write = db.updates.find((u) => u.table === 'properties');
    expect(write?.values).toMatchObject({ roomCount: 7 });
    // Counted from live rooms at this property only.
    const where = sqlText(db.wheresFor('rooms')[0]);
    expect(where).toContain(MY_PROPERTY);
    expect(where).toContain('deleted_at');
  });

  it('recomputes on room CREATE', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow]],
        // [] — the number-availability probe, which must find nothing.
        rooms: [[], [{ count: 4 }], [roomRow()]],
        amenities: [[]],
      },
      insert: { rooms: [roomRow()] },
      update: { properties: [] },
    });
    const res = await svc(db).create(MY_PROPERTY, { roomTypeId: TYPE_ID, number: '301' });
    expect(res.propertyRoomCount).toBe(4);
    expect(db.updates.find((u) => u.table === 'properties')?.values).toMatchObject({
      roomCount: 4,
    });
  });

  it('recomputes on room DELETE', async () => {
    const db = mockDb({
      select: { rooms: [[roomRow()], [{ count: 2 }]], room_types: [[typeRow]] },
      update: { properties: [], rooms: [] },
    });
    const res = await svc(db).remove(MY_PROPERTY, 'room-1');
    expect(res.propertyRoomCount).toBe(2);
    expect(db.updates.find((u) => u.table === 'properties')?.values).toMatchObject({
      roomCount: 2,
    });
  });

  it('soft-deletes rather than removing the row, so the number can come back', async () => {
    const db = mockDb({
      select: { rooms: [[roomRow()], [{ count: 0 }]], room_types: [[typeRow]] },
      update: { properties: [], rooms: [] },
    });
    await svc(db).remove(MY_PROPERTY, 'room-1');
    expect(db.deletes.filter((d) => d.table === 'rooms')).toEqual([]);
    expect(db.updates.find((u) => u.table === 'rooms')?.values).toHaveProperty('deletedAt');
  });

  it('does NOT touch room_count on a plain status change — no room was added or removed', async () => {
    const db = mockDb({
      select: { rooms: [[roomRow()]] },
      update: { rooms: [roomRow({ status: 'DIRTY' })] },
    });
    await svc(db).setStatus(MY_PROPERTY, 'room-1', 'DIRTY');
    expect(db.updates.filter((u) => u.table === 'properties')).toEqual([]);
  });
});

describe('RoomsService.setStatus — the narrow write', () => {
  it('touches only the status (and updatedAt), never the number or the type', async () => {
    const db = mockDb({
      select: { rooms: [[roomRow()]] },
      update: { rooms: [roomRow({ status: 'CLEANING' })] },
    });
    await svc(db).setStatus(MY_PROPERTY, 'room-1', 'CLEANING');

    const values = db.updates.find((u) => u.table === 'rooms')!.values!;
    expect(Object.keys(values).sort()).toEqual(['status', 'updatedAt']);
  });

  it('reports the previous status so the caller can render the transition', async () => {
    const db = mockDb({
      select: { rooms: [[roomRow({ status: 'OCCUPIED' })]] },
      update: { rooms: [roomRow({ status: 'DIRTY' })] },
    });
    const res = await svc(db).setStatus(MY_PROPERTY, 'room-1', 'DIRTY');
    expect(res).toMatchObject({ previousStatus: 'OCCUPIED', status: 'DIRTY', number: '301' });
  });

  it('404s for a room at another property before writing anything', async () => {
    const db = mockDb({ select: { rooms: [[]] } });
    await expect(svc(db).setStatus(OTHER_PROPERTY, 'room-1', 'DIRTY')).rejects.toMatchObject({
      status: 404,
    });
    expect(db.updates).toEqual([]);
  });
});

/**
 * Room-first inventory: a room describes ITSELF, and the type it needs to
 * satisfy reservations, rates and channel mapping is minted behind it.
 */
describe('room-first inventory', () => {
  const specs = { name: '', maxOccupancy: 2, maxAdults: 2, maxChildren: 0, baseRate: 450000 };

  it('mints a PRIVATE type from the room’s own specifications', async () => {
    const db = mockDb({
      select: {
        rooms: [[], [{ count: 1 }], [roomRow()]],
        room_types: [[typeRow]],
        amenities: [[]],
      },
      insert: { room_types: [typeRow], rooms: [roomRow()] },
      update: { properties: [] },
    });
    await svc(db).create(MY_PROPERTY, { number: '301', specs } as never);

    const written = db.inserts.find((i) => i.table === 'room_types');
    expect(written?.values).toMatchObject({ isPrivate: true });
    // Unnamed specs are filed under the room they belong to, so the row stays
    // readable to anyone reading the table directly.
    expect(written?.values).toMatchObject({ name: 'Room 301' });
  });

  it('several identical numbers mint ONE shared type and a room for each', async () => {
    const db = mockDb({
      select: {
        rooms: [[], [{ count: 3 }]],
        room_types: [[typeRow], [typeRow]],
        amenities: [[]],
      },
      insert: {
        room_types: [typeRow],
        rooms: [roomRow({ number: '201' }), roomRow({ number: '202' })],
      },
      update: { properties: [] },
    });
    const res = await svc(db).create(MY_PROPERTY, {
      number: '201',
      numbers: ['201', '202'],
      specs,
    } as never);
    // A shared type, NOT private — several rooms genuinely share it, and its
    // photos then serve as every room's cover.
    const type = db.inserts.find((i) => i.table === 'room_types');
    expect(type?.values).toMatchObject({ isPrivate: false });
    const roomInsert = db.inserts.find((i) => i.table === 'rooms');
    expect((roomInsert?.values as unknown as unknown[]).length).toBe(2);
    expect(res.created).toBe(2);
  });

  it('refuses a room that is both grouped and unique, and one that is neither', async () => {
    await expect(
      svc(mockDb({})).create(MY_PROPERTY, { number: '301', roomTypeId: TYPE_ID, specs } as never),
    ).rejects.toThrow(HttpException);
    await expect(svc(mockDb({})).create(MY_PROPERTY, { number: '301' } as never)).rejects.toThrow(
      HttpException,
    );
  });

  it('checks the room number BEFORE minting a type, so a clash leaves no orphan', async () => {
    const db = mockDb({ select: { rooms: [[roomRow()]] } });
    await expect(svc(db).create(MY_PROPERTY, { number: '301', specs } as never)).rejects.toThrow(
      HttpException,
    );
    expect(db.inserts.filter((i) => i.table === 'room_types')).toEqual([]);
  });

  it('refuses to edit specs through a room whose type is SHARED', async () => {
    // Editing 201 must never silently re-specify every other room of its type.
    const db = mockDb({
      select: { rooms: [[roomRow()]], room_types: [[{ ...typeRow, isPrivate: false }]] },
    });
    await expect(
      svc(db).update(MY_PROPERTY, 'room-1', { specs: { baseRate: 1 } } as never),
    ).rejects.toThrow(HttpException);
    expect(db.updates.filter((u) => u.table === 'room_types')).toEqual([]);
  });

  it('takes the private type with the room when the room is deleted', async () => {
    const db = mockDb({
      select: {
        rooms: [[roomRow()], [{ count: 0 }]],
        room_types: [[{ ...typeRow, isPrivate: true }]],
      },
      update: { properties: [], rooms: [], room_types: [] },
    });
    await svc(db).remove(MY_PROPERTY, 'room-1');
    expect(db.updates.find((u) => u.table === 'room_types')?.values).toHaveProperty('deletedAt');
  });

  it('leaves a SHARED type alone when one of its rooms is deleted', async () => {
    const db = mockDb({
      select: {
        rooms: [[roomRow()], [{ count: 0 }]],
        room_types: [[{ ...typeRow, isPrivate: false }]],
      },
      update: { properties: [], rooms: [] },
    });
    await svc(db).remove(MY_PROPERTY, 'room-1');
    expect(db.updates.filter((u) => u.table === 'room_types')).toEqual([]);
  });
});
