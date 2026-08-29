# Architecture

## Shape: one modular monolith, three surfaces

Tavelo is a single NestJS 10 application on Node 20. It is deliberately **not**
split into services: one process, one database, one deployable, with strict
module boundaries inside it. What is separated is the *audience* — admin, owner
and staff — not the runtime.

```
                    ┌──────────────────────────────┐
  admin panel ─────▶│  /api/v1/admin   JwtAuthGuard│
  (TanStack Start)  │                              │
                    │                              │
  owner_app ───────▶│  /api/v1/owner   OwnerJwtGuard│──▶ Nest modules ──▶ Drizzle ──▶ Postgres
  (Flutter)         │                              │         │
                    │                              │         ├──▶ Redis (optional)
  staff_app ───────▶│  /api/v1/staff   StaffJwtGuard│         └──▶ S3 / local volume
  (Flutter)         └──────────────────────────────┘
```

### How the three prefixes coexist

`main.ts` sets a **global prefix** from `API_PREFIX` (default `/api/v1/admin`)
and then excludes the paths that must not receive it:

```ts
app.setGlobalPrefix(env.API_PREFIX, {
  exclude: [
    { path: 'health', method: RequestMethod.ALL },
    { path: 'health/live', method: RequestMethod.ALL },
    { path: 'health/ready', method: RequestMethod.ALL },
    { path: 'api/v1/owner/(.*)', method: RequestMethod.ALL },
    { path: 'api/v1/staff/(.*)', method: RequestMethod.ALL },
  ],
});
```

So an admin controller declares a **relative** path (`@Controller('owners')` →
`/api/v1/admin/owners`), while owner and staff controllers declare their
**literal, version-neutral** path:

```ts
@Controller({ path: 'api/v1/owner/support', version: VERSION_NEUTRAL })
```

Health is excluded so Railway's checker and the Docker `HEALTHCHECK` can reach
`/health/live` without knowing the versioned base.

## Module map

Every module lives under `src/modules/<name>/` and is registered in
`src/app.module.ts`.

### Platform / cross-cutting

| Module | Owns |
| --- | --- |
| `config` (`src/config`) | zod-validated env (`env.ts`), global `ConfigModule` |
| `database` (`src/database`) | `pg` Pool + Drizzle, exported as the `DRIZZLE` token |
| `queue` (`src/queue`) | nullable `ioredis` client + BullMQ root config |
| `storage` | `StorageService` — s3 / local drivers, presigned URLs |
| `audit` | append-only `audit_logs` writes + the admin list endpoint |
| `health` | Terminus checks at `/health`, `/health/live`, `/health/ready` |

### Identity

| Module | Owns |
| --- | --- |
| `auth` | admin OTP + Google sign-in, sessions, refresh rotation, TOTP MFA |
| `owner-auth` | owner surface: auth, profile, portfolio, properties, photos, staff, subscription, support, plus the admin location settings controller |
| `staff-auth` | staff surface: auth, `/staff/team`, the role→permission map, the creatable-role matrix |
| `shared-auth` | Firebase ID-token verification, mobile normalisation, SMS providers |
| `impersonation` | minting and enforcing `tavelo-impersonation` tokens |
| `admins`, `roles`, `permissions` | admin users, admin roles, the permission catalogue and its cache |

### Business

| Module | Owns |
| --- | --- |
| `owners` | owner CRUD, activate / suspend / block, overview |
| `properties` | admin-side property read + create, overview, integrations |
| `rooms` | amenity catalogue (admin), room types and rooms (staff), owner read views |
| `reservations` | booking lifecycle, availability, check-in/out, desk & dashboard |
| `staff` | admin-side platform-wide staff view and status changes |
| `plans`, `subscriptions`, `entitlements` | plan catalogue, subscription lifecycle, per-owner limits and overrides |
| `billing` | payments, the settlement path, webhooks, invoices, PDFs, refunds |
| `analytics` | overview / revenue / subscriptions / owners dashboards |
| `notifications` | templates, channels, delivery rows, in-app inbox |
| `announcements` | platform announcements and their publish schedule |
| `support` | admin ticket queue (owner side lives in `owner-auth`) |
| `integrations` | Channex channel manager: sync, webhook, logs |
| `export` | CSV exports |
| `search` | cross-entity admin search |
| `jobs` | `background_jobs` visibility and retry |
| `workers` | the five scheduled-work classes (see below) |

## Request lifecycle

1. **`express.json` with a `verify` hook** captures `req.rawBody`. Body parsing
   is done manually (`bodyParser: false`) precisely so webhook signature
   verification has the exact bytes that were signed.
