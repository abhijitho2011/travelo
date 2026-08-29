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
The identity must also match an **ACTIVE** admin row. On boot the API attaches
`SUPER_ADMIN_MOBILE` to the admin whose email is `SUPER_ADMIN_EMAIL`, so changing
the number is enough — no seed run required. (`RUN_SEED=true` for one deploy does
the same thing plus creates the row if it is missing; it is idempotent and never
duplicates the super admin.)

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

---

# Staff auth (unified staff mobile app)

A **third** token family, fully isolated from admin and owner. Mounted at its
literal `/api/v1/staff/*` paths (excluded from the admin global prefix in
`main.ts`, exactly like the owner surface).

## Endpoints
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/staff/auth/otp/request` | body `{ mobile }`; **always** `{ message, expiresAt }`. An SMS goes out only when the mobile matches a live `hotel_staff` row — the response never differs. |
| POST | `/api/v1/staff/auth/otp/verify` | body `{ mobile, otp }` → `{ accessToken, refreshToken }`, ACTIVE only. |
| POST | `/api/v1/staff/auth/google` | body `{ idToken }`; matches the verified email to a live staff row. **Never auto-creates an account.** |
| POST | `/api/v1/staff/auth/refresh` | body `{ refreshToken }`; rotates. |
| POST | `/api/v1/staff/auth/logout` | Bearer staff token. |
| GET | `/api/v1/staff/auth/me` | `{ user, hotel, organization, role, permissions }`. |
| GET | `/api/v1/staff/team` | list staff at MY property. `staff.read`. Filters: `role`, `status`, `q`, `department`. |
| POST | `/api/v1/staff/team` | create at MY property. `staff.create` (GM/AGM only). |
| POST | `/api/v1/staff/team/:id/approve` | `PENDING_APPROVAL` → `ACTIVE`. `staff.approve` (GM/AGM). |
| POST | `/api/v1/staff/team/:id/status` | `ACTIVE\|BLOCKED\|SUSPENDED\|DEACTIVATED`. `staff.update`. |
| DELETE | `/api/v1/staff/team/:id` | soft delete. `staff.delete` (GM only). |

## Account-status gating
A staff row that exists but is not ACTIVE yields a typed code the app branches
on: `ACCOUNT_INVITED`, `ACCOUNT_PENDING_APPROVAL` (also used for `APPROVED` —
approved but not yet activated), `ACCOUNT_BLOCKED`, `ACCOUNT_SUSPENDED`,
`ACCOUNT_DEACTIVATED`. A number belonging to **nobody** still gets the generic
success on request and a generic `INVALID_OTP` on verify: the specific status is
disclosed only once possession of the number is proved.

## Tokens
- `STAFF_JWT_ACCESS_SECRET` / `STAFF_JWT_REFRESH_SECRET`, TTLs
  `STAFF_JWT_ACCESS_TTL` (15m) / `STAFF_JWT_REFRESH_TTL` (30d), issuer and
  audience `tavelo-staff`. Refresh tokens are argon2-hashed in `staff_sessions`.
- `StaffJwtGuard` re-reads the DB per request: the row must be live and ACTIVE
  and the session unrevoked, so blocking someone bites immediately. The role —
  and therefore the permission list — comes from the row, never from the token.
- Three-way isolation is enforced by three independent facts (distinct secret,
  distinct issuer/audience, distinct session table) and covered by
  `owner-token-isolation.spec.ts`.

## Roles and permissions
`src/modules/staff-auth/role-permissions.ts` is the server-side source of truth
mapping all 24 roles to dot-namespaced permissions. Security, housekeeping,
kitchen, cleaning, attendant, driving **and HR** roles hold **no** `finance.*`,
`revenue.*`, `payroll.*`, `payment.*`, `procurement.*` or `owner.*` permission.
`/auth/me` returns the resolved list; `StaffPermissionsGuard` re-checks it
server-side on every protected route.

## Tenant isolation
Every `/staff/team` route resolves its target by
`(id, propertyId = the caller's own, deleted_at IS NULL)`. A row at another
property returns **404**, not 403, so property membership never leaks. Nobody
may approve, re-status or delete their own row, and role is not editable through
this surface at all — the only place a role is chosen is on creation, from the
per-actor whitelist `creatableRolesFor(actorRole)` in
`src/modules/staff-auth/role-creation.ts`:

| Actor | May create |
| --- | --- |
| `GENERAL_MANAGER` | every role except GM and AGM (HR included) |
| `ASSISTANT_GENERAL_MANAGER` | every role except GM and AGM (HR included) |
| `HR` | every role except GM, AGM and HR itself |
| anyone else | nothing — they hold no `staff.create` |

A role nobody may create returns `ROLE_NOT_ASSIGNABLE`; a role this particular
actor may not create returns `ROLE_NOT_PERMITTED`. Both are 403.

`HR` holds `staff.read`, `staff.create`, `staff.update` and `profile.read` — and
crucially **not** `staff.approve`, so every account HR raises is written as
`PENDING_APPROVAL` and waits for a GM/AGM in the approval centre. The
`activate: true` shortcut on `POST /staff/team` is honoured only for a creator
holding `staff.approve`, which makes it inert for HR.

`POST /staff/team/:id/status` closes the matching back door: moving anybody
**to `ACTIVE`** requires `staff.approve`, not merely `staff.update`
(`ACTIVATION_NOT_PERMITTED` otherwise). Putting someone into service is the
approval decision whichever endpoint reaches it, so HR can block, suspend and
deactivate but never activate or reactivate.

## The chain
Super Admin → Owner → Property + GM/AGM → GM-created staff → staff app. All
three surfaces read the same `hotel_staff` table: `GET /api/v1/owner/staff` and
`GET /api/v1/owner/properties/:id/staff` show the owner everything, and
`GET /api/v1/admin/staff` / `POST /api/v1/admin/staff/:id/status`
(`staff.manage`, audited as `staff.status.changed`) give the super admin
platform-wide reach.
