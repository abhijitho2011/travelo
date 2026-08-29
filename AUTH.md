# Auth

Tavelo has **three auth surfaces and five token types**. No token from one
surface is accepted by another; the isolation rests on three independent facts
per family — a distinct secret, a distinct issuer/audience pair, and a distinct
session table — and is covered by `owner-token-isolation.spec.ts`.

## Token families at a glance

| Family | Issuer / audience | Signed with | TTL | Session table | Accepted by |
| --- | --- | --- | --- | --- | --- |
| Admin access | `tavelo-admin` | `JWT_ACCESS_SECRET` | `JWT_ACCESS_TTL` (15m) | `admin_sessions` | `JwtAuthGuard` |
| Admin refresh | `tavelo-admin` | `JWT_REFRESH_SECRET` | `JWT_REFRESH_TTL` (30d) | `admin_sessions` (argon2 hash) | `POST /auth/refresh` |
| Admin MFA challenge | `tavelo-admin-mfa` | `JWT_ACCESS_SECRET` | **5 min**, fixed | none | `POST /auth/mfa` only |
| Owner access | `tavelo-owner` | `OWNER_JWT_ACCESS_SECRET` | `OWNER_JWT_ACCESS_TTL` (15m) | `owner_sessions` | `OwnerJwtGuard` |
| Owner refresh | `tavelo-owner` | `OWNER_JWT_REFRESH_SECRET` | `OWNER_JWT_REFRESH_TTL` (30d) | `owner_sessions` (argon2 hash) | `POST /api/v1/owner/auth/refresh` |
| Staff access | `tavelo-staff` | `STAFF_JWT_ACCESS_SECRET` | `STAFF_JWT_ACCESS_TTL` (15m) | `staff_sessions` | `StaffJwtGuard` |
| Staff refresh | `tavelo-staff` | `STAFF_JWT_REFRESH_SECRET` | `STAFF_JWT_REFRESH_TTL` (30d) | `staff_sessions` (argon2 hash) | `POST /api/v1/staff/auth/refresh` |
| Impersonation | `tavelo-impersonation` | `JWT_ACCESS_SECRET` | ~60 min | `impersonation_sessions` | `OwnerJwtGuard` **only**, read-only |

Three properties hold across every family:

- **Refresh tokens are stored only as argon2id hashes.** A leaked database dump
  does not yield usable sessions.
- **Rotation on every refresh**, and a hash mismatch (the signature of a replay)
  revokes the session immediately rather than just failing the call.
- **Every access token is re-checked against the database on every request.**
  The account must still be live and active and the session unrevoked, so
  blocking someone takes effect on their next call — not when their token
  expires.

