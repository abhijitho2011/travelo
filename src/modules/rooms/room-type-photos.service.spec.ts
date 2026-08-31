import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { RoomTypePhotosService, MAX_PHOTO_BYTES } from './room-type-photos.service';
import type { Database } from '../../database/database.module';
import type { StorageService } from '../storage/storage.service';

const MY_PROPERTY = 'prop-mine';
const TYPE_ID = '11111111-1111-4111-8111-111111111111';
const PHOTO_ID = '33333333-3333-4333-8333-333333333333';

/** Records what would have been written, without touching disk or S3. */
function fakeStorage() {
  const puts: { key: string; contentType: string }[] = [];
  const deletes: string[] = [];
  const storage = {
    driver: 'local' as const,
    puts,
    deletes,
    put: async (key: string, _body: Buffer, contentType: string) => {
      puts.push({ key, contentType });
    },
    getSignedUrl: async (key: string) => `signed://${key}`,
    delete: async (key: string) => {
      deletes.push(key);
    },
  };
  return storage;
}

function svc(db: MockDb, storage = fakeStorage()) {
  return {
    service: new RoomTypePhotosService(
      db as unknown as Database,
      storage as unknown as StorageService,
    ),
    storage,
  };
}

const file = (over: Partial<{ mimetype: string; size: number; originalname: string }> = {}) => ({
  originalname: 'Sea View 1.JPG',
  mimetype: 'image/jpeg',
  size: 1024,
  buffer: Buffer.from('bytes'),
  ...over,
});

const typeRow = () => ({ id: TYPE_ID });

const photoRow = (over: Record<string, unknown> = {}) => ({
  id: PHOTO_ID,
  propertyId: MY_PROPERTY,
  roomTypeId: TYPE_ID,
  storageKey: 'room-types/t/a.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 1024,
  category: 'ROOM',
  isPrimary: false,
  sortOrder: 0,
  createdAt: new Date(),
  ...over,
});

describe('RoomTypePhotosService — nothing is written before the file is validated', () => {
  it('refuses a PDF without reading the database or the object store', async () => {
    const db = mockDb({ select: { room_types: [[typeRow()]] } });
    const { service, storage } = svc(db);
    await expect(
      service.upload(MY_PROPERTY, TYPE_ID, file({ mimetype: 'application/pdf' })),
    ).rejects.toMatchObject({ status: 400, response: { error: 'UNSUPPORTED_MEDIA_TYPE' } });
    expect(storage.puts).toEqual([]);
    expect(db.inserts).toEqual([]);
    // Not even the room-type lookup ran — validation is genuinely first.
    expect(db.selects).toEqual([]);
  });

  it('refuses a file over 5 MB before any write', async () => {
    const db = mockDb({ select: { room_types: [[typeRow()]] } });
    const { service, storage } = svc(db);
    await expect(
      service.upload(MY_PROPERTY, TYPE_ID, file({ size: MAX_PHOTO_BYTES + 1 })),
    ).rejects.toMatchObject({ response: { error: 'FILE_TOO_LARGE' } });
    expect(storage.puts).toEqual([]);
    expect(db.inserts).toEqual([]);
  });

  it('refuses a request with no file at all', async () => {
    const db = mockDb({});
    const { service } = svc(db);
    await expect(service.upload(MY_PROPERTY, TYPE_ID, undefined)).rejects.toMatchObject({
      response: { error: 'NO_FILE' },
    });
  });

  it('accepts JPEG, PNG and WebP', async () => {
    for (const mimetype of ['image/jpeg', 'image/png', 'image/webp']) {
      const db = mockDb({
        select: { room_types: [[typeRow()]], room_type_photos: [[]] },
        insert: { room_type_photos: [photoRow({ contentType: mimetype, isPrimary: true })] },
      });
      const { service, storage } = svc(db);
      await service.upload(MY_PROPERTY, TYPE_ID, file({ mimetype }));
      expect(storage.puts).toHaveLength(1);
    }
  });
});

