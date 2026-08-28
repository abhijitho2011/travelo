# Travelo Super Admin API — Phase 1

NestJS 10 + TypeScript backend for the Travelo Super Admin control plane. Phase 1 delivers the foundation: config, database (PostgreSQL + Drizzle), Redis, JWT auth with refresh rotation, admins CRUD, roles & permissions with RBAC, audit logging, health checks, Swagger, and container/Railway deploy assets.

## Requirements
- Node.js 20.x
- PostgreSQL 14+
- Redis 6+ (optional in dev — the app degrades to in-memory caches with a warning)

## Quick start (local, without Docker)

```bash
cp .env.example .env
npm install
npm run db:generate        # produce SQL migration from schema (first time only)
npm run db:migrate         # apply migrations
npm run db:seed            # seed permissions, roles, super admin
npm run dev                # http://0.0.0.0:${PORT}${API_PREFIX}
```

Swagger UI: `http://0.0.0.0:${PORT}/api/docs` (bind is `0.0.0.0`; connect from your host at the same port).

Default super admin: `admin@travelo.local` / `ChangeMe!12345` (override via `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`).

## Quick start (Docker Compose)

```bash
docker compose up --build
# then, in another shell:
docker compose exec api npm run db:migrate
docker compose exec api npm run db:seed
```

## Scripts

| script | purpose |
| --- | --- |
| `npm run dev` | Nest watch mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start:prod` | Run compiled app |
| `npm run start:railway` | Run migrations then start (used by Railway) |
| `npm run db:generate` | Generate SQL from Drizzle schema |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Idempotent seed of permissions, roles, admins |
| `npm run test` | Unit tests (Jest) |
| `npm run lint` | ESLint + Prettier |

## Deploy to Railway

1. Push this repo to GitHub.
2. Create a new Railway project, add a **PostgreSQL** plugin, and a **Redis** plugin.
3. Point Railway at your GitHub repo. The included `railway.json` selects the Dockerfile builder, sets the start command to `npm run start:railway` (which runs `db:migrate` then `node dist/main.js`), and points the health check at `/api/v1/admin/health/live`.
4. Add the environment variables from `.env.example`. `DATABASE_URL` and `REDIS_URL` come from Railway's service references (`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}`). Set strong values for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
5. Deploy. On first boot, run the seed once:
   ```bash
   railway run npm run db:seed
   ```
6. Confirm health: `GET https://<your-app>.up.railway.app/api/v1/admin/health`.

The app binds to `0.0.0.0:$PORT` as Railway requires.

## Testing

`npm run test` runs pure unit tests (no DB required). Integration/e2e tests that need Postgres/Redis are opt-in — set `DATABASE_URL` before running and drop them under `test/*.e2e-spec.ts`.

## Docs
- [ARCHITECTURE.md](./ARCHITECTURE.md) — module and layering overview
- [AUTH.md](./AUTH.md) — JWT, refresh rotation, sessions
- [RBAC.md](./RBAC.md) — roles, permissions, guard semantics
