import { Throttle } from '@nestjs/throttler';

/**
 * The tight rate-limit tier for credential-bearing endpoints — login, OTP
 * request/verify, Google exchange and MFA. It caps the `auth` throttler bucket
 * (default 10 requests / 60s per IP, see `AUTH_THROTTLE_LIMIT`) so a brute-force
 * or OTP-farming run is throttled well before it reaches the broad `default`
 * ceiling that ordinary API traffic shares.
 *
 * This is defence in depth: the OTP services keep their own per-mobile limits;
 * this bounds the endpoint per IP regardless of which mobile is targeted.
 */
export const AuthThrottle = () =>
  Throttle({
    auth: {
      limit: Number(process.env['AUTH_THROTTLE_LIMIT'] ?? 10),
      ttl: Number(process.env['AUTH_THROTTLE_TTL'] ?? 60) * 1000,
    },
  });