describe('RoomTypePhotosService — tenant isolation', () => {
  // The codebase rule: a foreign room type is indistinguishable from a missing
  // one. A 403 would confirm the row is real and name the hotel it sits at.
  it('404s for a room type at another property, and writes nothing', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    const { service, storage } = svc(db);
    await expect(service.upload(MY_PROPERTY, TYPE_ID, file())).rejects.toMatchObject({
      status: 404,
      response: { error: 'ROOM_TYPE_NOT_FOUND' },
    });
    expect(storage.puts).toEqual([]);
    expect(db.inserts).toEqual([]);
  });

  it('404s on every other photo route for a foreign room type', async () => {
    for (const call of [
      (s: RoomTypePhotosService) => s.list(MY_PROPERTY, TYPE_ID),
      (s: RoomTypePhotosService) => s.setPrimary(MY_PROPERTY, TYPE_ID, PHOTO_ID),
      (s: RoomTypePhotosService) => s.reorder(MY_PROPERTY, TYPE_ID, [PHOTO_ID]),
      (s: RoomTypePhotosService) => s.remove(MY_PROPERTY, TYPE_ID, PHOTO_ID),
    ]) {
      const db = mockDb({ select: { room_types: [[]] } });
      const { service } = svc(db);
      await expect(call(service)).rejects.toMatchObject({
        status: 404,
        response: { error: 'ROOM_TYPE_NOT_FOUND' },
      });
      expect(db.updates).toEqual([]);
      expect(db.deletes).toEqual([]);
    }
  });

  it('resolves the room type by property AND live-ness, never by id alone', async () => {
    const db = mockDb({ select: { room_types: [[typeRow()]], room_type_photos: [[]] } });
    await svc(db).service.list(MY_PROPERTY, TYPE_ID);
    const where = sqlText(db.wheresFor('room_types')[0]);
    expect(where).toContain(MY_PROPERTY);
    expect(where).toContain('deleted_at');
    expect(where).toContain('is null');
  });
});

describe('RoomTypePhotosService — the first photo becomes the thumbnail', () => {
  it('marks the very first photo primary, at sort order 0', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow()]], room_type_photos: [[]] },
      insert: { room_type_photos: [photoRow({ isPrimary: true })] },
    });
    const { service } = svc(db);
    const res = await service.upload(MY_PROPERTY, TYPE_ID, file(), 'VIEW');
    expect(db.inserts.find((i) => i.table === 'room_type_photos')?.values).toMatchObject({
      propertyId: MY_PROPERTY,
      roomTypeId: TYPE_ID,
      isPrimary: true,
      sortOrder: 0,
      category: 'VIEW',
    });
    expect(res.url).toBe('signed://room-types/t/a.jpg');
  });

  it('does NOT make a later photo primary, and appends it to the order', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow()]], room_type_photos: [[photoRow({ isPrimary: true })]] },
      insert: { room_type_photos: [photoRow({ id: 'p2', isPrimary: false, sortOrder: 1 })] },
    });
    await svc(db).service.upload(MY_PROPERTY, TYPE_ID, file());
    expect(db.inserts.find((i) => i.table === 'room_type_photos')?.values).toMatchObject({
      isPrimary: false,
      sortOrder: 1,
    });
  });

  it('stores the object KEY under room-types/<id>/, with a sanitised filename', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow()]], room_type_photos: [[]] },
      insert: { room_type_photos: [photoRow()] },
    });
    const { service, storage } = svc(db);
    await service.upload(MY_PROPERTY, TYPE_ID, file());
    expect(storage.puts[0].key).toMatch(
      new RegExp(`^room-types/${TYPE_ID}/[0-9a-f-]{36}-Sea_View_1\\.JPG$`),
    );
    expect(db.inserts.find((i) => i.table === 'room_type_photos')?.values).toMatchObject({
      storageKey: storage.puts[0].key,
    });
  });
});

