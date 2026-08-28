import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { properties, propertyPhotos } from '../../database/schema';
import { OwnerErrors } from './owner-errors';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB per file
export const MAX_PHOTOS_PER_PROPERTY = 10;

/** Only formats a browser and Flutter can both render. */
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface UploadedPhoto {
  originalname?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Photo bytes are written to a mounted disk (a Railway volume in production),
 * never to Postgres. Only metadata is stored in `property_photos`, and files
 * are served back through an owner-scoped streaming endpoint so there is no
 * publicly listable static directory.
 */
@Injectable()
export class PropertyPhotosService {
  private readonly root = process.env.UPLOADS_DIR?.trim() || path.resolve(process.cwd(), 'uploads');

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static rawUrl(propertyId: string, photoId: string): string {
    return `/api/v1/owner/properties/${propertyId}/photos/${photoId}/raw`;
  }

  private dir(propertyId: string): string {
    return path.join(this.root, 'properties', propertyId);
  }

  /** 404s rather than 403s for another tenant's property — nothing is leaked. */
  private async assertOwned(ownerId: string, propertyId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.ownerId, ownerId)))
      .limit(1);
    if (!row) throw OwnerErrors.ownerNotFound();
  }

  async list(ownerId: string, propertyId: string) {
    await this.assertOwned(ownerId, propertyId);
    const rows = await this.db
      .select()
      .from(propertyPhotos)
      .where(eq(propertyPhotos.propertyId, propertyId))
      .orderBy(asc(propertyPhotos.sortOrder), asc(propertyPhotos.createdAt));
    return rows.map((r) => this.serialize(r));
  }

  async upload(ownerId: string, propertyId: string, files: UploadedPhoto[]) {
    await this.assertOwned(ownerId, propertyId);
    if (!files?.length)
      throw new BadRequestException({ error: 'NO_FILE', message: 'No file sent' });

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(propertyPhotos)
      .where(eq(propertyPhotos.propertyId, propertyId));
    if (count + files.length > MAX_PHOTOS_PER_PROPERTY) {
      throw new BadRequestException({
        error: 'PHOTO_LIMIT_REACHED',
        message: `A property can have at most ${MAX_PHOTOS_PER_PROPERTY} photos`,
      });
    }

    for (const file of files) {
      if (!ALLOWED_MIME[file.mimetype]) {
        throw new BadRequestException({
          error: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Photos must be JPEG, PNG or WebP',
        });
      }
      if (file.size > MAX_PHOTO_BYTES) {
        throw new BadRequestException({
          error: 'FILE_TOO_LARGE',
          message: 'Each photo must be 5 MB or smaller',
        });
      }
    }

    await mkdir(this.dir(propertyId), { recursive: true });
    const saved = [];
    let order = count;
    for (const file of files) {
      const filename = `${randomUUID()}.${ALLOWED_MIME[file.mimetype]}`;
      await writeFile(path.join(this.dir(propertyId), filename), file.buffer);
      const [row] = await this.db
        .insert(propertyPhotos)
        .values({
          propertyId,
          ownerId,
          filename,
          contentType: file.mimetype,
          sizeBytes: file.size,
          sortOrder: order++,
        })
        .returning();
      saved.push(this.serialize(row));
    }
    return saved;
  }

  async remove(ownerId: string, propertyId: string, photoId: string) {
    await this.assertOwned(ownerId, propertyId);
    const [row] = await this.db
      .delete(propertyPhotos)
      .where(and(eq(propertyPhotos.id, photoId), eq(propertyPhotos.propertyId, propertyId)))
      .returning();
    if (!row) throw new NotFoundException('Photo not found');
    // The row is the source of truth; a leftover file is harmless, a missing
    // one must not turn a successful delete into a 500.
    await unlink(path.join(this.dir(propertyId), row.filename)).catch(() => undefined);
    return { deleted: true, photoId };
  }

  /** Returns the stream plus its content type, for the raw endpoint. */
  async readFile(ownerId: string, propertyId: string, photoId: string) {
    await this.assertOwned(ownerId, propertyId);
    const [row] = await this.db
      .select()
      .from(propertyPhotos)
      .where(and(eq(propertyPhotos.id, photoId), eq(propertyPhotos.propertyId, propertyId)))
      .limit(1);
    if (!row) throw new NotFoundException('Photo not found');
    return {
      stream: createReadStream(path.join(this.dir(propertyId), row.filename)),
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
    };
  }

  /** propertyId -> raw URL of its first photo, for list responses. */
  async coverUrls(propertyIds: string[]): Promise<Map<string, string>> {
    const rows = await this.db
      .select()
      .from(propertyPhotos)
      .where(inArray(propertyPhotos.propertyId, propertyIds))
      .orderBy(asc(propertyPhotos.sortOrder), asc(propertyPhotos.createdAt));
    const covers = new Map<string, string>();
    for (const r of rows) {
      if (!covers.has(r.propertyId)) {
        covers.set(r.propertyId, PropertyPhotosService.rawUrl(r.propertyId, r.id));
      }
    }
    return covers;
  }

  private serialize(r: typeof propertyPhotos.$inferSelect) {
    return {
      id: r.id,
      propertyId: r.propertyId,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
      url: PropertyPhotosService.rawUrl(r.propertyId, r.id),
    };
  }
}
