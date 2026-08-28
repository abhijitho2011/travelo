# Auth — Phase 1

## Endpoints (all under `/api/v1/admin`)
- `POST /auth/login` — body `{ email, password, mfaCode? }`; returns `{ admin, accessToken, refreshToken, expiresIn, refreshExpiresIn }`.
- `POST /auth/refresh` — body `{ refreshToken }`; rotates the refresh token, returns a new pair.
- `POST /auth/logout` — Bearer access token; revokes the current session.
- `GET /auth/me` — Bearer access token; returns admin + effective roles & permissions.

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
