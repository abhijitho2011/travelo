import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  roomTypePhotos,
  roomTypes,
  type RoomTypePhoto,
  type RoomTypePhotoCategory,
} from '../../database/schema';
import { StorageService } from '../storage/storage.service';
import { RoomErrors } from './room-errors';
import { ROOM_TYPE_PHOTO_URL_TTL_SECONDS } from './room-types.service';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB per file
export const MAX_PHOTOS_PER_ROOM_TYPE = 20;

/** Only formats a browser and Flutter can both render. */
export const ALLOWED_PHOTO_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** The multipart shape Multer's memory storage hands the controller. */
export interface UploadedRoomTypePhoto {
  originalname?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** A conservative, path-safe rendering of a client-supplied filename. */
export function safePhotoName(name?: string): string {
  const base = (name ?? 'photo').split(/[/\\]/).pop() ?? 'photo';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned.slice(0, 120) || 'photo';
}

/**
 * Room-type photos, mirroring the property-photo design exactly: the bytes go
 * to the object store, Postgres holds only the KEY, and clients are handed
 * short-lived presigned URLs. The API never proxies image bytes and there is no
 * publicly listable directory.
 *
 * Every method starts by resolving the room type by (id, THE CALLER'S OWN
 * propertyId, deleted_at IS NULL). A type at another hotel 404s — never 403,
 * which would confirm the row is real.
 */
@Injectable()
export class RoomTypePhotosService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  /** `room-types/<roomTypeId>/<uuid>-<safeName>` — never a client-built path. */
  static objectKey(roomTypeId: string, filename?: string): string {
    return `room-types/${roomTypeId}/${randomUUID()}-${safePhotoName(filename)}`;
  }

  /**
   * Rejects a missing, oversized or disallowed file. Deliberately callable (and
   * called) BEFORE anything is read or written, so a bad upload never touches
   * the object store or the database.
   */
  static assertValidFile(file?: UploadedRoomTypePhoto): asserts file is UploadedRoomTypePhoto {
    if (!file) throw RoomErrors.noFile();
    if (!ALLOWED_PHOTO_MIME[file.mimetype]) throw RoomErrors.unsupportedMediaType();
    if (file.size > MAX_PHOTO_BYTES) throw RoomErrors.fileTooLarge();
  }