describe('RoomTypePhotosService — primary reassignment', () => {
  it('clears the previous primary in the SAME transaction before setting the new one', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow()]],
        room_type_photos: [[photoRow({ id: 'old', isPrimary: true }), photoRow({ id: PHOTO_ID })]],
      },
      update: { room_type_photos: [photoRow({ isPrimary: true })] },
    });
    const res = await svc(db).service.setPrimary(MY_PROPERTY, TYPE_ID, PHOTO_ID);

    const writes = db.updates.filter((u) => u.table === 'room_type_photos');
    expect(writes).toHaveLength(2);
    // Clear first — the partial unique index allows exactly one primary.
    expect(writes[0].values).toMatchObject({ isPrimary: false });
    expect(writes[1].values).toMatchObject({ isPrimary: true });
    expect(res.isPrimary).toBe(true);
  });

  it('404s for a photo id that belongs to a different room type', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow()]], room_type_photos: [[photoRow({ id: 'someone-else' })]] },
    });
    await expect(svc(db).service.setPrimary(MY_PROPERTY, TYPE_ID, PHOTO_ID)).rejects.toMatchObject({
      status: 404,
      response: { error: 'ROOM_TYPE_PHOTO_NOT_FOUND' },
    });
    expect(db.updates).toEqual([]);
  });

  it('promotes the next photo when the primary is deleted', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow()]],
        room_type_photos: [
          [photoRow({ id: PHOTO_ID, isPrimary: true }), photoRow({ id: 'p2', sortOrder: 1 })],
        ],
      },
    });
    const { service, storage } = svc(db);
    const res = await service.remove(MY_PROPERTY, TYPE_ID, PHOTO_ID);

    expect(res).toEqual({ deleted: true, photoId: PHOTO_ID });
    expect(db.deletes.some((d) => d.table === 'room_type_photos')).toBe(true);
    // Best effort: the row is the source of truth, the object is cleaned up after.
    expect(storage.deletes).toEqual(['room-types/t/a.jpg']);
    expect(db.updates.find((u) => u.table === 'room_type_photos')?.values).toMatchObject({
      isPrimary: true,
    });
  });

  it('does not promote anything when a non-primary photo is deleted', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow()]],
        room_type_photos: [
          [photoRow({ id: 'p1', isPrimary: true }), photoRow({ id: PHOTO_ID, sortOrder: 1 })],
        ],
      },
    });
    await svc(db).service.remove(MY_PROPERTY, TYPE_ID, PHOTO_ID);
    expect(db.updates).toEqual([]);
  });
});

describe('RoomTypePhotosService — reordering', () => {
  it('writes sort_order as the index in the id list', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow()]],
        room_type_photos: [
          [photoRow({ id: 'a' }), photoRow({ id: 'b' })],
          [photoRow({ id: 'b' }), photoRow({ id: 'a' })],
        ],
      },
    });
    await svc(db).service.reorder(MY_PROPERTY, TYPE_ID, ['b', 'a']);
    const writes = db.updates.filter((u) => u.table === 'room_type_photos');
    expect(writes.map((w) => w.values)).toEqual([{ sortOrder: 0 }, { sortOrder: 1 }]);
  });

  it('refuses an id list naming a photo the type does not own', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow()]], room_type_photos: [[photoRow({ id: 'a' })]] },
    });
    await expect(
      svc(db).service.reorder(MY_PROPERTY, TYPE_ID, ['a', 'not-mine']),
    ).rejects.toMatchObject({ status: 400, response: { error: 'PHOTO_ORDER_MISMATCH' } });
    expect(db.updates).toEqual([]);
  });

  it('refuses a list containing the same id twice', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow()]], room_type_photos: [[photoRow({ id: 'a' })]] },
    });
    await expect(svc(db).service.reorder(MY_PROPERTY, TYPE_ID, ['a', 'a'])).rejects.toMatchObject({
      response: { error: 'PHOTO_ORDER_MISMATCH' },
    });
  });
});
