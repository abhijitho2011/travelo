# Database

PostgreSQL, accessed through **Drizzle ORM**. The schema is TypeScript in
`src/database/schema/*.ts`; the migrations are plain SQL in
`src/database/migrations/*.sql`. **50 tables.**

House rules, applied everywhere:

- **UUID primary keys**, `DEFAULT gen_random_uuid()` (needs `pgcrypto`).
- **`timestamptz`** for every time column. No naked `timestamp`.
- **Soft delete** via `deleted_at` on anything an owner or admin can remove.
  `deleted_at IS NULL` belongs in the same predicate as the tenant key — see
  [MULTI_TENANCY.md](./MULTI_TENANCY.md#soft-deletes-are-part-of-the-boundary).
- **Money is integer paise.** Never numeric, never float.
- **Statuses are `varchar` with a `$type<>()` union**, not Postgres enums, so a
  new value is a code change rather than a `ALTER TYPE` migration.

## Schema files

| File | Tables |
| --- | --- |
| `admins.ts` | `admins`, `admin_otps`, `admin_mfa_recovery_codes` |
| `sessions.ts` | `admin_sessions` |
| `roles.ts` | `roles`, `role_permissions`, `admin_roles` |
| `permissions.ts` | `permissions` |
| `owner.ts` | `owner_otps`, `owner_sessions`, `hotel_staff`, `staff_sessions`, `staff_otps`, `location_states`, `location_districts` |
| `rooms.ts` | `amenities`, `room_types`, `room_type_amenities`, `rooms`, `room_amenities`, `property_amenities` |
| `reservations.ts` | `reservations`, `reservation_events` |
| `audit.ts` | `audit_logs` |
| `phase2.ts` | the remaining 26 — owners, properties, plans, subscriptions, billing, support, notifications, integrations, jobs |

---

## Identity — admin

| Table | Purpose |
| --- | --- |
| `admins` | Tavelo employees. Soft-deleted. Carries `password_hash` (**dead** — password sign-in was removed), `mobile`, `mfa_enabled`, `mfa_secret` (AES-256-GCM, `v1:<iv>:<tag>:<ct>`) |
| `admin_sessions` | one per sign-in; `refresh_token_hash` (argon2id), `user_agent`, `ip`, `expires_at`, `revoked_at` |
| `admin_otps` | argon2id-hashed OTPs by mobile, with `attempts`, `expires_at`, `consumed_at` |
| `admin_mfa_recovery_codes` | 10 argon2id hashes per enrolment; `used_at` burns one |
| `roles` | `key` unique, `is_system` locks the permission set against API edits |
| `permissions` | the catalogue: `key`, `group`, `description` |
| `role_permissions` | role → permission key; may hold `"*"` or `"<group>.*"` |
| `admin_roles` | admin ↔ role |

```
admins ──< admin_roles >── roles ──< role_permissions >── permissions
   │
   ├──< admin_sessions
   └──< admin_mfa_recovery_codes
```

## Identity — owner and staff

| Table | Purpose |
| --- | --- |
| `owners` | the customer. `status`, `deleted_at`, GSTIN, location, contact |
| `owner_sessions` / `owner_otps` | mirror the admin pair, separate secrets |
| `hotel_staff` | a person at **one** property. `role` (one of 24), `status` (one of 7), `owner_id` denormalised alongside `property_id`, soft-deleted |
| `staff_sessions` / `staff_otps` | the third token family |
| `location_states` / `location_districts` | platform-wide reference data; districts hang off states |

`hotel_staff` has a **partial unique index on `(property_id, email)`** — the
same person may work at two hotels, never twice at one. Surfaced as
`STAFF_EMAIL_TAKEN` (409).

**Statuses.** `owners.status`: `PENDING` · `ACTIVE` · `SUSPENDED` · `BLOCKED` ·
`DEACTIVATED`. `hotel_staff.status`: `INVITED` · `PENDING_APPROVAL` ·
`APPROVED` · `ACTIVE` · `BLOCKED` · `SUSPENDED` · `DEACTIVATED` — only `ACTIVE`
can sign in.

## Property and inventory

| Table | Purpose |
| --- | --- |
| `properties` | a hotel. `owner_id`, `slug`, `status`, address/location, soft-deleted |
| `property_photos` | storage keys + ordering; bytes live in S3 or the volume |
| `amenities` | the **platform-wide** catalogue. `slug` is what code matches on, never the name. `scope` = `ROOM`\|`PROPERTY`, `status` = `ACTIVE`\|`ARCHIVED` |
| `property_amenities` | property ↔ amenity |
| `room_types` | per property: name, `base_rate`, occupancy, `bed_type`, `status` |
| `room_type_amenities` | room type ↔ amenity |
| `rooms` | per property: number, floor, `room_type_id`, `status` |
| `room_amenities` | room ↔ amenity (overrides/extends the type's set) |

Amenities are **archived, never deleted**: rows already referencing one keep
working, and `ARCHIVED` only removes it from the pickers.

**Enums.** `bed_type`: `SINGLE` `TWIN` `DOUBLE` `QUEEN` `KING` `BUNK`.
`rooms.status`: `AVAILABLE` `OCCUPIED` `DIRTY` `CLEANING` `INSPECTED` `READY`
`MAINTENANCE` `OUT_OF_ORDER`. `properties.status`: `DRAFT` `ACTIVE` `SUSPENDED`
`INACTIVE` `ARCHIVED`.

```
owners ──< properties ──┬──< rooms ──< room_amenities >── amenities
                        ├──< room_types ──< room_type_amenities >──┘
                        ├──< property_amenities >──────────────────┘
                        ├──< property_photos
                        ├──< hotel_staff
                        └──< reservations
```

## Reservations

| Table | Purpose |
| --- | --- |
| `reservations` | `property_id`, `room_type_id` (`ON DELETE RESTRICT`), optional `room_id`, guest details, `check_in`/`check_out` dates, `total_paise`, `status`, `source`, `external_ref`, soft-deleted |
| `reservation_events` | per-reservation transition history |

**Status**: `PENDING` (held, does not block a room) · `CONFIRMED` (**blocks a
room**) · `CHECKED_IN` (blocks) · `CHECKED_OUT` · `CANCELLED` · `NO_SHOW`.
`OCCUPYING_STATUSES = ['CONFIRMED', 'CHECKED_IN']` lives in the schema file, not
the service, so the overlap predicate and the in-memory rule cannot drift.

**Source**: `WALK_IN` · `PHONE` · `EMAIL` · `OTA` · `OTHER`.

`external_ref` is the **idempotency key for inbound channel bookings** — a
channel manager redelivers on its own schedule, and this is what makes a
redelivery a no-op (added in `0013`).

Side effects worth knowing: check-in sets the room `OCCUPIED`; check-out sets it
`DIRTY`.

## Subscriptions & billing

| Table | Purpose |
| --- | --- |
| `features` | the feature catalogue (`key` unique) |
| `subscription_plans` | `monthly_price`, `annual_price` (**legacy**), `duration_months`, `property_limit`, `status` |
| `plan_features` | plan ↔ feature, PK `(plan_id, feature_key)` |
| `subscriptions` | owner ↔ plan, `status`, `billing_cycle`, current period, `property_limit_override`, `price_override`, `auto_renew` |
| `subscription_events` | per-subscription history (`renewal`, status changes) |
| `subscription_extensions` | manual goodwill extensions; unique `(subscription_id, idempotency_key)` |
| `owner_feature_overrides` | per-owner grant/revoke; unique `(owner_id, feature_key)` |
| `invoices` | `invoice_number` unique, period bounds, subtotal/tax/discount/total in paise, status, storage key for the PDF |
| `invoice_sequences` | `(year_month, last_seq)` — the atomic counter behind `INV-YYYYMM-000001` |
| `payments` | `gateway`, `gateway_ref`, `amount`, `status`, `captured_at`, raw payload |
| `refunds` | `payment_id`, `amount`, `status`, `reason`, `created_by` |
| `webhook_events` | **unique `(provider, event_id)`** — the idempotency guard |
| `daily_platform_metrics` | one row per `day` (the PK): `mrr`, `arr`, `arpu`, `active_subscriptions`, `active_owners` |

**Foreign-key intent.** `subscriptions.plan_id` is `ON DELETE RESTRICT` — a plan
in use cannot be deleted out from under a subscriber. `invoices.owner_id` is
`RESTRICT` too: an owner with financial history is not disappearing.
`invoices.subscription_id` is `SET NULL` — the invoice outlives the
subscription. Everything genuinely dependent (`subscription_events`,
`plan_features`, `owner_feature_overrides`) is `CASCADE`.

**Statuses.** subscription: `TRIAL` `ACTIVE` `EXPIRING` `GRACE_PERIOD` `EXPIRED`
`SUSPENDED` `CANCELLED`. payment: `PENDING` `SUCCESS` `FAILED` `REFUNDED`
`PARTIALLY_REFUNDED` `CANCELLED`. gateway: `RAZORPAY` `CASHFREE` `MANUAL`
`STRIPE`. plan: `ACTIVE` `ARCHIVED`. cycle: `MONTHLY` `ANNUAL`.

```
owners ──< subscriptions ──> subscription_plans ──< plan_features >── features
   │            ├──< subscription_events
   │            └──< subscription_extensions
   ├──< owner_feature_overrides
   └──< invoices ──< payments ──< refunds
```

## Support

| Table | Purpose |
| --- | --- |
| `support_tickets` | `owner_id`, subject, `priority`, `status`, assignee |
| `support_messages` | the thread |
| `support_attachments` | files on a message |

`priority`: `LOW` `NORMAL` `HIGH` `CRITICAL`. `status`: `OPEN` `IN_PROGRESS`
`WAITING_FOR_OWNER` `RESOLVED` `CLOSED`.

## Notifications & announcements

| Table | Purpose |
| --- | --- |
| `notification_templates` | keyed copy per channel, with variables |
| `notifications` | the in-app inbox row |
| `notification_deliveries` | one row **per channel per recipient**: `status`, `attempts`, `error`, `next_attempt_at` |
| `announcements` | platform announcements: `status`, `scheduled_at`, `expires_at`, `published_at` |

**Channels**: `EMAIL` `SMS` `WHATSAPP` `PUSH` `IN_APP`.
**Delivery status**: `PENDING` `SENT` `FAILED` `SKIPPED`.

`notification_deliveries` is the retry queue — `NotificationDispatchWorker`
drains due `PENDING` rows, per-row try/catch, so one dead provider costs those
rows an attempt and nothing else.

## Audit, integrations, jobs

| Table | Purpose |
| --- | --- |
| `audit_logs` | append-only; see [AUDIT.md](./AUDIT.md) |
| `impersonation_sessions` | actor, target, reason, `token_jti`, `status`, `ended_at` |
| `integration_connections` | one per property per provider; `config` jsonb carries the provider-specific shape (for Channex: `channexPropertyId`, `roomTypeMap`, `ratePlanMap`) |
| `background_jobs` | one row per worker run: `name`, `queue`, `state`, `attempts`, `error`, timings |

`integration_connections.config` is jsonb rather than columns because every
provider needs a different shape; the typed accessors in
`src/modules/integrations/channex.config.ts` tolerate a malformed row rather
than crashing a sync run.

---

# Migration discipline

## The rules

1. **SQL files, not `drizzle-kit push`.** `npm run db:generate` produces SQL
   from the schema; that file is reviewed, committed, and is what runs. `db:push`
   exists for local scratch work only.
2. **Filename order is execution order.** `0000` … `0013`, zero-padded. Never
   renumber a merged migration.
3. **Forward-only.** There are no `down` scripts. Rolling back the image does
   not roll back the schema, so every migration must be compatible with the
   **previous** release: add columns nullable or defaulted, and never rename or
   drop in the same deploy that stops using the old name.
4. **Idempotent where it is free.** `CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`.
5. **Say why in the file.** The good migrations here open with a comment
   explaining the decision — `0006` explains why owner-email uniqueness became
   partial, `0013` documents the `config` jsonb convention. Follow that.
6. **Schema and migration must agree.** The TypeScript schema is what the app
   reads; the SQL is what the database gets. Changing one without the other is
   the classic way to a green build and a broken production.

## How they are applied

`scripts/railway-boot.mjs` on every boot:

- ensures `_boot_migrations (filename text PRIMARY KEY, applied_at timestamptz)`;
- runs each unapplied file **in filename order**;
- commits **the migration and its bookkeeping `INSERT` in one transaction**, so
  a crash can never leave a migration applied but unrecorded, or recorded but
  unapplied;
- on a database that predates tracking (no `_boot_migrations` but `admins`
  exists) it **adopts** every file as already-applied rather than re-running
  history.

A failing migration aborts the migration phase but **not the boot** — the app
starts anyway so `/health/live` stays reachable. Read the deploy log.

Locally, `npm run db:migrate` (`scripts/migrate.ts`) does the same thing.

## The migrations

| File | What |
| --- | --- |
| `0000_extensions.sql` | `pgcrypto` and `pg_trgm`. Must run before the schema — hence the second `0000` |
| `0000_green_leper_queen.sql` | the baseline — **31 tables**: admins/roles/permissions/sessions/audit, plus owners, properties, plans, subscriptions, invoices, payments, refunds, webhook events, support, notifications, announcements, integrations, jobs, metrics |
| `0001_amazing_shape.sql` | the owner and staff layer: `hotel_staff`, `owner_sessions`, `owner_otps`, `location_states`, `location_districts` |
| `0002_admin_mobile_otp.sql` | `admin_otps` — mobile OTP sign-in for admins |
| `0003_plan_duration_and_owner_location.sql` | `subscription_plans.duration_months` (default 1, not null); owner location fields |
| `0004_property_photos.sql` | `property_photos` |
| `0005_storage_keys.sql` | storage keys for photos and invoice documents |
| `0006_owner_email_partial_unique.sql` | owner-email uniqueness becomes **partial** — the absolute constraint kept a soft-deleted owner's email reserved forever |
| `0007_staff_auth.sql` | `staff_sessions`, `staff_otps`, and the 24-role / 7-status widening of `hotel_staff` |
| `0008_rooms_and_amenities.sql` | `amenities`, `room_types`, `rooms` and the three join tables; also inserts `settings.amenities.manage` and grants it to `operations_admin` |
| `0009_reservations.sql` | `reservations`, `reservation_events` |
| `0010_billing.sql` | invoices, payments, refunds, `invoice_sequences`, `webhook_events` |
| `0011_notifications.sql` | templates, notifications, deliveries |
| `0012_mfa.sql` | admin TOTP MFA — reuses the pre-existing unused `admins.mfa_enabled` / `mfa_secret`, adds `admin_mfa_recovery_codes` |
| `0013_channex.sql` | `reservations.external_ref` (inbound idempotency), Channex sync bookkeeping |

> Two files begin `0000`. `0000_extensions.sql` sorts before
> `0000_green_leper_queen.sql`, which is required — the baseline needs
> `gen_random_uuid()` from `pgcrypto`. It works, but it relies on string
> ordering rather than on intent, so do not add a third `0000`.

## Related

- [ARCHITECTURE.md](./ARCHITECTURE.md#database-access-and-transactions)
- [DEPLOYMENT.md](./DEPLOYMENT.md#boot-sequence)
- [MULTI_TENANCY.md](./MULTI_TENANCY.md)