2. **`helmet()`**, then CORS from `CORS_ORIGINS` (`*` means reflect origin).
   `trust proxy` is 1.
3. **`RequestContextMiddleware`** opens an `AsyncLocalStorage` store for the
   request with `requestId`, `ip`, `userAgent`.
4. **`ThrottlerGuard`** (global) — `THROTTLE_LIMIT` requests per
   `THROTTLE_TTL` seconds per IP; defaults 120 / 60.
5. **The surface guard** — `JwtAuthGuard`, `OwnerJwtGuard` or `StaffJwtGuard`.
   Each re-reads the database on every request and enriches the context store
   with the caller's identity (`adminId`, `sessionId`, `adminEmail`, and under
   impersonation also `actorAdminId` + `impersonatedUserId`).
6. **The permission guard** — `PermissionsGuard` (admin) or
   `StaffPermissionsGuard` (staff), reading `@RequirePermissions` /
   `@RequireStaffPermissions` metadata.
7. **Global `ValidationPipe`** — `whitelist`, `forbidNonWhitelisted`,
   `transform`. An unknown field is a 400, not a silent drop.
8. The controller runs.
9. **`ResponseInterceptor`** wraps the return value in the success envelope.
10. **`AllExceptionsFilter`** catches anything thrown and writes the error
    envelope; anything ≥ 500 is logged with its stack.

Logging is `nestjs-pino` — JSON in production, `pino-pretty` otherwise, with
`x-request-id` attached as a custom prop.

## Response envelope

Every response, success or failure, has the same outer shape. Clients can rely
on it.

Success (`src/common/interceptors/response.interceptor.ts`):

```json
{
  "success": true,
  "data": { },
  "meta": { "requestId": "…", "timestamp": "2026-08-30T00:00:00.000Z" }
}
```

Error (`src/common/filters/all-exceptions.filter.ts`):

```json
{
  "success": false,
  "error": { "code": "FORBIDDEN", "message": "…", "details": null },
  "meta": { "requestId": "…", "timestamp": "2026-08-30T00:00:00.000Z" }
}
```

`error.code` is derived from the Nest exception's `error` field, upper-cased
with whitespace replaced by underscores — so `NotFoundException` yields
`NOT_FOUND`. Services that need a code the client branches on throw with an
explicit one (`IMPERSONATION_READ_ONLY`, `CHANNEX_NOT_CONFIGURED`,
`GATEWAY_NOT_CONFIGURED`, `MFA_NOT_CONFIGURED`, `ROLE_NOT_PERMITTED`, …).
`details` carries class-validator's message array on a 400.

## Request context and audit attribution

`src/common/context/request-context.ts` holds one `AsyncLocalStorage` store:

```ts
interface RequestContextStore {
  requestId: string;
  adminId?: string; sessionId?: string; adminEmail?: string; adminRole?: string;
  actorAdminId?: string;
  impersonatedUserId?: string; impersonationSessionId?: string;
  ip?: string; userAgent?: string;
}
```

This is why `AuditService.record()` takes only the *what* — the *who* is read
from the store. It is also what makes dual-identity auditing work under
impersonation without every call site knowing about it. See
[AUDIT.md](./AUDIT.md).

## Database access and transactions

`DatabaseModule` is `@Global` and exports two tokens:

- `PG_POOL` — a `pg.Pool` (`max: 10`).
- `DRIZZLE` — `drizzle(pool, { schema })`, typed as `Database`.

Services inject it as `@Inject(DRIZZLE) private readonly db: Database` and use
Drizzle's query builder, dropping to `sql\`…\`` for set-based updates and for
the locking reads that reservations and billing need.

The pool **probes its connection string at boot**: `DATABASE_URL` first, then
`DATABASE_PUBLIC_URL` if set (always with SSL, since that is the Railway public
proxy). If every candidate fails it still builds the pool on `DATABASE_URL` so
the process boots and `/health/live` can be reached for diagnosis.

Multi-statement work uses `db.transaction(async (tx) => …)`. The two places
where the transaction is load-bearing rather than tidy:

- **Reservations** — availability is checked and the row inserted inside one
  transaction with `FOR UPDATE` row locks, so two concurrent bookings for the
  same room cannot both pass the overlap check.
- **Billing settlement** — `BillingService.settleSuccessfulPayment` is the
  single path that marks a payment succeeded, extends the subscription and
  issues the invoice. Partial settlement is not a state the system can be left
  in.

## Workers

`src/modules/workers/workers.module.ts` holds five classes, each with a plain
`run()` method:

