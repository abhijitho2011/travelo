/**
 * Mints every token family the API accepts — and several it must not.
 *
 * The secrets and the issuer/audience pairs are read from the same constants
 * production uses, so a rename in `impersonation.constants.ts` or
 * `staff-jwt.guard.ts` breaks these helpers instead of silently turning a
 * cross-family rejection test into a test of two unrelated random strings.
 */
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { TEST_ENV } from './security-harness';
import { OWNER_ISSUER, OWNER_AUDIENCE } from '../modules/owner-auth/owner-jwt.guard';
import { STAFF_ISSUER, STAFF_AUDIENCE } from '../modules/staff-auth/staff-jwt.guard';
import {
  IMPERSONATION_ISSUER,
  IMPERSONATION_AUDIENCE,
} from '../modules/impersonation/impersonation.constants';
import {
  MFA_CHALLENGE_ISSUER,
  MFA_CHALLENGE_AUDIENCE,
} from '../modules/auth/admin-mfa.service';

const jwt = new JwtService({});

export const ADMIN_SECRET = TEST_ENV.JWT_ACCESS_SECRET;
export const ADMIN_REFRESH_SECRET = TEST_ENV.JWT_REFRESH_SECRET;
export const OWNER_SECRET = TEST_ENV.OWNER_JWT_ACCESS_SECRET;
export const STAFF_SECRET = TEST_ENV.STAFF_JWT_ACCESS_SECRET;

export interface Ids {
  sub?: string;
  sid?: string;
  email?: string;
}

/** Admin access token — deliberately issuer/audience-free, as `AuthService` mints it. */
export function adminToken(ids: Ids = {}, opts: Record<string, unknown> = {}): string {
  return jwt.sign(
    { sub: ids.sub ?? 'admin-1', sid: ids.sid ?? 'admin-sess-1', email: ids.email ?? 'a@tavelo.test' },
    { secret: ADMIN_SECRET, expiresIn: '15m', ...opts },
  );
}

export function ownerToken(ids: Ids = {}, opts: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      sub: ids.sub ?? 'owner-1',
      sid: ids.sid ?? 'owner-sess-1',
      email: ids.email ?? 'o@hotel.test',
      typ: 'access',
    },
    {
      secret: OWNER_SECRET,
      issuer: OWNER_ISSUER,
      audience: OWNER_AUDIENCE,
      expiresIn: '15m',
      ...opts,
    },
  );
}

export function staffToken(
  ids: Ids & { pid?: string; role?: string } = {},
  opts: Record<string, unknown> = {},
): string {
  return jwt.sign(
    {
      sub: ids.sub ?? 'staff-1',
      sid: ids.sid ?? 'staff-sess-1',
      pid: ids.pid ?? 'prop-1',
      role: ids.role ?? 'RECEPTIONIST',
      typ: 'access',
    },
    {
      secret: STAFF_SECRET,
      issuer: STAFF_ISSUER,
      audience: STAFF_AUDIENCE,
      expiresIn: '15m',
      ...opts,
    },
  );
}

export function impersonationToken(
  payload: Record<string, unknown> = {},
  opts: Record<string, unknown> = {},
): string {
  return jwt.sign(
    {
      sessionId: 'imp-1',
      actorAdminId: 'admin-1',
      targetUserId: 'owner-1',
      ...payload,
    },
    {
      secret: ADMIN_SECRET,
      issuer: IMPERSONATION_ISSUER,
      audience: IMPERSONATION_AUDIENCE,
      jwtid: 'jti-1',
      expiresIn: '60m',
      ...opts,
    },
  );
}

/**
 * The 5-minute second-factor challenge. It is signed with the ADMIN access
 * secret, which is precisely why presenting it as a session token has to be
 * refused on its own merits rather than by the signature failing.
 */
export function mfaChallengeToken(adminId = 'admin-1'): string {
  return jwt.sign(
    { sub: adminId, method: 'otp', typ: 'mfa_challenge' },
    {
      secret: ADMIN_SECRET,
      issuer: MFA_CHALLENGE_ISSUER,
      audience: MFA_CHALLENGE_AUDIENCE,
      expiresIn: '300s',
    },
  );
}

// ------------------------------------------------------------ forgeries ---

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** `{"alg":"none"}` with an empty signature — the classic library bypass. */
export function algNoneToken(payload: Record<string, unknown>): string {
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
}

/**
 * Re-encodes the payload of a genuine token while keeping its original
 * signature: the tamper a naive "decode, then trust" implementation misses.
 */
export function tamperedPayload(token: string, patch: Record<string, unknown>): string {
  const [header, body, signature] = token.split('.');
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  return `${header}.${b64({ ...decoded, ...patch })}.${signature}`;
}

/** A structurally perfect token signed with the wrong key. */
export function wrongSecretToken(payload: Record<string, unknown>, header: unknown = { alg: 'HS256', typ: 'JWT' }): string {
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const sig = createHmac('sha256', 'an-attacker-controlled-secret-32chars')
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${sig}`;
}
