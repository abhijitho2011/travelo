/**
 * The impersonation token family. A FOURTH issuer/audience alongside
 * tavelo-owner / tavelo-staff / the admin tokens, so an impersonation token can
 * never be mistaken for a real owner session (and vice versa) even though it is
 * signed with the admin access secret.
 */
export const IMPERSONATION_ISSUER = 'tavelo-impersonation';
export const IMPERSONATION_AUDIENCE = 'tavelo-impersonation';
export const IMPERSONATION_TTL_SECONDS = 60 * 60;
