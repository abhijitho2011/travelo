# Auth — Phase 1

## Endpoints (all under `/api/v1/admin`)
- `POST /auth/login` — body `{ email, password, mfaCode? }`; returns `{ admin, accessToken, refreshToken, expiresIn, refreshExpiresIn }`.
- `POST /auth/refresh` — body `{ refreshToken }`; rotates the refresh token, returns a new pair.
- `POST /auth/logout` — Bearer access token; revokes the current session.
- `GET /auth/me` — Bearer access token; returns admin + effective roles & permissions.
- `POST /auth/otp/request` — body `{ mobile }`; **always** `{ message, expiresAt }`, whether or not the number is allowlisted.
- `POST /auth/otp/verify` — body `{ mobile, otp }`; same success shape as `/auth/login`.
- `POST /auth/google` — body `{ idToken }` (Firebase ID token); same success shape as `/auth/login`.

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
  simply never sends) — boot is unaffected and **email+password keeps working as
  the break-glass path**.
- Error codes: `INVALID_OTP` (also used for a non-allowlisted mobile, so nothing
  leaks), `OTP_EXPIRED`, `OTP_THROTTLED`, `ADMIN_NOT_FOUND` (Google only),
  `ACCOUNT_BLOCKED`, `ACCOUNT_SUSPENDED`.
- OTPs are argon2-hashed in `admin_otps`, expire after `OTP_TTL_MIN`, allow
  `OTP_MAX_ATTEMPTS` tries, are rate-limited in Redis (1/30s, 5/hour, graceful
  degrade) and are never returned or logged (except `ConsoleSmsProvider`).
- Both methods issue the **same** admin session + token pair as password login
  (`AuthService.issueLoginForAdmin`) — there is no second token type, and admin
  tokens remain unusable by owner guards and vice-versa.

## Passwords
- Hashed with **argon2id** (`argon2` package). Static helpers `AuthService.hashPassword` / `verifyPassword`.
- Plaintext passwords never persisted.

## Tokens
- **Access token**: JWT signed with `JWT_ACCESS_SECRET`, TTL `JWT_ACCESS_TTL` (default `15m`). Claims: `sub` (admin id), `sid` (session id), `email`.
- **Refresh token**: JWT signed with `JWT_REFRESH_SECRET`, TTL `JWT_REFRESH_TTL` (default `30d`). Only its **argon2 hash** is stored in `admin_sessions.refresh_token_hash`.

## Sessions
- A row in `admin_sessions` is created on login with `refresh_token_hash`, `user_agent`, `ip`, `expires_at`.
- On `/auth/refresh` the presented token is argon2-verified against the stored hash; the row is then updated with a freshly signed refresh token's hash (**rotation**).
- Mismatch (possible replay/theft) → session `revoked_at` set immediately.
- `/auth/logout` sets `revoked_at`.
- Setting an admin's status to `Inactive` or `Blocked` revokes all their live sessions.

## JWT validation
`JwtStrategy.validate` re-checks the DB on every request: admin must be active & not soft-deleted, session must exist and not be revoked/expired. The strategy also populates the request-scoped `AsyncLocalStorage` context with `adminId` / `sessionId` so the audit service attributes writes automatically.

## Audit hooks
- `auth.login.success`, `auth.login.failed`, `auth.logout` are recorded via `AuditService.record` on every attempt.
- `admin.login.google`, `admin.login.otp` (success) and `admin.login.failed` (failure) carry the sign-in `method` and `ip`.