⚠️ `OWNER_JWT_*` and `STAFF_JWT_*` have **working placeholder defaults** in
`src/config/env.ts`. A deployment that never sets them boots silently with
forgeable owner and staff tokens. See the
[production checklist](./DEPLOYMENT.md#before-you-call-it-production).

---

# Admin auth (`/api/v1/admin`)

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

# Owner auth (`/api/v1/owner`)

The owner surface is mounted at its **literal** `/api/v1/owner/*` paths,
excluded from the admin global prefix in `main.ts`
(`owner-route-mounting.spec.ts` guards that).

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/owner/auth/otp/request` | body `{ mobile }` → `{ message, expiresAt }` |
| POST | `/api/v1/owner/auth/otp/verify` | body `{ mobile, otp }` → token pair |
| POST | `/api/v1/owner/auth/google` | body `{ idToken }` (Firebase ID token) |
| POST | `/api/v1/owner/auth/refresh` | body `{ refreshToken }`; rotates |
| POST | `/api/v1/owner/auth/logout` | Bearer owner token |
| GET | `/api/v1/owner/auth/me` | owner profile, plus the `impersonation` block under a support session |
| GET / PATCH | `/api/v1/owner/profile` | read / update own profile |
| GET | `/api/v1/owner/sessions` | own live sessions |
| POST | `/api/v1/owner/sessions/revoke-all` | sign out everywhere |
| DELETE | `/api/v1/owner/sessions/:id` | revoke one session |

There is **no owner self-registration.** An owner row is created by an admin
(`POST /api/v1/admin/owners`); OTP and Google both resolve an *existing* row and
never auto-create one.

## OTP

- Codes are argon2id-hashed in `owner_otps`, expire after `OTP_TTL_MIN`
  (default 10) and allow `OTP_MAX_ATTEMPTS` (default 5) verify attempts.
- Rate limited in Redis per mobile: **1 request / 30s** and **5 / hour**
  (`owner:otp:req:30s:*`, `owner:otp:req:hr:*`). Without Redis the limiter
  degrades open rather than failing the request.
- `POST /otp/request` returns the same `{ message, expiresAt }` whether or not
  the number belongs to a live ACTIVE owner. Nothing is disclosed until
  possession of the number is proved.

## Account-status gating

The owner row must be `ACTIVE` and not soft-deleted. Typed codes from
`src/modules/owner-auth/owner-errors.ts`:

| Code | HTTP | When |
| --- | --- | --- |
| `INVALID_OTP` | 401 | wrong code, exhausted attempts, or a non-ACTIVE status that must not be disclosed |
| `OTP_EXPIRED` | 401 | past `expiresAt` |
| `OTP_THROTTLED` | 429 | rate limit hit |
| `ACCOUNT_SUSPENDED` | 403 | `owners.status = SUSPENDED` |
| `ACCOUNT_BLOCKED` | 403 | `owners.status = BLOCKED` |
| `OWNER_NOT_FOUND` | 404 | Google email matches no live owner |

## Guard

`OwnerJwtGuard` verifies against `OWNER_JWT_ACCESS_SECRET` with issuer and
audience `tavelo-owner`, then re-reads the owner and the `owner_sessions` row.
`refresh` additionally re-checks `owner.status === 'ACTIVE'`, so suspending an
owner ends their access at the next refresh at the latest.

It has exactly **one** exception: a `tavelo-impersonation` token whose session
targets an OWNER. That path is read-only and re-authorised on every request —
see [IMPERSONATION.md](./IMPERSONATION.md).

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

---

# Impersonation (Tavelo Support standing in an owner's shoes)

`POST /api/v1/admin/impersonation` mints a token in a FOURTH family —
issuer/audience `tavelo-impersonation`, signed with the admin access secret,
~60 minute TTL — carrying `actorAdminId`, `targetUserId` and `sessionId`, and
backed by a row in `impersonation_sessions`.

## How an impersonated request is authorised

`OwnerJwtGuard` recognises the token by its issuer, then hands it to
`ImpersonationAccessService.authenticate()`, which:

1. verifies signature + issuer + audience against `JWT_ACCESS_SECRET`;
2. **re-reads the `impersonation_sessions` row on every single request** and
   requires `status = 'ACTIVE'` with no `ended_at`;
3. requires the row's `token_jti` to match the token's `jti`;
4. requires `target_user_type = 'OWNER'`.

Point 2 is the important one: `POST /api/v1/admin/impersonation/:id/terminate`
takes effect on the support agent's **next request**, not when the token
expires. Revocation is not deferred to token lifetime.

## READ-ONLY — and why

Impersonated requests may only use `GET` / `HEAD` / `OPTIONS`. Every
state-changing verb is refused with a typed **`IMPERSONATION_READ_ONLY`**
(HTTP 403) *in the guard*, before any controller runs.

- A write made under impersonation is, to the customer, indistinguishable from
  one they made themselves. "I never cancelled that booking" is an argument no
  audit trail fully wins.
- Support's job is to **diagnose** and then tell the customer what to do, or to
  act through the admin console under their own admin identity — where the
  permission model and the audit trail already name them as the actor.
- It reduces a leaked impersonation token from a data-destruction incident to a
  disclosure one.

`WRITE_ALLOWLIST` in `src/modules/impersonation/impersonation-access.service.ts`
is the escape hatch and is **deliberately empty**. Adding an entry is a security
decision: narrowly scoped, idempotent, clearly support-owned, and reviewed as
such. Do not widen it to unblock a support workflow — take that workflow to the
admin console.

## Dual-identity audit

While serving an impersonated request the guard writes BOTH identities into the
AsyncLocalStorage request context (`actorAdminId` + `adminId` + `adminEmail` =
the real admin, `impersonatedUserId` + `impersonationSessionId` = the customer).
`AuditService.record()` reads both, so every `audit_logs` row written during a
support session names the employee who is responsible *and* the account whose
data was touched. An ordinary owner request leaves `impersonated_user_id` null.

## Client signal

`GET /api/v1/owner/auth/me` adds an `impersonation: { active, byAdmin,
byAdminEmail, sessionId, startedAt, readOnly }` block under a support session.
The owner app renders a permanent banner from it and disables every write
control, so the read-only rule is visible rather than a surprise at submit time.

---

# Admin TOTP MFA (opt-in)

Per-admin, never mandatory. `admins.mfa_enabled` / `admins.mfa_secret` (which
predated the feature) now carry it.

- **Secret at rest**: AES-256-GCM, `v1:<iv>:<tag>:<ct>`, keyed by
  `MFA_SECRET_KEY` (32 raw bytes, base64). With no usable key, **enrolment is
  refused** with `MFA_NOT_CONFIGURED` — a plaintext TOTP secret is never stored.
- **Enrol** `POST /api/v1/admin/profile/mfa/enroll` → `otpauth://` URI, an
  inline data-URI QR, and 10 recovery codes returned **once** (argon2id hashes
  in `admin_mfa_recovery_codes`). This does NOT switch MFA on.
- **Verify** `POST /api/v1/admin/profile/mfa/verify` `{code}` → proves the
  authenticator works, then flips `mfa_enabled`.
- **Disable** `POST /api/v1/admin/profile/mfa/disable` `{code}` → requires a
  live TOTP or an unused recovery code.

## Login challenge

When `mfa_enabled`, OTP-verify and Google sign-in **do not return tokens**. They
return `{ mfaRequired: true, mfaToken }` — a 5-minute, single-purpose JWT under
its own issuer/audience `tavelo-admin-mfa`, with no session behind it and no
authority of its own. Only `POST /api/v1/admin/auth/mfa` `{ mfaToken, code }`
exchanges it for a real session. A recovery code is accepted there too and is
burned (`used_at`) so it can never be replayed. Repeated failures lock the
challenge step for `MFA_LOCK_SECONDS` after `MFA_MAX_ATTEMPTS`.
