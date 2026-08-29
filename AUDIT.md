# Audit log

One table, `audit_logs`, written through one service,
`src/modules/audit/audit.service.ts`. Everything privileged that changes state
goes through it.

## The row

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | `gen_random_uuid()` |
| `actor_id` | uuid | the admin who did it; null for system writes |
| `actor_email` | varchar(255) | captured at the time, so a later rename does not rewrite history |
| `actor_role` | varchar(128) | as above |
| `action` | varchar(128) **not null** | dot-namespaced, e.g. `owner.status.suspended` |
| `entity` | varchar(128) | `owner`, `invoice`, `reservation`, … |
| `entity_id` | varchar(128) | |
| `before` | jsonb | the row as it was |
| `after` | jsonb | the row as it became |
| `reason` | text | free text; **required** on impersonation start |
| `ip` | varchar(64) | from the request context |
| `user_agent` | varchar(512) | from the request context |
| `request_id` | varchar(64) | ties the row to the log line and the response envelope |
| `impersonated_user_id` | varchar(128) | null unless written during a support session |
| `created_at` | timestamptz not null | `defaultNow()` |

Indexes: `audit_actor_idx (actor_id)`, `audit_entity_idx (entity, entity_id)`,
`audit_created_idx (created_at)`.

## Who did it comes from the request, not the caller

`AuditService.record()` takes only the *what*:

```ts
await this.audit.record({ action: 'owner.updated', entity: 'owner', entityId: id, before, after });
```

The *who*, *from where* and *as part of which request* are read from the
`AsyncLocalStorage` request context that `RequestContextMiddleware` opens and
the surface guards enrich. That is a deliberate design choice with two payoffs:

- A call site cannot forget to attribute a write, and cannot attribute it to the
  wrong person.
- **Impersonation works without any call site knowing about it.** The
  attribution chain is `input.actorId ?? ctx.adminId ?? ctx.actorAdminId`, and
  the third fallback is what names the real admin on **owner-API** routes, where
  nothing ever sets `ctx.adminId` from an admin JWT. `impersonated_user_id`
  comes from the same context.

So a row written while Tavelo Support is reading an owner's account names
**both** the employee responsible and the account touched. See
[IMPERSONATION.md](./IMPERSONATION.md#dual-identity-audit).

## Append-only

`AuditService` exposes exactly two methods: `record()` (an `INSERT`) and
`list()` (a `SELECT`). There is **no update path and no delete path** — not in
the service, not in a controller, not in a migration. The only HTTP surface is:

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/admin/audit-logs` | `audit.view` |

Filters: `actorId`, `entity`, `entityId`, `limit` (capped at 200, default 50),
`offset`. Ordered `created_at DESC`, returned as `{ rows, total, limit, offset }`.

**The immutability is by construction, not by grant.** There is no database-level
`REVOKE UPDATE`/`DELETE` on the table and no trigger blocking writes — a
migration or a psql session with the application role could still edit rows.
If audit integrity needs to survive a compromised application role, that is the
gap to close.

## What is recorded

Roughly eighty actions today. Grouped by prefix:

| Prefix | Examples |
| --- | --- |
| `admin.*` | `admin.created`, `admin.updated`, `admin.status.<status>`, `admin.session.revoked` |
| `admin.login.*` | `admin.login.otp`, `admin.login.google`, `admin.login.failed`, `admin.login.mfa_required` |
| `admin.mfa.*` | `enroll_started`, `enabled`, `disabled`, `challenge_passed`, `challenge_failed` |
| `auth.*` | `auth.logout` |
| `owner.*` | `owner.created`, `owner.updated`, `owner.deleted`, `owner.status.<status>` |
| `owner.*` (owner-initiated) | `owner.profile.updated`, `owner.session.revoked`, `owner.session.revoked_all`, `owner.staff.updated`, `owner.property.amenities_set`, `owner.property.viewed`, `owner.support.ticket.created`, `owner.support.message.sent` |
| `property.*` | `property.created` |
| `staff.*` | `staff.status.changed` (admin), and the staff-app writes below |
| `staff.reservation.*` | `created`, `updated`, `confirmed`, `room_assigned`, `checked_in`, `checked_out`, `cancelled`, `no_show` |
| `staff.room.*` / `staff.roomtype.*` | `created`, `bulk_created`, `updated`, `status_changed`, `deleted` |
| `plan.*` | `plan.created`, `plan.updated`, `plan.features.set` |
| `subscription.*` | `subscription.created`, `subscription.updated`, `subscription.extended`, `subscription.status.<status>` |
| `entitlement.*` | `entitlement.override.set`, `entitlement.override.removed` |
| `billing.*` | `billing.payment.settled.<source>`, `billing.order.created`, `billing.refund.created`, `billing.refund.gateway.succeeded`, `billing.refund.gateway.failed` |
| `invoice.*` | `invoice.created`, `invoice.<status>`, `invoice.document.generated`, `invoice.document.attached` |
| `support.*` | `support.ticket.created`, `support.ticket.assigned`, `support.ticket.<status>`, `support.message.sent` |
| `announcement.*` | `created`, `updated`, `published`, `deleted` |
| `notification.*` | `notification.template.upserted` |
| `integration.*` | `integration.sync` |
| `impersonation.*` | `impersonation.started` (with reason), `impersonation.terminated` |
| `settings.*` | `settings.amenity.created/updated/archived`, `settings.location.state.*`, `settings.location.district.*` |
| `export.*` | `export.csv` |
| `job.*` | `job.retried` |

Note the pattern: **status changes are their own action**
(`owner.status.suspended`, not `owner.updated` with a diff), so the questions
people actually ask the audit log — *who suspended this owner and when* — are a
single indexed lookup.

## What is deliberately not recorded

- **Reads.** With one exception: `owner.property.viewed`, because a support
  agent opening a customer's property under impersonation is itself an event
  worth keeping.
- **OTP codes and TOTP secrets.** Sign-in *attempts* are recorded
  (`admin.login.failed` carries the method and IP); the credential never is.
- **Whole request bodies.** `before`/`after` hold the row, not the payload.

## Related tables

`audit_logs` is the general ledger; three narrower tables carry their own
history and are not duplicated into it:

| Table | Records |
| --- | --- |
| `impersonation_sessions` | one row per support session, with actor, target, reason, `token_jti`, start/end |
| `subscription_events` | per-subscription lifecycle transitions, surfaced at `GET /subscriptions/:id/events` |
| `background_jobs` | one row per worker run, with state and error; retryable via `POST /jobs/:id/retry` |
