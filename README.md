# Tavelo

Tavelo is a hotel operations platform. One NestJS backend serves **three
separate audiences** from one deployment, and two Flutter apps plus a web admin
panel consume it.

| Surface | Base path | Who | Client |
| --- | --- | --- | --- |
| **Admin** | `/api/v1/admin` | Tavelo staff running the platform | Admin panel (TanStack Start, `frontend` branch) |
| **Owner** | `/api/v1/owner` | Hotel owners — portfolio, staff, subscription, billing | `owner_app/` (Flutter) |
| **Staff** | `/api/v1/staff` | Hotel employees — front desk, rooms, reservations | `staff_app/` (Flutter) |

Each surface has its **own JWT secret, issuer/audience and session table**. A
token from one is worthless on the others. See [AUTH.md](./AUTH.md).

## What the backend does

Owners are onboarded by admins, own properties, and pay for a subscription plan
that caps how many properties they may run. Each property has room types, rooms,
amenities and staff drawn from a 24-role hierarchy. Staff take reservations,
assign rooms, check guests in and out. Payments settle through Razorpay or are
recorded manually; both go through one settlement path that extends the
subscription and issues an invoice PDF. Everything privileged is written to an
append-only audit log, including the dual identity recorded when Tavelo Support
impersonates an owner.

## Requirements

- **Node.js 20.x** (`engines: >=20 <21`)
- **PostgreSQL 14+** (16 in `docker-compose.yml`)
- **Redis 6+** — optional. Without `REDIS_URL` the permission cache falls back
  to in-process memory and BullMQ queues are not registered.

## Quick start (local)

```bash
cp .env.example .env          # then fill in DATABASE_URL and the JWT secrets
npm install
npm run db:migrate            # apply src/database/migrations/*.sql
npm run db:seed               # permissions, roles, super admin, plans
npm run dev                   # http://0.0.0.0:3000
```

- Admin API: `http://0.0.0.0:3000/api/v1/admin`
- Owner API: `http://0.0.0.0:3000/api/v1/owner`
- Staff API: `http://0.0.0.0:3000/api/v1/staff`
- Swagger UI: `http://0.0.0.0:3000/api/docs`
- Health: `http://0.0.0.0:3000/health/live` (deliberately outside every prefix)

To sign in as an admin you must set `SUPER_ADMIN_EMAIL` and/or
`SUPER_ADMIN_MOBILE` — **there is no password sign-in.** With neither set the
app boots and logs a warning saying sign-in is impossible. In development set
`SMS_PROVIDER=console` so OTP codes appear in the log.

## Quick start (Docker Compose)

```bash
docker compose up --build
docker compose exec api npm run db:migrate
docker compose exec api npm run db:seed
```

Brings up `postgres:16-alpine`, `redis:7-alpine` and the API on port 3000.

## Environment

Every variable is declared and validated in [`src/config/env.ts`](./src/config/env.ts)
with zod; an invalid value aborts boot. The full reference table, including
which ones must be set before production, is in
[DEPLOYMENT.md](./DEPLOYMENT.md). The minimum for a working local boot:

| Var | Notes |
| --- | --- |
| `DATABASE_URL` | required, must be a URL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | required, ≥16 chars |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_MOBILE` | at least one, or nobody can sign in |

`.env.example` is **not** a complete list — it predates MFA, SMTP, Razorpay,
Channex and the notification SMS template. Treat `src/config/env.ts` as the
source of truth.

## Scripts

| script | purpose |
| --- | --- |
| `npm run dev` | Nest watch mode |
| `npm run build` | `nest build` → `dist/` |
| `npm run start:prod` | `node dist/main.js` |
| `npm run start:railway` | `scripts/railway-boot.mjs` — migrate, optional seed, then start |
| `npm run db:generate` | drizzle-kit: schema → SQL migration |
| `npm run db:migrate` | apply migrations (`scripts/migrate.ts`) |
| `npm run db:seed` | idempotent seed of permissions, roles, super admin |
| `npm run db:studio` | drizzle studio |
| `npm test` | Jest unit suite |
| `npm run lint` | ESLint + Prettier |

## Tests

```bash
npm test
```

The suite is pure unit tests — **no database, Redis or credentials required**.
`jest` is configured with `rootDir: src` and `testRegex: .*\.spec\.ts$`, so
tests live next to the code they cover.

One suite is different and worth knowing about:
[`src/app.bootstrap.spec.ts`](./src/app.bootstrap.spec.ts) compiles the **real
dependency-injection graph** via `Test.createTestingModule({ imports: [AppModule] })`.
It exists because `tsc` cannot see DI wiring and every other suite mocks its
dependencies away — so a provider missing from a module's `imports` passed the
build *and* the entire test suite, and then took production down at boot. That
happened twice (`StorageService`, then `NotificationDeliveryService` missing
from `BillingModule`, fixed in `4280c4f`). `compile()` resolves providers
without opening a socket, so the check costs nothing. See
[ARCHITECTURE.md](./ARCHITECTURE.md#why-appbootstrapspects-exists).

## Deploy

Railway, Docker builder, start command `npm run start:railway`. Migrations run
on boot, tracked in `_boot_migrations`. Full runbook and the env var reference
are in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Clients

| Path | What |
| --- | --- |
| `owner_app/` | Flutter owner app — portfolio, staff, subscription, invoices |
| `staff_app/` | Flutter staff app — desk, reservations, rooms, team |
| admin panel | TanStack Start app, lives on the `frontend` branch |

## Documentation

| Doc | Covers |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | modular monolith, module map, request lifecycle, envelope, workers, storage |
| [DATABASE.md](./DATABASE.md) | every table by domain, relationships, migration discipline |
| [AUTH.md](./AUTH.md) | three surfaces, token families, MFA, impersonation, recovery |
| [RBAC.md](./RBAC.md) | admin permissions and the 24 staff roles |
| [MULTI_TENANCY.md](./MULTI_TENANCY.md) | the Admin→Owner→Property→Staff chain and scoping rules |
| [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md) | plans, statuses, lifecycle worker, entitlements |
| [BILLING.md](./BILLING.md) | settlement, webhooks, idempotency, invoices, refunds |
| [IMPERSONATION.md](./IMPERSONATION.md) | security model and how to use it |
| [AUDIT.md](./AUDIT.md) | what is recorded and why it cannot be edited |
| [ANALYTICS.md](./ANALYTICS.md) | metrics and their documented approximations |
| [API.md](./API.md) | endpoint reference by surface, with required permissions |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Railway services, env reference, production checklist |
