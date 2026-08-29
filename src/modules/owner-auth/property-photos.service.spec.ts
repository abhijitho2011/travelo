import { BadRequestException } from '@nestjs/common';
import {
  MAX_PHOTOS_PER_PROPERTY,
  MAX_PHOTO_BYTES,
  PHOTO_URL_TTL_SECONDS,
  PropertyPhotosService,
  type UploadedPhoto,
} from './property-photos.service';

const OWNER_A = 'owner-a';
const OWNER_B = 'owner-b';
const PROPERTY_A = 'property-a'; // belongs to OWNER_A

function png(bytes = 64): UploadedPhoto {
  return { mimetype: 'image/png', size: bytes, buffer: Buffer.alloc(bytes, 1) };
}

/** In-memory stand-in for StorageService — never touches disk or the network. */
function mkStorage(driver: 's3' | 'local' = 's3') {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  return {
    driver,
    objects,
    put: jest.fn(async (key: string, body: Buffer, contentType: string) => {
      objects.set(key, { body, contentType });
    }),
    getSignedUrl: jest.fn(
      async (key: string, ttl: number) => `https://bucket.test/${key}?X-Amz-Expires=${ttl}`,
    ),
    delete: jest.fn(async (key: string) => {
      objects.delete(key);
    }),
    createLocalReadStream: jest.fn(),
  };
}

/**
 * Drizzle stand-in backed by two in-memory tables. The property lookup honours
 * the ownerId filter, which is what tenant isolation actually rests on.
 */
function mkDb(photos: Record<string, unknown>[] = []) {
  const propertyRows = [{ id: PROPERTY_A, ownerId: OWNER_A }];
  let ownerFilter: string | null = null;

  return {
    photos,
    select() {
      return {
        from(table: unknown) {
          const name = String(
            Object.getOwnPropertySymbols(table as object)
              .map((sym) => (table as Record<symbol, unknown>)[sym])
              .find((v) => typeof v === 'string' && ['properties', 'property_photos'].includes(v)),
          );
          const rows =
            name === 'properties'
              ? propertyRows.filter((p) => p.ownerId === ownerFilter)
              : (photos as Record<string, unknown>[]);
          const terminal: Record<string, unknown> = {
            limit: async () => rows,
            orderBy: async () => rows,
            then: (res: (v: unknown) => unknown) =>
              Promise.resolve(name === 'properties' ? rows : [{ count: photos.length }]).then(res),
          };
          return { where: () => terminal };
        },
      };
    },
    insert() {
      return {
        values: (v: Record<string, unknown>) => ({
          returning: async () => {
            const row = { id: `photo-${photos.length + 1}`, createdAt: new Date(), ...v };
            photos.push(row);
            return [row];
          },
        }),
      };
    },
    delete() {
      return {
        where: () => ({
          returning: async () => {
            const row = photos.shift();
            return row ? [row] : [];
          },
        }),
      };
    },
    /** Test hook: which owner the current call is scoped to. */
    setOwner(id: string) {
      ownerFilter = id;
    },
  };
}

