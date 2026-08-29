import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for the admin TOTP shared secret.
 *
 * A TOTP secret is a bearer credential: anyone holding it can mint valid codes
 * forever. Storing it in plaintext would mean a single SELECT on `admins`
 * defeats the second factor entirely, so it is sealed with AES-256-GCM under a
 * key that lives only in the environment (`MFA_SECRET_KEY`).
 *
 * Format: `v1:<iv b64>:<auth tag b64>:<ciphertext b64>`. The version prefix is
 * there so a future key rotation or algorithm change can be told apart from a
 * corrupt value instead of guessed at.
 */
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class MfaKeyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MfaKeyUnavailableError';
  }
}

/**
 * Decodes and validates MFA_SECRET_KEY. Returns null when it is simply absent
 * (a deployment that has not opted into MFA); throws when it is present but
 * unusable, because silently ignoring a misconfigured key would be worse.
 */
export function resolveMfaKey(raw: string | undefined | null): Buffer | null {
  if (!raw || raw.trim() === '') return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), 'base64');
  } catch {
    throw new MfaKeyUnavailableError('MFA_SECRET_KEY is not valid base64');
  }
  if (key.length !== KEY_BYTES) {
    throw new MfaKeyUnavailableError(
      `MFA_SECRET_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }
  return key;
}

export function encryptMfaSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/**
 * Returns null for anything that does not decrypt cleanly — a value from a
 * previous key, a truncated column, a tampered ciphertext. The caller treats
 * that as "this admin has no usable secret" rather than as a crash.
 */
export function decryptMfaSecret(stored: string, key: Buffer): string | null {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ct = Buffer.from(parts[3], 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** True when the column holds a sealed value rather than a bare base32 secret. */
export function isEncryptedMfaSecret(stored: string): boolean {
  return stored.startsWith(`${VERSION}:`) && stored.split(':').length === 4;
}
