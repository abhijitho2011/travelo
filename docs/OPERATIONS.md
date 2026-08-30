# Operations & Observability

How the Tavelo backend is run, watched, and recovered. Deployment target is
**Railway only**; there is no localhost assumption anywhere — everything is
env-driven (`src/config/env.ts`).

## Health & readiness

- `GET /health` — liveness + dependency check (Postgres, Redis). Used by
  Railway's health check; a failure here fails the deploy.
- `GET /health/live` — cheap liveness (`{status:'ok'}`), no dependencies.
- `GET /health/ready` — readiness (DB + Redis reachable).

All three are public and mounted at the root, outside the API prefix.

## Metrics (Prometheus)

- `GET /metrics` — Prometheus text exposition, public, at the root. Served by
  `MetricsModule` (`src/modules/metrics/`), a dependency-free in-memory
  registry. Exposes:
  - `tavelo_http_requests_total{status="2xx|3xx|4xx|5xx"}` and `_sum`
  - `tavelo_http_errors_total` (unhandled/5xx)
  - `tavelo_process_uptime_seconds`, `_resident_memory_bytes`, `_heap_used_bytes`
- Counters are per-process and reset on restart — standard for a scraper. Point
  a Grafana/Railway metrics scraper at `/metrics`.

## Error tracking & correlation IDs

- Every request carries a **correlation id** (`x-request-id`), attached to all
  structured log lines and to every response envelope's `meta.requestId`
  (`src/common/middleware/request-context.middleware.ts`). This is the primary
  error trail and needs no configuration.
- **Sentry** is optional: set `SENTRY_DSN` and add `@sentry/node` to enable it
  (`initSentry` in `src/main.ts` uses a dynamic import, so the package stays an
  optional peer). Unset = correlation-ID logging only.

## Data retention

- A daily worker (`RetentionWorker`, `src/modules/workers/`) prunes
  append-only history:
  - `audit_logs` older than `AUDIT_RETENTION_DAYS` (default 365).
  - **Settled** `notification_deliveries` older than `DELIVERY_RETENTION_DAYS`
    (default 90). PENDING deliveries are never pruned.
- Set either to `0` to disable pruning (e.g. a compliance hold).

## Database backups & object-storage lifecycle

- **Postgres**: use Railway's managed Postgres backups — enable daily automated
  backups and set the retention window in the Railway database settings. Before
  a risky migration, take a manual snapshot from the Railway dashboard. Restores
  are performed from the Railway backup UI. (Migrations themselves are
  forward-only, idempotent SQL applied at boot by `scripts/railway-boot.mjs`.)
- **Object storage (S3 bucket)**: property photos and invoice PDFs live in the
  Railway/S3 bucket (`STORAGE_DRIVER=s3`). Configure an S3 **lifecycle policy**
  on the bucket to (a) expire orphaned multipart uploads after ~7 days and
  (b) transition or expire old invoice documents per your retention policy.
  Presigned URLs are short-lived, so objects are never public.

## Rate limiting

- Global tier `THROTTLE_LIMIT` (default 120/60s per IP). Auth endpoints
  (login/OTP/Google/MFA) opt into a tighter `AUTH_THROTTLE_LIMIT` (default
  10/60s) via `@AuthThrottle()`.

## CI

- `.github/workflows/ci.yml` runs on `main`: backend (tsc + eslint + jest),
  backend e2e (testcontainers Postgres), and `flutter analyze`/`test` for both
  apps. `.github/workflows/frontend-ci.yml` runs tsc + build on the `frontend`
  branch (admin console).

## OpenAPI

- Swagger UI at `GET /api/docs`; raw spec at `GET /api/docs-json` (for client
  generation). Covers the admin, owner (`/api/v1/owner`), and staff
  (`/api/v1/staff`) surfaces.