describe('PropertyPhotosService', () => {
  it('stores an object key (never bytes) and returns a presigned URL', async () => {
    const db = mkDb();
    db.setOwner(OWNER_A);
    const storage = mkStorage('s3');
    const svc = new PropertyPhotosService(db as never, storage as never);

    const [photo] = await svc.upload(OWNER_A, PROPERTY_A, [png()]);

    const stored = db.photos[0] as { storageKey: string };
    expect(stored.storageKey).toMatch(new RegExp(`^properties/${PROPERTY_A}/[0-9a-f-]{36}\\.png$`));
    expect(stored).not.toHaveProperty('buffer');
    expect(storage.put).toHaveBeenCalledWith(stored.storageKey, expect.any(Buffer), 'image/png');
    expect(photo.url).toBe(
      `https://bucket.test/${stored.storageKey}?X-Amz-Expires=${PHOTO_URL_TTL_SECONDS}`,
    );
    expect(photo.expiresInSeconds).toBe(PHOTO_URL_TTL_SECONDS);
  });

  it('points at the owner-scoped raw route under the local driver', async () => {
    const db = mkDb();
    db.setOwner(OWNER_A);
    const svc = new PropertyPhotosService(db as never, mkStorage('local') as never);
    const [photo] = await svc.upload(OWNER_A, PROPERTY_A, [png()]);
    expect(photo.url).toBe(`/api/v1/owner/properties/${PROPERTY_A}/photos/${photo.id}/raw`);
  });

  it('rejects a file over 5 MB before anything is written', async () => {
    const db = mkDb();
    db.setOwner(OWNER_A);
    const storage = mkStorage();
    const svc = new PropertyPhotosService(db as never, storage as never);
    await expect(
      svc.upload(OWNER_A, PROPERTY_A, [{ ...png(1), size: MAX_PHOTO_BYTES + 1 }]),
    ).rejects.toMatchObject({ response: { error: 'FILE_TOO_LARGE' } });
    expect(storage.put).not.toHaveBeenCalled();
    expect(db.photos).toHaveLength(0);
  });

  it('rejects a non-image mime type', async () => {
    const db = mkDb();
    db.setOwner(OWNER_A);
    const svc = new PropertyPhotosService(db as never, mkStorage() as never);
    await expect(
      svc.upload(OWNER_A, PROPERTY_A, [{ ...png(), mimetype: 'application/pdf' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.upload(OWNER_A, PROPERTY_A, [{ ...png(), mimetype: 'image/gif' }]),
    ).rejects.toMatchObject({ response: { error: 'UNSUPPORTED_MEDIA_TYPE' } });
  });

  it(`caps a property at ${MAX_PHOTOS_PER_PROPERTY} photos`, async () => {
    const existing = Array.from({ length: MAX_PHOTOS_PER_PROPERTY }, (_, i) => ({
      id: `p${i}`,
      propertyId: PROPERTY_A,
    }));
    const db = mkDb(existing);
    db.setOwner(OWNER_A);
    const svc = new PropertyPhotosService(db as never, mkStorage() as never);
    await expect(svc.upload(OWNER_A, PROPERTY_A, [png()])).rejects.toMatchObject({
      response: { error: 'PHOTO_LIMIT_REACHED' },
    });
  });

  it('rejects an empty upload', async () => {
    const db = mkDb();
    db.setOwner(OWNER_A);
    const svc = new PropertyPhotosService(db as never, mkStorage() as never);
    await expect(svc.upload(OWNER_A, PROPERTY_A, [])).rejects.toMatchObject({
      response: { error: 'NO_FILE' },
    });
  });

  it('removes the stored object when a photo is deleted', async () => {
    const db = mkDb([{ id: 'photo-1', propertyId: PROPERTY_A, storageKey: 'properties/p/a.png' }]);
    db.setOwner(OWNER_A);
    const storage = mkStorage();
    const svc = new PropertyPhotosService(db as never, storage as never);
    await expect(svc.remove(OWNER_A, PROPERTY_A, 'photo-1')).resolves.toMatchObject({
      deleted: true,
    });
    expect(storage.delete).toHaveBeenCalledWith('properties/p/a.png');
  });

  describe('tenant isolation', () => {
    it("owner B cannot list, upload to, read or delete owner A's photos", async () => {
      const db = mkDb([
        { id: 'photo-1', propertyId: PROPERTY_A, storageKey: 'properties/p/a.png' },
      ]);
      db.setOwner(OWNER_B); // every lookup is now scoped to the wrong tenant
      const storage = mkStorage();
      const svc = new PropertyPhotosService(db as never, storage as never);

      await expect(svc.list(OWNER_B, PROPERTY_A)).rejects.toMatchObject({
        response: { error: 'OWNER_NOT_FOUND' },
      });
      await expect(svc.upload(OWNER_B, PROPERTY_A, [png()])).rejects.toMatchObject({
        response: { error: 'OWNER_NOT_FOUND' },
      });
      await expect(svc.resolveForServing(OWNER_B, PROPERTY_A, 'photo-1')).rejects.toMatchObject({
        response: { error: 'OWNER_NOT_FOUND' },
      });
      await expect(svc.remove(OWNER_B, PROPERTY_A, 'photo-1')).rejects.toMatchObject({
        response: { error: 'OWNER_NOT_FOUND' },
      });
      // Nothing was signed, written or removed on owner A's behalf.
      expect(db.photos).toHaveLength(1);
      expect(storage.put).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('owner A reaches their own photos', async () => {
      const db = mkDb([
        { id: 'photo-1', propertyId: PROPERTY_A, storageKey: 'properties/p/a.png' },
      ]);
      db.setOwner(OWNER_A);
      const svc = new PropertyPhotosService(db as never, mkStorage() as never);
      await expect(svc.list(OWNER_A, PROPERTY_A)).resolves.toHaveLength(1);
    });
  });

  it('builds a cover URL from the first photo of each property', async () => {
    const db = mkDb([
      { id: 'photo-1', propertyId: PROPERTY_A, sortOrder: 0, storageKey: 'properties/p/1.png' },
      { id: 'photo-2', propertyId: PROPERTY_A, sortOrder: 1, storageKey: 'properties/p/2.png' },
    ]);
    const svc = new PropertyPhotosService(db as never, mkStorage() as never);
    const covers = await svc.coverUrls([PROPERTY_A]);
    expect(covers.get(PROPERTY_A)).toContain('properties/p/1.png');
  });
});
