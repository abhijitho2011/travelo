# Impersonation

Tavelo Support can look at an owner's account **through the owner's own eyes** —
same API, same data, same empty states — without asking for their password and
without touching anything.

Source: `src/modules/impersonation/`.

## Security model in one table

| Property | Value | Why |
| --- | --- | --- |
| Token family | issuer + audience `tavelo-impersonation` | never mistakable for a real owner token |
| Signed with | `JWT_ACCESS_SECRET` (the **admin** secret) | only the admin surface can mint one |
| TTL | `IMPERSONATION_TTL_SECONDS = 3600` (60 min) | short enough to bound a leak |
| Backing row | `impersonation_sessions`, re-read **every request** | revocation is immediate, not deferred to expiry |
| Binding | the row's `token_jti` must equal the token's `jti` | one token per session; an old token cannot ride a new session |
| Accepted by | `OwnerJwtGuard` **only**, and only when `target_user_type = 'OWNER'` | the admin and staff surfaces reject it outright |
| Verbs allowed | `GET`, `HEAD`, `OPTIONS` | see below |
| Permission to start | `impersonation.start` | admin RBAC |
| Reason | **required** on start | no silent look-ups |

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/api/v1/admin/impersonation` | `impersonation.start` |
| GET | `/api/v1/admin/impersonation/history` | `impersonation.view` |
| GET | `/api/v1/admin/impersonation/:id` | `impersonation.view` |
| POST | `/api/v1/admin/impersonation/:id/terminate` | `impersonation.stop` |

Start body:

```json
{ "targetUserType": "OWNER", "targetOwnerId": "<uuid>", "reason": "ticket #4821 — invoice not visible" }
```

`targetUserType` is one of `OWNER`, `GM`, `AGM`; only `OWNER` is currently
usable, because `OwnerJwtGuard` is the only guard that accepts the family.
`targetUserId` and `targetOwnerId` are interchangeable for an OWNER session —
the service fills in whichever the caller omitted, so the owner API can resolve
the subject without knowing which field the console happened to populate.

Response: `{ session, token, expiresInSeconds: 3600 }`.

## How an impersonated request is authorised

`OwnerJwtGuard` recognises the token by its issuer and hands it to
`ImpersonationAccessService.authenticate()`, which:

1. verifies signature, issuer and audience against `JWT_ACCESS_SECRET`;
2. **re-reads the `impersonation_sessions` row** and requires
   `status = 'ACTIVE'` with no `ended_at`;
3. requires `row.token_jti === payload.jti`;
4. requires `target_user_type = 'OWNER'`.

Step 2 is the one that matters. `POST /impersonation/:id/terminate` takes effect
on the support agent's **next request**. Revocation is not left to the token's
lifetime.

## Read-only — and why

Every state-changing verb is refused with a typed **`IMPERSONATION_READ_ONLY`**
(HTTP 403) **in the guard**, before any controller runs.
`READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])`.

- A write made under impersonation is, to the customer, indistinguishable from
  one they made themselves. *"I never cancelled that booking"* is an argument no
  audit trail fully wins.
- Support's job is to **diagnose**, then either tell the customer what to do or
  act through the admin console **under their own admin identity** — where the
  permission model and the audit trail already name them as the actor.
- It downgrades a leaked impersonation token from a data-destruction incident to
  a disclosure one.

`WRITE_ALLOWLIST` in `impersonation-access.service.ts` is the escape hatch and
is **deliberately empty**:

```ts
export const WRITE_ALLOWLIST: ReadonlyArray<ImpersonationWriteAllowance> = [];
```

Adding an entry is a security decision, not a convenience. It would have to be
narrowly scoped, idempotent, clearly support-owned, and reviewed as such. Do not
widen it to unblock a support workflow — take that workflow to the admin
console.

## Dual-identity audit

While serving an impersonated request the guard writes **both** identities into
the `AsyncLocalStorage` request context:

| Context field | Who |
| --- | --- |
| `actorAdminId`, `adminId`, `adminEmail` | the real Tavelo employee |
| `impersonatedUserId`, `impersonationSessionId` | the customer whose data is being read |

`AuditService.record()` reads both without any call site knowing about
impersonation, so every `audit_logs` row written during a support session names
the employee who is responsible **and** the account whose data was touched. An
ordinary owner request leaves `impersonated_user_id` null.

The `actorId ?? ctx.adminId ?? ctx.actorAdminId` fallback in `AuditService` is
what makes this work on **owner-API routes**, where nothing ever sets
`ctx.adminId` from an admin JWT.

Session lifecycle itself is audited too: `impersonation.started` (carrying the
reason) and `impersonation.terminated` (carrying the whole prior row).

## The customer can see it

`GET /api/v1/owner/auth/me` gains an `impersonation` block under a support
session:

```json
{ "active": true, "byAdmin": "…", "byAdminEmail": "…",
  "sessionId": "…", "startedAt": "…", "readOnly": true }
```

The owner app renders a permanent, unmissable banner from it and disables every
write control. The read-only rule is therefore visible up front rather than a
surprise at submit time — and the customer always knows when someone is looking.

## How to use it

1. Have a reason. It is a required field and it lands in the audit log.
2. `POST /api/v1/admin/impersonation` with the owner id → you get a token.
3. Call the **owner** API with `Authorization: Bearer <that token>`. Not the
   admin API.
4. Read what you need. Any write will 403.
5. `POST /api/v1/admin/impersonation/:id/terminate` when you are done. Do not
   just let it expire — a live session shows the customer a banner for an hour.

## Related

- [AUTH.md](./AUTH.md) — the other four token families
- [AUDIT.md](./AUDIT.md) — what the dual-identity rows look like
- [RBAC.md](./RBAC.md) — who holds `impersonation.start` / `.stop` / `.view`
