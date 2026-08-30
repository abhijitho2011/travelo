import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { properties, propertyPhotos } from '../../database/schema';
import { StorageService } from '../storage/storage.service';
import { PropertiesService } from '../properties/properties.service';
import { OwnerErrors } from './owner-errors';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB per file
export const MAX_PHOTOS_PER_PROPERTY = 10;
/** Photo URLs are short-lived: long enough to render a page, not to be shared. */
export const PHOTO_URL_TTL_SECONDS = 3600;

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
 * Photo bytes live in the object store under `properties/<propertyId>/<uuid>.<ext>`;
 * Postgres holds only the key. Clients receive presigned URLs, so the API never
 * proxies image bytes and there is no publicly listable directory.
 */
@Injectable()
export class PropertyPhotosService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly storage: StorageService,
    private readonly propertiesService: PropertiesService,
  ) {}

  static objectKey(propertyId: string, ext: string): string {
    return `properties/${propertyId}/${randomUUID()}.${ext}`;
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
    return Promise.all(rows.map((r) => this.serialize(r)));
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

    // Validate everything before writing anything, so a bad file in the batch
    // cannot leave half of it uploaded.
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

    const saved = [];
    let order = count;
    for (const file of files) {
      const key = PropertyPhotosService.objectKey(propertyId, ALLOWED_MIME[file.mimetype]);
      await this.storage.put(key, file.buffer, file.mimetype);
      const [row] = await this.db
        .insert(propertyPhotos)
        .values({
          propertyId,
          ownerId,
          storageKey: key,
          contentType: file.mimetype,
          sizeBytes: file.size,
          sortOrder: order++,
        })
        .returning();
      saved.push(await this.serialize(row));
    }
    // Photo count feeds the listing-completeness score.
    await this.propertiesService.recomputeCompleteness(propertyId);
    return saved;
  }

  async remove(ownerId: string, propertyId: string, photoId: string) {
    await this.assertOwned(ownerId, propertyId);
    const [row] = await this.db
      .delete(propertyPhotos)
      .where(and(eq(propertyPhotos.id, photoId), eq(propertyPhotos.propertyId, propertyId)))
      .returning();
    if (!row) throw new NotFoundException('Photo not found');
    // The row is the source of truth; a leftover object is harmless, and a
    // missing one must not turn a successful delete into a 500.
    await this.storage.delete(row.storageKey).catch(() => undefined);
    await this.propertiesService.recomputeCompleteness(propertyId);
    return { deleted: true, photoId };
  }

  /**
   * What the raw endpoint needs: a presigned URL to redirect to under the s3
   * driver, or a readable stream under the local driver (which cannot sign).
   */
  async resolveForServing(ownerId: string, propertyId: string, photoId: string) {
    await this.assertOwned(ownerId, propertyId);
    const [row] = await this.db
      .select()
      .from(propertyPhotos)
      .where(and(eq(propertyPhotos.id, photoId), eq(propertyPhotos.propertyId, propertyId)))
      .limit(1);
    if (!row) throw new NotFoundException('Photo not found');
    if (this.storage.driver === 's3') {
      return {
        url: await this.storage.getSignedUrl(row.storageKey, PHOTO_URL_TTL_SECONDS),
        contentType: row.contentType,
        stream: null,
      };
    }
    return {
      url: null,
      contentType: row.contentType,
      stream: this.storage.createLocalReadStream(row.storageKey),
    };
  }

  /** propertyId -> presigned URL of its first photo, for list responses. */
  async coverUrls(propertyIds: string[]): Promise<Map<string, string>> {
    const rows = await this.db
      .select()
      .from(propertyPhotos)
      .where(inArray(propertyPhotos.propertyId, propertyIds))
      .orderBy(asc(propertyPhotos.sortOrder), asc(propertyPhotos.createdAt));
    const firsts = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!firsts.has(r.propertyId)) firsts.set(r.propertyId, r);
    const covers = new Map<string, string>();
    await Promise.all(
      [...firsts].map(async ([propertyId, row]) => {
        covers.set(propertyId, await this.urlFor(propertyId, row.id, row.storageKey));
      }),
    );
    return covers;
  }

  /**
   * s3 gives a presigned URL the client can fetch directly; the local driver has
   * nothing to sign, so callers are pointed back at the owner-scoped raw route.
   */
  private async urlFor(propertyId: string, photoId: string, key: string): Promise<string> {
    if (this.storage.driver === 's3') {
      return this.storage.getSignedUrl(key, PHOTO_URL_TTL_SECONDS);
    }
    return `/api/v1/owner/properties/${propertyId}/photos/${photoId}/raw`;
  }

  private async serialize(r: typeof propertyPhotos.$inferSelect) {
    return {
      id: r.id,
      propertyId: r.propertyId,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
      url: await this.urlFor(r.propertyId, r.id, r.storageKey),
      expiresInSeconds: PHOTO_URL_TTL_SECONDS,
    };
  }
}