  /**
   * The single choke point. Resolved the same way RoomTypesService does it, and
   * kept here rather than injected so the two services stay acyclic.
   */
  private async requireRoomType(propertyId: string, roomTypeId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, roomTypeId),
          eq(roomTypes.propertyId, propertyId),
          sql`${roomTypes.deletedAt} is null`,
        ),
      )
      .limit(1);
    if (!row) throw RoomErrors.roomTypeNotFound();
  }

  private async serialize(r: RoomTypePhoto) {
    return {
      id: r.id,
      roomTypeId: r.roomTypeId,
      url: await this.storage.getSignedUrl(r.storageKey, ROOM_TYPE_PHOTO_URL_TTL_SECONDS),
      category: r.category,
      isPrimary: r.isPrimary,
      sortOrder: r.sortOrder,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
      expiresInSeconds: ROOM_TYPE_PHOTO_URL_TTL_SECONDS,
    };
  }

  private async rowsFor(roomTypeId: string): Promise<RoomTypePhoto[]> {
    return this.db
      .select()
      .from(roomTypePhotos)
      .where(eq(roomTypePhotos.roomTypeId, roomTypeId))
      .orderBy(asc(roomTypePhotos.sortOrder), asc(roomTypePhotos.createdAt));
  }

  async list(propertyId: string, roomTypeId: string) {
    await this.requireRoomType(propertyId, roomTypeId);
    const rows = await this.rowsFor(roomTypeId);
    return Promise.all(rows.map((r) => this.serialize(r)));
  }

  async upload(
    propertyId: string,
    roomTypeId: string,
    file: UploadedRoomTypePhoto | undefined,
    category?: RoomTypePhotoCategory,
  ) {
    // FIRST — before any read, any object-store write and any insert.
    RoomTypePhotosService.assertValidFile(file);
    await this.requireRoomType(propertyId, roomTypeId);

    const existing = await this.rowsFor(roomTypeId);
    if (existing.length >= MAX_PHOTOS_PER_ROOM_TYPE) {
      throw RoomErrors.photoLimitReached(MAX_PHOTOS_PER_ROOM_TYPE);
    }

    const key = RoomTypePhotosService.objectKey(roomTypeId, file.originalname);
    await this.storage.put(key, file.buffer, file.mimetype);

    const [row] = await this.db
      .insert(roomTypePhotos)
      .values({
        propertyId,
        roomTypeId,
        storageKey: key,
        contentType: file.mimetype,
        sizeBytes: file.size,
        category: category ?? 'ROOM',
        // The first photo a type ever gets IS its thumbnail — a room type with
        // photos but no primary would show a blank tile on the list screen.
        isPrimary: existing.length === 0,
        sortOrder: existing.length,
      })
      .returning();
    return this.serialize(row);
  }

  async setPrimary(propertyId: string, roomTypeId: string, photoId: string) {
    await this.requireRoomType(propertyId, roomTypeId);
    const rows = await this.rowsFor(roomTypeId);
    const target = rows.find((r) => r.id === photoId);
    if (!target) throw RoomErrors.photoNotFound();

    const updated = await this.db.transaction(async (tx) => {
      // Clear FIRST, in the same transaction: the partial unique index allows
      // exactly one primary per type, so setting before clearing would violate
      // it mid-statement.
      await tx
        .update(roomTypePhotos)
        .set({ isPrimary: false })
        .where(and(eq(roomTypePhotos.roomTypeId, roomTypeId), eq(roomTypePhotos.isPrimary, true)));
      const [row] = await tx
        .update(roomTypePhotos)
        .set({ isPrimary: true })
        .where(eq(roomTypePhotos.id, photoId))
        .returning();
      return row ?? { ...target, isPrimary: true };
    });
    return this.serialize(updated);
  }

  /** `sort_order` becomes the index in `ids`. A PUT on the whole ordering. */
  async reorder(propertyId: string, roomTypeId: string, ids: string[]) {
    await this.requireRoomType(propertyId, roomTypeId);
    const rows = await this.rowsFor(roomTypeId);
    const owned = new Set(rows.map((r) => r.id));
    if (ids.length !== new Set(ids).size || ids.some((id) => !owned.has(id))) {
      throw RoomErrors.photoOrderMismatch();
    }

    await this.db.transaction(async (tx) => {
      await Promise.all(
        ids.map((id, i) =>
          tx
            .update(roomTypePhotos)
            .set({ sortOrder: i })
            .where(and(eq(roomTypePhotos.id, id), eq(roomTypePhotos.roomTypeId, roomTypeId))),
        ),
      );
    });

    const after = await this.rowsFor(roomTypeId);
    return Promise.all(after.map((r) => this.serialize(r)));
  }

  async remove(propertyId: string, roomTypeId: string, photoId: string) {
    await this.requireRoomType(propertyId, roomTypeId);
    const rows = await this.rowsFor(roomTypeId);
    const target = rows.find((r) => r.id === photoId);
    if (!target) throw RoomErrors.photoNotFound();

    await this.db
      .delete(roomTypePhotos)
      .where(and(eq(roomTypePhotos.id, photoId), eq(roomTypePhotos.roomTypeId, roomTypeId)));

    // The row is the source of truth; a leftover object is harmless, and a
    // missing one must not turn a successful delete into a 500.
    await this.storage.delete(target.storageKey).catch(() => undefined);

    // Removing the thumbnail must not leave the type without one.
    const remaining = rows.filter((r) => r.id !== photoId);
    if (target.isPrimary && remaining.length) {
      await this.db
        .update(roomTypePhotos)
        .set({ isPrimary: true })
        .where(
          and(
            inArray(roomTypePhotos.id, [remaining[0].id]),
            eq(roomTypePhotos.roomTypeId, roomTypeId),
          ),
        );
    }
    return { deleted: true, photoId };
  }
}
