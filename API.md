# API reference

Three surfaces. Every response uses the same envelope — see
[ARCHITECTURE.md](./ARCHITECTURE.md#response-envelope).

| Surface | Base | Guard | Permission decorator |
| --- | --- | --- | --- |
| Admin | `/api/v1/admin` (from `API_PREFIX`) | `JwtAuthGuard` | `@RequirePermissions` |
| Owner | `/api/v1/owner` (literal) | `OwnerJwtGuard` | none — scope *is* the authorisation |
| Staff | `/api/v1/staff` (literal) | `StaffJwtGuard` | `@RequireStaffPermissions` |

Swagger UI: `/api/docs`.

Notation below: admin paths are shown relative to `/api/v1/admin`; owner and
staff paths are shown in full. "public" means `@Public()` — no token.

---

# Unprefixed

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | public — Terminus, DB + Redis |
| GET | `/health/live` | public — liveness; Railway and Docker use this |
| GET | `/health/ready` | public — readiness |

Excluded from every prefix on purpose, so a health checker does not need to know
the versioned base.

---

# Admin surface — `/api/v1/admin`

## Auth

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/auth/otp/request` | public |
| POST | `/auth/otp/verify` | public |
| POST | `/auth/google` | public |
| POST | `/auth/mfa` | public (consumes the 5-min `tavelo-admin-mfa` token) |
| POST | `/auth/refresh` | public |
| POST | `/auth/logout` | authenticated |
| GET | `/auth/me` | authenticated |

**There is no `POST /auth/login`.** Password sign-in was removed; it 404s.

## Profile MFA

`JwtAuthGuard` only — an admin manages their own MFA, no permission required.

| Method | Path |
| --- | --- |
| GET | `/profile/mfa` |
| POST | `/profile/mfa/enroll` |
| POST | `/profile/mfa/verify` |
| POST | `/profile/mfa/disable` |

## Admin users, roles, permissions

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/admin-users` | `admin.view` |
| GET | `/admin-users/:id` | `admin.view` |
| POST | `/admin-users` | `admin.create` |
| PATCH | `/admin-users/:id` | `admin.edit` |
| PATCH | `/admin-users/:id/status` | `admin.edit` |
| GET | `/admin-users/:id/sessions` | `admin.view` |
| DELETE | `/admin-users/:id/sessions/:sid` | `admin.edit` |
| GET | `/roles` | `admin.view` |
| GET | `/roles/:id` | `admin.view` |
| POST | `/roles` | `admin.create` |
| PATCH | `/roles/:id` | `admin.edit` |
| GET | `/permissions` | `admin.view` |

## Owners

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/owners` | `owner.view` |
| POST | `/owners` | `owner.create` |
| GET | `/owners/:id` | `owner.view` |
| PATCH | `/owners/:id` | `owner.edit` |
| DELETE | `/owners/:id` | `owner.delete` |
| POST | `/owners/:id/activate` | `owner.edit` |
| POST | `/owners/:id/suspend` | `owner.suspend` |
| POST | `/owners/:id/block` | `owner.suspend` |
| POST | `/owners/:id/unblock` | `owner.suspend` |
| GET | `/owners/:id/overview` | `owner.view` |
| GET | `/owners/:id/properties` | `property.view` |
| GET | `/owners/:ownerId/entitlements` | `owner.view` |
| POST | `/owners/:ownerId/entitlements/overrides` | `owner.edit` |
| DELETE | `/owners/:ownerId/entitlements/overrides/:id` | `owner.edit` |

## Properties and staff

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/properties` | `property.view` |
| POST | `/properties` | `property.edit` |
| GET | `/properties/:id` | `property.view` |
| GET | `/properties/:id/overview` | `property.view` |
| GET | `/properties/:id/integrations` | `property.view` |
| GET | `/staff` | `staff.read` |
| GET | `/staff/:id` | `staff.read` |
| POST | `/staff/:id/status` | `staff.manage` |

## Plans and subscriptions

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/plans` | `plan.view` |
| GET | `/plans/features` | `plan.view` |
| GET | `/plans/:id` | `plan.view` |
| POST | `/plans` | `plan.edit` |
| PATCH | `/plans/:id` | `plan.edit` |
| PUT | `/plans/:id/features` | `plan.edit` |
| DELETE | `/plans/:id` | `plan.edit` |
| GET | `/subscriptions` | `subscription.view` |
| POST | `/subscriptions` | `subscription.edit` |
| GET | `/subscriptions/:id` | `subscription.view` |
| PATCH | `/subscriptions/:id` | `subscription.edit` |
| POST | `/subscriptions/:id/extend` | `subscription.edit` |
| POST | `/subscriptions/:id/suspend` | `subscription.edit` |
| POST | `/subscriptions/:id/reactivate` | `subscription.edit` |
| POST | `/subscriptions/:id/cancel` | `subscription.cancel` |
| GET | `/subscriptions/:id/events` | `subscription.view` |

## Billing

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/billing/payments` | `billing.view` |
| GET | `/billing/payments/:id` | `billing.view` |
| GET | `/billing/failed` | `billing.view` |
| POST | `/billing/payments/manual` | `payment.record` |
| POST | `/billing/payments/orders` | `payment.record` |
| POST | `/billing/payments/:id/refund` | `billing.refund` |
| GET | `/billing/refunds` | `billing.view` |
| GET | `/billing/invoices` | `billing.view` |
| GET | `/billing/invoices/:id` | `billing.view` |
| GET | `/billing/invoices/:id/document` | `invoice.view` |
| POST | `/billing/invoices` | `invoice.create` |
| POST | `/billing/invoices/:id/generate-pdf` | `invoice.edit` |
| POST | `/billing/invoices/:id/issue` | `invoice.edit` |
| POST | `/billing/invoices/:id/mark-paid` | `invoice.edit` |
| POST | `/billing/invoices/:id/cancel` | `invoice.edit` |

## Webhooks (public, signature-verified)

| Method | Path | Verified with |
| --- | --- | --- |
| POST | `/webhooks/payments/:provider` | `PAYMENT_WEBHOOK_SECRET_RAZORPAY` / `_CASHFREE` |
| POST | `/webhooks/channex` | `CHANNEX_WEBHOOK_SECRET` (optional) |

## Support, announcements, notifications

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/support/tickets` | `support.view` |
| POST | `/support/tickets` | `support.reply` |
| GET | `/support/tickets/:id` | `support.view` |
| POST | `/support/tickets/:id/messages` | `support.reply` |
| POST | `/support/tickets/:id/assign` | `support.assign` |
| POST | `/support/tickets/:id/resolve` | `support.resolve` |
| POST | `/support/tickets/:id/close` | `support.resolve` |
| GET | `/announcements` | `announcement.view` |
| GET | `/announcements/:id` | `announcement.view` |
| POST | `/announcements` | `announcement.edit` |
| PATCH | `/announcements/:id` | `announcement.edit` |
| POST | `/announcements/:id/publish` | `announcement.edit` |
| DELETE | `/announcements/:id` | `announcement.edit` |
| GET | `/notifications` | `notification.view` |
| GET | `/notifications/deliveries` | `notification.view` |
| POST | `/notifications/:id/read` | `notification.view` |
| POST | `/notifications/read-all` | `notification.view` |
| GET | `/notifications/templates` | `notification.view` |
| POST | `/notifications/templates` | `notification.edit` |

## Impersonation

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/impersonation` | `impersonation.start` |
| GET | `/impersonation/history` | `impersonation.view` |
| GET | `/impersonation/:id` | `impersonation.view` |
| POST | `/impersonation/:id/terminate` | `impersonation.stop` |

## Platform settings

| Method | Path | Permission |
| --- | --- | --- |
| GET / POST | `/settings/amenities` | `settings.amenities.manage` |
| PATCH / DELETE | `/settings/amenities/:id` | `settings.amenities.manage` |
| GET / POST | `/settings/locations/states` | `settings.locations.manage` |
| DELETE | `/settings/locations/states/:id` | `settings.locations.manage` |
| GET / POST | `/settings/locations/states/:stateId/districts` | `settings.locations.manage` |
| DELETE | `/settings/locations/districts/:id` | `settings.locations.manage` |

> Neither `settings.*` key is seeded by `scripts/seed.ts`, so on a locally
> seeded database these eight routes are reachable only by `super_admin`. See
> [RBAC.md](./RBAC.md#permission-catalogue).

## Analytics, search, jobs, integrations, export

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/analytics/overview` | `analytics.view` |
| GET | `/analytics/revenue` | `analytics.view` |
| GET | `/analytics/subscriptions` | `analytics.view` |
| GET | `/analytics/owners` | `analytics.view` |
| GET | `/dashboard` | `analytics.view` |
| GET | `/audit-logs` | `audit.view` |
| GET | `/search?q=&types=` | `search.query` |
| GET | `/jobs` | `job.view` |
| GET | `/jobs/:id` | `job.view` |
| POST | `/jobs/:id/retry` | `job.retry` |
| POST | `/integrations/:id/sync` | `integration.sync` |
| GET | `/integrations/:id/logs` | `integration.view` |
| GET | `/export/:entity` | per-entity — see [BILLING.md](./BILLING.md#exports) |

`/search` returns empty arrays for a `q` shorter than 2 characters, and searches
`owners`, `properties`, `invoices` and `tickets` (10 each) unless `types` narrows
it.

---

# Owner surface — `/api/v1/owner`

`OwnerJwtGuard` on everything except the four public auth routes. **No
permission checks** — an owner sees their own subtree. Under impersonation the
same routes serve the target owner, read-only.

## Auth and account

| Method | Path |
| --- | --- |
| POST | `/api/v1/owner/auth/otp/request` *(public)* |
| POST | `/api/v1/owner/auth/otp/verify` *(public)* |
| POST | `/api/v1/owner/auth/google` *(public)* |
| POST | `/api/v1/owner/auth/refresh` *(public)* |
| POST | `/api/v1/owner/auth/logout` |
| GET | `/api/v1/owner/auth/me` |
| GET / PATCH | `/api/v1/owner/profile` |
| GET | `/api/v1/owner/sessions` |
| POST | `/api/v1/owner/sessions/revoke-all` |
| DELETE | `/api/v1/owner/sessions/:id` |

## Portfolio, properties, photos

| Method | Path |
| --- | --- |
| GET | `/api/v1/owner/portfolio/summary` |
| GET | `/api/v1/owner/properties` |
| POST | `/api/v1/owner/properties` — 403 `PROPERTY_LIMIT_REACHED` at the cap |
| GET | `/api/v1/owner/properties/:id/photos` |
| POST | `/api/v1/owner/properties/:id/photos` |
| GET | `/api/v1/owner/properties/:id/photos/:photoId/raw` |
| DELETE | `/api/v1/owner/properties/:id/photos/:photoId` |
| GET / PUT | `/api/v1/owner/properties/:id/amenities` |
| GET | `/api/v1/owner/properties/:id/room-types` |
| GET | `/api/v1/owner/properties/:id/rooms` |

## Team

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/owner/staff` | every hotel |
| GET | `/api/v1/owner/properties/:id/staff` | one hotel |
| POST | `/api/v1/owner/properties/:id/staff` | GM/AGM only (`ownerCreatableStaffRoleValues`) |
| PATCH | `/api/v1/owner/properties/:id/staff/:sid` | |
| POST | `/api/v1/owner/properties/:id/staff/:sid/status` | |
| DELETE | `/api/v1/owner/properties/:id/staff/:sid` | soft delete |

## Subscription, support, reference

| Method | Path |
| --- | --- |
| GET | `/api/v1/owner/subscription` |
| GET | `/api/v1/owner/subscription/invoices` |
| GET / POST | `/api/v1/owner/support/tickets` |
| GET | `/api/v1/owner/support/tickets/:id` |
| POST | `/api/v1/owner/support/tickets/:id/messages` |
| GET | `/api/v1/owner/reference/locations` |

---

# Staff surface — `/api/v1/staff`

`StaffJwtGuard` + `StaffPermissionsGuard`. The role — and therefore the
permission list — is read from the `hotel_staff` row on every request, never
from the token. Everything is scoped to the caller's own property; a foreign id
is a **404**.

## Auth

| Method | Path |
| --- | --- |
| POST | `/api/v1/staff/auth/otp/request` *(public)* |
| POST | `/api/v1/staff/auth/otp/verify` *(public)* |
| POST | `/api/v1/staff/auth/google` *(public)* |
| POST | `/api/v1/staff/auth/refresh` *(public)* |
| POST | `/api/v1/staff/auth/logout` |
| GET | `/api/v1/staff/auth/me` — `{ user, hotel, organization, role, permissions }` |

## Team

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/staff/team` | `staff.read` |
| POST | `/api/v1/staff/team` | `staff.create` |
| POST | `/api/v1/staff/team/:id/approve` | `staff.approve` |
| POST | `/api/v1/staff/team/:id/status` | `staff.update` — **and `staff.approve` to reach `ACTIVE`** |
| DELETE | `/api/v1/staff/team/:id` | `staff.delete` |

## Reservations

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/staff/reservations` | `reservation.read` |
| GET | `/api/v1/staff/reservations/availability` | `reservation.read` |
| POST | `/api/v1/staff/reservations` | `reservation.create` |
| GET | `/api/v1/staff/reservations/:id` | `reservation.read` |
| PATCH | `/api/v1/staff/reservations/:id` | `reservation.update` |
| POST | `/api/v1/staff/reservations/:id/confirm` | `reservation.update` |
| POST | `/api/v1/staff/reservations/:id/assign-room` | `reservation.update` |
| POST | `/api/v1/staff/reservations/:id/check-in` | `checkin.perform` |
| POST | `/api/v1/staff/reservations/:id/check-out` | `checkout.perform` |
| POST | `/api/v1/staff/reservations/:id/cancel` | `reservation.cancel` |
| POST | `/api/v1/staff/reservations/:id/no-show` | `reservation.cancel` |
| GET | `/api/v1/staff/desk/today` | `reservation.read` |
| GET | `/api/v1/staff/dashboard` | `dashboard.read` |

Check-in sets the room `OCCUPIED`; check-out sets it `DIRTY`. Confirming or
assigning a room runs the overlap check under `SELECT … FOR UPDATE` and can
return `ROOM_UNAVAILABLE`.

## Rooms and room types

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/staff/room-types` | `roomtype.read` |
| GET | `/api/v1/staff/room-types/:id` | `roomtype.read` |
| POST | `/api/v1/staff/room-types` | `roomtype.create` |
| PATCH | `/api/v1/staff/room-types/:id` | `roomtype.update` |
| DELETE | `/api/v1/staff/room-types/:id` | `roomtype.delete` |
| GET | `/api/v1/staff/rooms` | `room.read` |
| POST | `/api/v1/staff/rooms` | `room.create` |
| POST | `/api/v1/staff/rooms/bulk` | `room.create` |
| GET | `/api/v1/staff/rooms/:id` | `room.read` |
| PATCH | `/api/v1/staff/rooms/:id` | `room.update` |
| POST | `/api/v1/staff/rooms/:id/status` | `room.status.update` |
| DELETE | `/api/v1/staff/rooms/:id` | `room.delete` |
| GET | `/api/v1/staff/amenities` | `roomtype.read` |

`room.status.update` is deliberately not `room.update` — reception and
housekeeping turn rooms over; only GM/AGM renumber or re-rate them. See
[RBAC.md](./RBAC.md#two-distinctions-worth-internalising).

---

# Error codes

Standard HTTP codes come through the filter upper-cased (`NOT_FOUND`,
`FORBIDDEN`, `UNAUTHORIZED`, `BAD_REQUEST`, `CONFLICT`). Domain codes the
clients branch on:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `INVALID_OTP` / `OTP_EXPIRED` / `OTP_THROTTLED` | 401 / 401 / 429 | OTP flow |
| `ACCOUNT_SUSPENDED` / `ACCOUNT_BLOCKED` | 403 | owner or staff status |
| `ACCOUNT_INVITED` / `ACCOUNT_PENDING_APPROVAL` / `ACCOUNT_DEACTIVATED` | 403 | staff status |
| `OWNER_NOT_FOUND` / `PROPERTY_NOT_FOUND` / `STAFF_NOT_FOUND` | 404 | also returned for a row at another tenant |
| `STAFF_EMAIL_TAKEN` | 409 | the `(property_id, email)` partial unique |
| `PROPERTY_LIMIT_REACHED` | 403 | subscription cap |
| `ROLE_NOT_ASSIGNABLE` / `ROLE_NOT_PERMITTED` | 403 | creatable-role matrix |
| `ACTIVATION_NOT_PERMITTED` | 403 | `staff.update` without `staff.approve` |
| `IMPERSONATION_READ_ONLY` | 403 | a write attempted under a support session |
| `MFA_NOT_CONFIGURED` | — | `MFA_SECRET_KEY` unset; enrolment refused |
| `GATEWAY_NOT_CONFIGURED` | — | Razorpay credentials incomplete |
| `CHANNEX_NOT_CONFIGURED` | — | Channex disabled or no API key |
| `ROOM_UNAVAILABLE` | — | overlapping committed reservation |
| `INVALID_PHONE` / `INVALID_GSTIN` / `INVALID_LOCATION` | 400 | Indian-format validation |

## Related

[AUTH.md](./AUTH.md) · [RBAC.md](./RBAC.md) ·
[MULTI_TENANCY.md](./MULTI_TENANCY.md) · [BILLING.md](./BILLING.md)
