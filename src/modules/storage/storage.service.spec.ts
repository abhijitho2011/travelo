import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StorageService } from './storage.service';

const S3_ENV = {
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'https://bucket.example.invalid',
  S3_REGION: 'auto',
  S3_BUCKET: 'tavelo-storage',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
} as NodeJS.ProcessEnv;

describe('StorageService driver selection', () => {
  it('uses the s3 driver when STORAGE_DRIVER=s3 and the config is complete', () => {
    expect(new StorageService(S3_ENV).driver).toBe('s3');
  });

  it('defaults to the local driver when STORAGE_DRIVER is unset', () => {
    expect(new StorageService({} as NodeJS.ProcessEnv).driver).toBe('local');
  });

  it('honours an explicit STORAGE_DRIVER=local even with S3 credentials present', () => {
    expect(new StorageService({ ...S3_ENV, STORAGE_DRIVER: 'local' }).driver).toBe('local');
  });

  it('falls back to local instead of crashing when the S3 config is incomplete', () => {
    for (const missing of [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ]) {
      const env = { ...S3_ENV };
      delete env[missing];
      expect(new StorageService(env).driver).toBe('local');
    }
  });
});

describe('StorageService local driver', () => {
  let root: string;
  let svc: StorageService;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'storage-'));
    svc = new StorageService({ STORAGE_DRIVER: 'local', UPLOADS_DIR: root });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('writes, reads back and deletes an object by key', async () => {
    const key = 'properties/p1/a.png';
    await svc.put(key, Buffer.from('bytes'), 'image/png');
    expect(readFileSync(path.join(root, key), 'utf8')).toBe('bytes');

    await svc.delete(key);
    expect(() => readFileSync(path.join(root, key))).toThrow();
  });

  it('deleting a missing object is not an error', async () => {
    await expect(svc.delete('properties/p1/gone.png')).resolves.toBeUndefined();
  });

  it('refuses to escape the storage root via a traversal key', async () => {
    await svc.put('../../escaped.png', Buffer.from('x'), 'image/png');
    expect(readFileSync(path.join(root, 'escaped.png'), 'utf8')).toBe('x');
  });

  it('has no signing service, so it reports a local:// marker', async () => {
    await expect(svc.getSignedUrl('properties/p1/a.png')).resolves.toBe(
      'local://properties/p1/a.png',
    );
  });
});

describe('StorageService s3 driver', () => {
  it('presigns a GET without touching the network', async () => {
    const svc = new StorageService(S3_ENV);
    const url = await svc.getSignedUrl('properties/p1/a.png', 60);
    // Presigning is a pure local signature computation.
    expect(url).toContain('bucket.example.invalid');
    expect(url).toContain('/tavelo-storage/properties/p1/a.png'); // path-style
    expect(url).toContain('X-Amz-Expires=60');
    expect(url).toContain('X-Amz-Signature=');
  });

  it('honours the requested TTL', async () => {
    const svc = new StorageService(S3_ENV);
    await expect(svc.getSignedUrl('k', 120)).resolves.toContain('X-Amz-Expires=120');
  });
});
