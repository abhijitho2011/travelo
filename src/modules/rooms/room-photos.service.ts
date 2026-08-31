import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  roomPhotos,
  rooms,
  type RoomPhoto,
  type RoomTypePhotoCategory,
} from '../../database/schema';
import { StorageService } from '../storage/storage.service';
import { RoomErrors } from './room-errors';
import {
  MAX_PHOTOS_PER_ROOM_TYPE,
  RoomTypePhotosService,
  safePhotoName,
  type UploadedRoomTypePhoto,
} from './room-type-photos.service';
import { ROOM_TYPE_PHOTO_URL_TTL_SECONDS } from './room-types.service';

/** A room may hold as many photos as a room type. Same screen, same limit. */
export const MAX_PHOTOS_PER_ROOM = MAX_PHOTOS_PER_ROOM_TYPE;

/**
 * Photos of ONE physical room.
 *
 * A deliberate mirror of `RoomTypePhotosService`: the bytes go to the object
 * store, Postgres holds only the KEY, and clients are handed short-lived
 * presigned URLs. The API never proxies image bytes and there is no publicly
 * listable directory. File validation is not re-implemented here — it is the
 * same rule, so it is the same code.
 *
 * Every method starts by resolving the room by (id, THE CALLER'S OWN
 * propertyId, deleted_at IS NULL). A room at another hotel 404s — never 403,
 * which would confirm the row is real.
 */
@Injectable()
export class RoomPhotosService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  /** `rooms/<roomId>/<uuid>-<safeName>` — never a client-built path. */
  static objectKey(roomId: string, filename?: string): string {
    return `rooms/${roomId}/${randomUUID()}-${safePhotoName(filename)}`;
  }

  /** The single choke point, resolved the way RoomsService resolves a room. */
  private async requireRoom(propertyId: string, roomId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(
        and(
          eq(rooms.id, roomId),
          eq(rooms.propertyId, propertyId),
          sql`${rooms.deletedAt} is null`,
        ),
      )
      .limit(1);
    if (!row) throw RoomErrors.roomNotFound();
  }

  private async serialize(r: RoomPhoto) {
    return {
      id: r.id,
      roomId: r.roomId,
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

  private async rowsFor(roomId: string): Promise<RoomPhoto[]> {
    return this.db
      .select()
      .from(roomPhotos)
      .where(eq(roomPhotos.roomId, roomId))
      .orderBy(asc(roomPhotos.sortOrder), asc(roomPhotos.createdAt));
  }

  async list(propertyId: string, roomId: string) {
    await this.requireRoom(propertyId, roomId);
    const rows = await this.rowsFor(roomId);
    return Promise.all(rows.map((r) => this.serialize(r)));
  }

  async upload(
    propertyId: string,
    roomId: string,
    file: UploadedRoomTypePhoto | undefined,
    category?: RoomTypePhotoCategory,
  ) {
    // FIRST — before any read, any object-store write and any insert.
    RoomTypePhotosService.assertValidFile(file);
    await this.requireRoom(propertyId, roomId);

    const existing = await this.rowsFor(roomId);
    if (existing.length >= MAX_PHOTOS_PER_ROOM) {
      throw RoomErrors.photoLimitReached(MAX_PHOTOS_PER_ROOM);
    }

    const key = RoomPhotosService.objectKey(roomId, file.originalname);
    await this.storage.put(key, file.buffer, file.mimetype);

    const [row] = await this.db
      .insert(roomPhotos)
      .values({
        propertyId,
        roomId,
        storageKey: key,
        contentType: file.mimetype,
        sizeBytes: file.size,
        category: category ?? 'ROOM',
        // The first photo a room ever gets IS its thumbnail — a room with
        // photos but no primary would show a blank tile on the list screen.
        isPrimary: existing.length === 0,
        sortOrder: existing.length,
      })
      .returning();
    return this.serialize(row);
  }

  async setPrimary(propertyId: string, roomId: string, photoId: string) {
    await this.requireRoom(propertyId, roomId);
    const rows = await this.rowsFor(roomId);
    const target = rows.find((r) => r.id === photoId);
    if (!target) throw RoomErrors.photoNotFound();

    const updated = await this.db.transaction(async (tx) => {
      // Clear FIRST, in the same transaction: the partial unique index allows
      // exactly one primary per room, so setting before clearing would violate
      // it mid-statement.
      await tx
        .update(roomPhotos)
        .set({ isPrimary: false })
        .where(and(eq(roomPhotos.roomId, roomId), eq(roomPhotos.isPrimary, true)));
      const [row] = await tx
        .update(roomPhotos)
        .set({ isPrimary: true })
        .where(eq(roomPhotos.id, photoId))
        .returning();
      return row ?? { ...target, isPrimary: true };
    });
    return this.serialize(updated);
  }

  /** `sort_order` becomes the index in `ids`. A PUT on the whole ordering. */
  async reorder(propertyId: string, roomId: string, ids: string[]) {
    await this.requireRoom(propertyId, roomId);
    const rows = await this.rowsFor(roomId);
    const owned = new Set(rows.map((r) => r.id));
    if (ids.length !== new Set(ids).size || ids.some((id) => !owned.has(id))) {
      throw RoomErrors.photoOrderMismatch();
    }

    await this.db.transaction(async (tx) => {
      await Promise.all(
        ids.map((id, i) =>
          tx
            .update(roomPhotos)
            .set({ sortOrder: i })
            .where(and(eq(roomPhotos.id, id), eq(roomPhotos.roomId, roomId))),
        ),
      );
    });

    const after = await this.rowsFor(roomId);
    return Promise.all(after.map((r) => this.serialize(r)));
  }

  async remove(propertyId: string, roomId: string, photoId: string) {
    await this.requireRoom(propertyId, roomId);
    const rows = await this.rowsFor(roomId);
    const target = rows.find((r) => r.id === photoId);
    if (!target) throw RoomErrors.photoNotFound();

    await this.db
      .delete(roomPhotos)
      .where(and(eq(roomPhotos.id, photoId), eq(roomPhotos.roomId, roomId)));

    // The row is the source of truth; a leftover object is harmless, and a
    // missing one must not turn a successful delete into a 500.
    await this.storage.delete(target.storageKey).catch(() => undefined);

    // Removing the thumbnail must not leave the room without one.
    const remaining = rows.filter((r) => r.id !== photoId);
    if (target.isPrimary && remaining.length) {
      await this.db
        .update(roomPhotos)
        .set({ isPrimary: true })
        .where(and(inArray(roomPhotos.id, [remaining[0].id]), eq(roomPhotos.roomId, roomId)));
    }
    return { deleted: true, photoId };
  }
}
