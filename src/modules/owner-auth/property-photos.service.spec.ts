import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  MAX_PHOTOS_PER_PROPERTY,
  MAX_PHOTO_BYTES,
  PropertyPhotosService,
  type UploadedPhoto,
} from './property-photos.service';

const OWNER_A = 'owner-a';
const OWNER_B = 'owner-b';
const PROPERTY_A = 'property-a'; // belongs to OWNER_A

function png(bytes = 64): UploadedPhoto {
  return { mimetype: 'image/png', size: bytes, buffer: Buffer.alloc(bytes, 1) };
}

/**
 * Drizzle stand-in backed by two in-memory tables. The property lookup honours
 * the ownerId filter, which is what tenant isolation actually rests on.
 */
function mkDb(photos: Record<string, unknown>[] = []) {
  const propertyRows = [{ id: PROPERTY_A, ownerId: OWNER_A }];
  let ownerFilter: string | null = null;

  const db = {
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
  return db;
}

function mkService(db: ReturnType<typeof mkDb>, root: string) {
  const svc = new PropertyPhotosService(db as never);
  // Point the store at a throwaway directory instead of the mounted volume.
  (svc as unknown as { root: string }).root = root;
  return svc;
}

describe('PropertyPhotosService', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'photos-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('stores an accepted photo on disk and returns its owner-scoped URL', async () => {
    const db = mkDb();
    db.setOwner(OWNER_A);
    const svc = mkService(db, root);

    const [photo] = await svc.upload(OWNER_A, PROPERTY_A, [png()]);
    expect(photo.url).toBe(`/api/v1/owner/properties/${PROPERTY_A}/photos/${photo.id}/raw`);
    expect(photo.contentType).toBe('image/png');
    expect(readdirSync(path.join(root, 'properties', PROPERTY_A))).toHaveLength(1);
  });

  it('rejects a file over 5 MB', async () => {
    const db = mkDb();
    db.setOwner(OWNER_A);
    const svc = mkService(db, root);
    await expect(
      svc.upload(OWNER_A, PROPERTY_A, [{ ...png(1), size: MAX_PHOTO_BYTES + 1 }]),
    ).rejects.toMatchObject({ response: { error: 'FILE_TOO_LARGE' } });
    expect(db.photos).toHaveLength(0);
  });

  it('rejects a non-image mime type', async () => {
    const db = mkDb();
    db.setOwner(OWNER_A);
    const svc = mkService(db, root);
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
    const svc = mkService(db, root);
    await expect(svc.upload(OWNER_A, PROPERTY_A, [png()])).rejects.toMatchObject({
      response: { error: 'PHOTO_LIMIT_REACHED' },
    });
  });

  it('rejects an empty upload', async () => {
    const db = mkDb();
    db.setOwner(OWNER_A);
    const svc = mkService(db, root);
    await expect(svc.upload(OWNER_A, PROPERTY_A, [])).rejects.toMatchObject({
      response: { error: 'NO_FILE' },
    });
  });

  describe('tenant isolation', () => {
    it("owner B cannot list, upload to, read or delete owner A's photos", async () => {
      const db = mkDb([{ id: 'photo-1', propertyId: PROPERTY_A, filename: 'x.png' }]);
      db.setOwner(OWNER_B); // every lookup is now scoped to the wrong tenant
      const svc = mkService(db, root);

      await expect(svc.list(OWNER_B, PROPERTY_A)).rejects.toMatchObject({
        response: { error: 'OWNER_NOT_FOUND' },
      });
      await expect(svc.upload(OWNER_B, PROPERTY_A, [png()])).rejects.toMatchObject({
        response: { error: 'OWNER_NOT_FOUND' },
      });
      await expect(svc.readFile(OWNER_B, PROPERTY_A, 'photo-1')).rejects.toMatchObject({
        response: { error: 'OWNER_NOT_FOUND' },
      });
      await expect(svc.remove(OWNER_B, PROPERTY_A, 'photo-1')).rejects.toMatchObject({
        response: { error: 'OWNER_NOT_FOUND' },
      });
      // Nothing was removed or added on owner A's behalf.
      expect(db.photos).toHaveLength(1);
    });

    it('owner A reaches their own photos', async () => {
      const db = mkDb([{ id: 'photo-1', propertyId: PROPERTY_A, filename: 'x.png' }]);
      db.setOwner(OWNER_A);
      const svc = mkService(db, root);
      await expect(svc.list(OWNER_A, PROPERTY_A)).resolves.toHaveLength(1);
    });
  });

  it('builds cover URLs from the first photo of each property', async () => {
    const db = mkDb([
      { id: 'photo-1', propertyId: PROPERTY_A, sortOrder: 0 },
      { id: 'photo-2', propertyId: PROPERTY_A, sortOrder: 1 },
    ]);
    const svc = mkService(db, root);
    const covers = await svc.coverUrls([PROPERTY_A]);
    expect(covers.get(PROPERTY_A)).toBe(
      `/api/v1/owner/properties/${PROPERTY_A}/photos/photo-1/raw`,
    );
  });
});
