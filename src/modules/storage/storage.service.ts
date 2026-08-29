import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type StorageDriver = 's3' | 'local';

/** Default lifetime of a presigned GET URL. */
export const DEFAULT_SIGNED_URL_TTL = 3600;

/**
 * One object store for every binary the platform holds — property photos and
 * invoice documents alike.
 *
 * The driver is chosen from STORAGE_DRIVER. `s3` talks to the Railway bucket
 * (path-style, since it is not real AWS); `local` writes to the mounted volume
 * and is the dev/fallback driver. Missing or incomplete S3 configuration falls
 * back to `local` with a warning rather than crashing boot, so a
 * misconfiguration degrades instead of taking the API down.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  readonly driver: StorageDriver;
  private readonly bucket: string;
  private readonly client: S3Client | null;
  private readonly localRoot: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.localRoot = env.UPLOADS_DIR?.trim() || path.resolve(process.cwd(), 'uploads');
    this.bucket = env.S3_BUCKET?.trim() ?? '';

    const wantsS3 = (env.STORAGE_DRIVER?.trim() || 'local') === 's3';
    const endpoint = env.S3_ENDPOINT?.trim();
    const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
    const complete = !!(endpoint && accessKeyId && secretAccessKey && this.bucket);

    if (wantsS3 && !complete) {
      this.log.warn('STORAGE_DRIVER=s3 but S3 configuration is incomplete — using local driver');
    }

    if (wantsS3 && complete) {
      this.driver = 's3';
      this.client = new S3Client({
        endpoint,
        region: env.S3_REGION?.trim() || 'auto',
        credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
        // Non-AWS S3 endpoints do not support virtual-host style buckets.
        forcePathStyle: true,
      });
    } else {
      this.driver = 'local';
      this.client = null;
    }
  }

  /** Absolute path for a key under the local driver. */
  private localPath(key: string): string {
    // Keys are built by this codebase, never by a client, but a traversal guard
    // is cheap insurance if that ever changes.
    const safe = path.normalize(key).replace(/^(\.\.[/\\])+/, '');
    return path.join(this.localRoot, safe);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.driver === 's3' && this.client) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return;
    }
    const target = this.localPath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  /**
   * A time-limited GET URL. Under the local driver there is no signing service,
   * so the caller is handed the API's own streaming route instead.
   */
  async getSignedUrl(key: string, ttlSeconds: number = DEFAULT_SIGNED_URL_TTL): Promise<string> {
    if (this.driver === 's3' && this.client) {
      return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: ttlSeconds,
      });
    }
    return `local://${key}`;
  }

  async delete(key: string): Promise<void> {
    if (this.driver === 's3' && this.client) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return;
    }
    // A missing file must not turn a successful delete into a 500.
    await unlink(this.localPath(key)).catch(() => undefined);
  }

  /** Local-driver read, used by the fallback streaming route. */
  createLocalReadStream(key: string) {
    return createReadStream(this.localPath(key));
  }
}
