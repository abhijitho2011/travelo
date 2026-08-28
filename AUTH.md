# Auth

> **Password sign-in has been removed.** The super-admin portal authenticates
> **only** through mobile OTP and Google, both gated by the environment
> allowlist below. `POST /auth/login` no longer exists (404). The
> `admins.password_hash` column is retained for historical rows but can no
> longer authenticate anyone.

## Endpoints (all under `/api/v1/admin`)
- `POST /auth/refresh` — body `{ refreshToken }`; rotates the refresh token, returns a new pair.
- `POST /auth/logout` — Bearer access token; revokes the current session.
- `GET /auth/me` — Bearer access token; returns admin + effective roles & permissions.
- `POST /auth/otp/request` — body `{ mobile }`; **always** `{ message, expiresAt }`, whether or not the number is allowlisted.
- `POST /auth/otp/verify` — body `{ mobile, otp }`; returns `{ admin, accessToken, refreshToken, expiresIn, refreshExpiresIn }`.
- `POST /auth/google` — body `{ idToken }` (Firebase ID token); same success shape.

## Super-admin allowlist (Google / mobile OTP)
Google and OTP sign-in are restricted to a single identity read from the
environment **on every attempt** — change the value and only the new identity
can sign in:

| Var | Purpose |
| --- | --- |
| `SUPER_ADMIN_EMAIL` | the only Google account allowed to sign in |
| `SUPER_ADMIN_MOBILE` | the only mobile allowed to receive a sign-in OTP |

- Enforced server-side in `AdminOtpService.isAllowlisted` (OTP) and
  `AdminAltAuthService.google` (Google). The client is never trusted.
- Mobiles are compared through `normalizeMobile`, so `9895077492`,
  `+919895077492` and `09895077492` are the same number; emails are trimmed and
  lower-cased. The env value is normalised identically.
- The identity must also resolve to an **ACTIVE** admin row.
- Unset var ⇒ that method is cleanly disabled (`GOOGLE_SIGNIN_DISABLED`, and OTP
  simply never sends) — boot is never affected. If **both** are unset the app
  logs a prominent WARN at boot saying sign-in is impossible.
- Error codes: `INVALID_OTP` (also used for a non-allowlisted mobile, so nothing
  leaks), `OTP_EXPIRED`, `OTP_THROTTLED`, `ADMIN_NOT_FOUND` (Google only),
  `ACCOUNT_BLOCKED`, `ACCOUNT_SUSPENDED`.
- OTPs are argon2-hashed in `admin_otps`, expire after `OTP_TTL_MIN`, allow
  `OTP_MAX_ATTEMPTS` tries, are rate-limited in Redis (1/30s, 5/hour, graceful
  degrade) and are never returned or logged (except `ConsoleSmsProvider`).
- Both methods issue the **same** admin session + token pair as password login
  (`AuthService.issueLoginForAdmin`) — there is no second token type, and admin
  tokens remain unusable by owner guards and vice-versa.

## Recovery (no password fallback exists — read this first)

**The allowlist points at the wrong identity.** Update the Railway variable on
the API service and redeploy:

```
railway variables --set SUPER_ADMIN_MOBILE=9895077492   # or SUPER_ADMIN_EMAIL=…
```

(or edit it in the Railway dashboard → service → Variables). The check reads the
env on every attempt, so the new identity works as soon as the service restarts.
The identity must also match an **ACTIVE** admin row: set `RUN_SEED=true` for one
deploy and the seed updates the existing super admin's email/mobile to match env
(idempotent, never creates a duplicate).

**SMS did not arrive.** Request the code as usual, then open the Railway deploy
log for the API service and look for:

```
WARN [AdminAltAuthService] [ADMIN-OTP] code for ******7492: 123456
```

That line is written **only when SMS dispatch fails** — never on the success
path, and never to the HTTP response. Enter the code in the portal as normal.
Setting `SMS_PROVIDER=console` makes every code appear in the log (dev only).

**Nothing works at all.** The boot log carries
`*** ADMIN SIGN-IN IS IMPOSSIBLE … ***` when neither variable is set — set at
least one and redeploy.

## Secret hashing
- argon2id (`argon2` package) via `AuthService.hashPassword` / `verifyPassword`.
  These now protect **refresh tokens and OTPs only** — not sign-in credentials.

## Tokens
- **Access token**: JWT signed with `JWT_ACCESS_SECRET`, TTL `JWT_ACCESS_TTL` (default `15m`). Claims: `sub` (admin id), `sid` (session id), `email`.
- **Refresh token**: JWT signed with `JWT_REFRESH_SECRET`, TTL `JWT_REFRESH_TTL` (default `30d`). Only its **argon2 hash** is stored in `admin_sessions.refresh_token_hash`.

## Sessions
- A row in `admin_sessions` is created on a successful OTP/Google sign-in with `refresh_token_hash`, `user_agent`, `ip`, `expires_at`.
- On `/auth/refresh` the presented token is argon2-verified against the stored hash; the row is then updated with a freshly signed refresh token's hash (**rotation**).
- Mismatch (possible replay/theft) → session `revoked_at` set immediately.
- `/auth/logout` sets `revoked_at`.
- Setting an admin's status to `Inactive` or `Blocked` revokes all their live sessions.

## JWT validation
`JwtStrategy.validate` re-checks the DB on every request: admin must be active & not soft-deleted, session must exist and not be revoked/expired. The strategy also populates the request-scoped `AsyncLocalStorage` context with `adminId` / `sessionId` so the audit service attributes writes automatically.

## Audit hooks
- `admin.login.google`, `admin.login.otp` (success) and `admin.login.failed` (failure) are recorded via `AuditService.record` on every attempt, carrying the sign-in `method` and `ip`.
- `auth.logout` is recorded on sign-out.
