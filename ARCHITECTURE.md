# Architecture — Phase 1

## Runtime
- **NestJS 10** on Node 20 (`main.ts` bootstraps and binds `0.0.0.0:$PORT`).
- **API prefix**: `/api/v1/admin`.
- **Swagger** at `/api/docs`.
- **Pino** structured logs, request id header (`x-request-id`) generated per request.

## Modules
- `config` — validated via zod (`src/config/env.ts`).
- `database` — `pg` Pool + `drizzle-orm/node-postgres`. Schema in `src/database/schema/*.ts`.
- `queue` — `ioredis` client (nullable) + BullMQ module registered globally; no jobs yet.
- `auth` — Passport-JWT strategy, `AuthService` (login/refresh/logout), guards.
- `admins` — list/get/create/update/set-status + session listing & revocation.
- `roles` — CRUD on roles and their permission grants.
- `permissions` — catalog + effective-permissions cache (Redis, falling back to in-process).
- `audit` — append-only writes, list endpoint.
- `health` — Terminus health checks (DB + Redis).

## Cross-cutting
- `RequestContextMiddleware` seeds an `AsyncLocalStorage` store per request with `requestId`, `ip`, `userAgent`. `JwtStrategy` enriches it with `adminId`, `sessionId`, `adminEmail`. `AuditService.record()` reads the store to attribute writes.
- Global `ValidationPipe` (class-validator + class-transformer) rejects unknown fields.
- Global `AllExceptionsFilter` returns `{ success:false, error:{code,message,details}, meta:{requestId,timestamp} }`.
- Global `ResponseInterceptor` wraps successful bodies as `{ success:true, data, meta }`.
- Global `ThrottlerGuard` (`@nestjs/throttler`) — 120 req/min per IP by default.
- `helmet()` applied globally.

## Data model summary
- `admins`, `admin_sessions`, `roles`, `role_permissions`, `admin_roles`, `permissions`, `audit_logs`. UUID PKs (`gen_random_uuid()` via pgcrypto), tz-aware timestamps, soft-delete on admins.

## Response envelope

Success:
```json
{ "success": true, "data": {...}, "meta": { "requestId": "...", "timestamp": "..." } }
```
Error:
```json
{ "success": false, "error": { "code": "FORBIDDEN", "message": "...", "details": null },
  "meta": { "requestId": "...", "timestamp": "..." } }
```

## Deploy pipeline
- Dockerfile: multi-stage (deps → build → runtime) on `node:20-alpine`, runs as non-root `app` user.
- Railway: uses `railway.json` (Dockerfile builder). `startCommand` = `npm run start:railway` which runs migrations before `node dist/main.js`.
- Health check: `/health/live` (mounted outside the API prefix so Railway's checker can reach it without knowing the versioned base).