| Worker | What it does |
| --- | --- |
| `SubscriptionLifecycleWorker` | drives `ACTIVE → EXPIRING → EXPIRED → GRACE_PERIOD → SUSPENDED` and emits the expiry-warning / transition notifications |
| `DailyMetricsAggregator` | recomputes MRR / ARR / ARPU / active counts into `daily_platform_metrics`, upserted on `day` |
| `AnnouncementPublisherWorker` | `DRAFT → PUBLISHED` at `scheduled_at`, `PUBLISHED → EXPIRED` at `expires_at` |
| `NotificationDispatchWorker` | drains due `PENDING` notification deliveries and records a `background_jobs` row per run |
| `ChannexSyncWorker` | polls every live Channex connection; `INTERVAL_MS = 15 min` |

Two design rules run through all of them:

- **Failure is per-item.** One hotel with a revoked Channex key, or one
  unreachable SMTP host, costs that row an attempt and nothing else.
- **Notifications are downstream of state.** The lifecycle worker finishes every
  `UPDATE` before it announces anything, re-derives its audience from current
  state (so a crashed run catches up), and de-duplicates with
  `notifyOnceQuietly`. A notification failure can never make the lifecycle run
  look failed.

> **Nothing in the application currently triggers these.** There is no
> `@nestjs/schedule` dependency, no `@Cron`, no registered BullMQ processor and
> no `setInterval` — `WorkersModule` only provides and exports the classes.
> They are invoked from tests today; in production they need an external
> trigger (a Railway cron service calling a script, or a scheduler added to the
> app). Treat this as a known gap, not as documentation of a running job.

`QueueModule` is `@Global` and configures BullMQ's root connection from
`REDIS_URL`. With no `REDIS_URL` the `REDIS` provider resolves to `null` (one
boot warning) and BullMQ gets a deliberately unroutable connection so any
future queue fails fast rather than silently pointing at localhost.

## Storage

`StorageService` (`src/modules/storage/storage.service.ts`) has two drivers,
chosen by `STORAGE_DRIVER`:

| Driver | Backing | Signed URLs |
| --- | --- | --- |
| `s3` | the Railway bucket via `@aws-sdk/client-s3` | real presigned GET URLs |
| `local` | `UPLOADS_DIR` on the mounted volume | returns `local://<key>`; a fallback streaming route serves the bytes |

`STORAGE_DRIVER=s3` with incomplete S3 configuration **downgrades to `local`
with a warning** rather than failing to boot. Path traversal is stripped from
keys before they touch the local filesystem. What is stored: property photos
and invoice PDFs.

## Why `app.bootstrap.spec.ts` exists

`src/app.bootstrap.spec.ts` compiles the whole DI graph:

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
```

It is there because of a specific, repeated production failure. From the file's
own comment:

> `tsc` cannot see DI wiring and every other suite mocks its dependencies, so a
> provider missing from a module's `imports` passes the build AND the whole test
> suite, then takes production down at boot. That has now happened twice —
> StorageService, and NotificationDeliveryService missing from BillingModule.

The second one is commit `4280c4f`: `BillingService` injected
`NotificationDeliveryService`, but `BillingModule` never imported
`NotificationsModule`. Build green, 700-odd tests green, container dead on
start. `compile()` resolves providers without opening a socket, so the test
needs no database, no Redis and no credentials — it only sets three dummy env
values at module scope, because `config.module.ts` validates on import, before
any `beforeAll` could run.

If you add a provider to a service's constructor, this test is the one that
tells you whether you also need to add a module to `imports`.

## Testing

57 suites, **703 tests**, all unit-level and hermetic. Conventions worth
copying: tests sit next to the code (`*.spec.ts` under `src`), the pure decision
logic is extracted so it can be tested without a database
(`PermissionsService.matches`, `creatableRolesFor`, `addMonths`, `toCsv`, the
notification renderer and retry policy), and the isolation guarantees have their
own suites (`owner-token-isolation.spec.ts`).

## Deploy pipeline

- **Dockerfile** — multi-stage (`deps` → `build` → `runtime`) on
  `node:20-alpine`, non-root `app` user, `HEALTHCHECK` on `/health/live`,
  `CMD npm run start:railway`. The runtime image copies `dist/`, `scripts/` and
  `src/database/migrations/` — the SQL files ship with the image.
- **Boot** — `scripts/railway-boot.mjs` applies migrations in filename order
  inside `_boot_migrations` bookkeeping, optionally seeds, then launches
  `dist/main.js`. See [DEPLOYMENT.md](./DEPLOYMENT.md).
