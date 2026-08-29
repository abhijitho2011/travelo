# Deployment

Everything runs on **Railway**. The API is a Docker service; Postgres, Redis and
the object bucket are Railway plugins; the two Flutter web apps are served
together by a second Docker service.

## Services

| Service | Built from | Notes |
| --- | --- | --- |
| API | root `Dockerfile` | `CMD npm run start:railway`; healthcheck `/health/live` |
| Portal (owner + staff web) | `Dockerfile.portal` | serves `/` chooser, `/owner/`, `/staff/` from one nginx |
| Postgres | Railway plugin | referenced as `DATABASE_URL` |
| Redis | Railway plugin | referenced as `REDIS_URL`; optional |
| Bucket | Railway bucket | referenced as the `S3_*` variables |
| Volume | Railway volume | only needed when `STORAGE_DRIVER=local` (`UPLOADS_DIR`) |

> The root repository has **no `railway.json`.** The API service's builder,
> start command and healthcheck are configured in the Railway dashboard.
> (`owner_app/railway.json` and `web/railway.json` exist for those services.)
> An earlier version of this document claimed a root `railway.json` set the
> start command — it does not exist.

## Boot sequence

`npm run start:railway` runs `scripts/railway-boot.mjs`, in this order:

1. **Choose a database.** Try `DATABASE_URL`, then `DATABASE_PUBLIC_URL`
   (always with SSL — it is the public proxy). First one that connects wins.
2. **Adopt pre-existing migrations.** If `_boot_migrations` does not exist but
   `admins` does, the database predates migration tracking: every file is
   inserted as already-applied so nothing re-runs.
3. **Create `_boot_migrations`** (`filename text PRIMARY KEY, applied_at timestamptz`).
4. **Apply each unapplied `.sql` file in `src/database/migrations`, sorted by
   filename.** Each migration and its bookkeeping `INSERT` commit in **one
   transaction**, so a crash can never leave a migration applied but
   unrecorded, or recorded but unapplied. A failing migration aborts the
   migration phase.
5. **Seed** — only if `RUN_SEED=true`. Runs `scripts/seed-node.mjs`. Idempotent;
   never duplicates the super admin.
6. **Launch `dist/main.js`.**

**A failed migration does not stop the boot.** The script logs
`continuing to app boot despite migration failure` and starts the app anyway,
so `/health/live` stays reachable and you can read the log. Read the deploy log
after every migration deploy — a green service is not proof the migration ran.

See [DATABASE.md](./DATABASE.md#migration-discipline) for the rules on writing
migrations.

## Environment variable reference

Everything below is declared in [`src/config/env.ts`](./src/config/env.ts) and
validated with zod at boot. An invalid value **aborts the process** with the
offending field names printed. Never commit a real value for anything in the
"secret" column.

### Core

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `PORT` | no | `3000` | Railway injects this |
| `API_PREFIX` | no | `/api/v1/admin` | admin surface only; owner/staff are literal paths |
| `LOG_LEVEL` | no | `info` | pino levels |
| `CORS_ORIGINS` | no | `*` | comma-separated; `*` reflects the request origin |
| `DATABASE_URL` | **yes** | — | must parse as a URL |
| `DATABASE_SSL` | no | `false` | string `"true"` enables `rejectUnauthorized: false` |
| `REDIS_URL` | no | — | unset ⇒ in-memory permission cache, no BullMQ connection |
| `RUN_SEED` | no | `false` | set `"true"` for exactly one deploy, then unset |

`DATABASE_PUBLIC_URL` is read by `scripts/railway-boot.mjs` and by
`DatabaseModule` as a fallback, but it is **not declared in `src/config/env.ts`**
— see [Undeclared variables](#undeclared-variables).

### Tokens

| Var | Required | Default | Secret |
| --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | **yes** | — | yes (min 16 chars) |
| `JWT_REFRESH_SECRET` | **yes** | — | yes (min 16 chars) |
| `JWT_ACCESS_TTL` | no | `15m` | |
| `JWT_REFRESH_TTL` | no | `30d` | |
| `OWNER_JWT_ACCESS_SECRET` | in production | insecure placeholder | yes |
| `OWNER_JWT_REFRESH_SECRET` | in production | insecure placeholder | yes |
| `OWNER_JWT_ACCESS_TTL` / `OWNER_JWT_REFRESH_TTL` | no | `15m` / `30d` | |
| `STAFF_JWT_ACCESS_SECRET` | in production | insecure placeholder | yes |
| `STAFF_JWT_REFRESH_SECRET` | in production | insecure placeholder | yes |
| `STAFF_JWT_ACCESS_TTL` / `STAFF_JWT_REFRESH_TTL` | no | `15m` / `30d` | |

⚠️ The owner and staff secrets have **defaults that pass validation**
(`owner-access-secret-change-me-32chars` and friends). Boot will not warn you.
Set all four in production or the owner and staff surfaces are forgeable.

### Admin sign-in

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `SUPER_ADMIN_EMAIL` | one of the two | — | the only Google account allowed |
| `SUPER_ADMIN_MOBILE` | one of the two | — | the only mobile allowed to get an OTP |
| `SEED_SUPER_ADMIN_EMAIL` | no | `admin@tavelo.local` | seed only |
| `SEED_SUPER_ADMIN_PASSWORD` | no | placeholder | seed only — **password sign-in no longer exists**; this only fills `admins.password_hash` |
| `OTP_TTL_MIN` | no | `10` | |
| `OTP_MAX_ATTEMPTS` | no | `5` | |

With **neither** allowlist variable set the app boots and logs
`*** ADMIN SIGN-IN IS IMPOSSIBLE … ***`. See [AUTH.md](./AUTH.md#recovery).

### Admin TOTP MFA

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `MFA_SECRET_KEY` | no | — | 32 raw bytes, base64. Without it **enrolment** is refused (`MFA_NOT_CONFIGURED`) rather than storing a plaintext secret |
| `MFA_MAX_ATTEMPTS` | no | `5` | failed challenges before the step locks |
| `MFA_LOCK_SECONDS` | no | `900` | how long that lock lasts |

### Firebase (Google sign-in)

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `FIREBASE_PROJECT_ID` | no | `tavelo-c4669` | |
| `FIREBASE_SERVICE_ACCOUNT` | no | — | full service-account JSON; secret |
| `GOOGLE_APPLICATION_CREDENTIALS` | no | — | path to a service-account file |

Unset both and ID tokens are verified against Google's public certificates.

### SMS (BSNL DLT)

| Var | Required | Default |
| --- | --- | --- |
| `SMS_PROVIDER` | no | `console` (`console` \| `bsnl`) |
| `BSNL_BASE_URL`, `BSNL_USERNAME`, `BSNL_PASSWORD` | with `bsnl` | — |
| `BSNL_HEADER`, `BSNL_ENTITY_ID`, `BSNL_SERVICE_ID`, `BSNL_TOKEN_ID` | with `bsnl` | — |
| `BSNL_TEMPLATE_ID` | with `bsnl` | — (the **OTP** DLT template) |
| `BSNL_TEMPLATE_VAR_KEY` | no | `motcode` |
| `BSNL_TOKEN_PATH` | no | `/api/Create_New_API_Token` |
| `BSNL_SEND_PATH` | no | `/api/Send_SMS` |
| `BSNL_INSECURE_TLS` | no | `false` |
| `BSNL_NOTIFY_TEMPLATE_ID` | for notification SMS | — (a **second** DLT template) |
| `BSNL_NOTIFY_VAR_KEY` | no | `message` |

`BSNL_NOTIFY_TEMPLATE_ID` is separate on purpose: the OTP template must not
carry other copy. Unset ⇒ notification SMS is skipped silently.

### Email

| Var | Required | Default |
| --- | --- | --- |
| `SMTP_HOST` | for real email | — |
| `SMTP_PORT` | no | `587` |
| `SMTP_USER` / `SMTP_PASSWORD` | usually | — (secret) |
| `SMTP_SECURE` | no | `false` |
| `MAIL_FROM` | for real email | — |

Without `SMTP_HOST` **and** `MAIL_FROM` the EMAIL channel degrades to a console
provider that logs the message: one boot warning, never a crash. Deliveries
will look successful in `notification_deliveries` while nobody receives them.

### Payments

| Var | Required | Notes |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | for gateway orders & refunds | both halves or the endpoints return `GATEWAY_NOT_CONFIGURED`; secret |
| `PAYMENT_WEBHOOK_SECRET_RAZORPAY` | for the Razorpay webhook | secret |
| `PAYMENT_WEBHOOK_SECRET_CASHFREE` | for the Cashfree webhook | secret |

Manual payment recording works without any of these.

### Storage

| Var | Required | Default |
| --- | --- | --- |
| `STORAGE_DRIVER` | no | `local` (`s3` \| `local`) |
| `UPLOADS_DIR` | with `local` | — |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | with `s3` | — |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | with `s3` | — (secret) |

`STORAGE_DRIVER=s3` with incomplete S3 config **falls back to `local`** with a
warning. On Railway that means writing to a container filesystem that dies with
the deploy — check the boot log for
`STORAGE_DRIVER=s3 but S3 configuration is incomplete`.

### Channex

| Var | Required | Default |
| --- | --- | --- |
| `CHANNEX_ENABLED` | no | `false` |
| `CHANNEX_BASE_URL` | no | `https://staging.channex.io/api/v1` |
| `CHANNEX_API_KEY` | to enable | — (secret) |
| `CHANNEX_WEBHOOK_SECRET` | no | — when set, unsigned payloads are refused (secret) |

Disabled ⇒ the adapter is inert: one boot line, no sockets, every entry point
returns `CHANNEX_NOT_CONFIGURED`.

⚠️ `CHANNEX_BASE_URL` defaults to **staging**. Set it explicitly in production.

### Rate limiting

| Var | Default |
| --- | --- |
| `THROTTLE_TTL` | `60` (seconds) |
| `THROTTLE_LIMIT` | `120` (requests per IP per window) |

## Undeclared variables

Found while cross-checking `.env.example` and the code against
`src/config/env.ts`:

| Var | Where | Status |
| --- | --- | --- |
| `APP_URL` | `.env.example` line 4 | **not in `env.ts` and referenced nowhere in `src/` or `scripts/`.** Dead. |
| `DATABASE_PUBLIC_URL` | `scripts/railway-boot.mjs`, `src/database/database.module.ts` | **used but not declared in `env.ts`.** Read through `process.env` / `ConfigService`, so it works, but it is unvalidated and undocumented in `.env.example`. |

`.env.example` is also badly out of date: it is missing `MFA_*`,
`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_MOBILE`, `PAYMENT_WEBHOOK_SECRET_*`,
`RAZORPAY_*`, `BSNL_NOTIFY_*`, all `SMTP_*`, `MAIL_FROM`, all `CHANNEX_*` and
`RUN_SEED`. Use the tables above, not that file.

## Before you call it production

- [ ] **`OWNER_JWT_*` and `STAFF_JWT_*` secrets set.** They have working
      defaults; nothing will tell you.
- [ ] **`SUPER_ADMIN_EMAIL` and/or `SUPER_ADMIN_MOBILE` set** and matching an
      `ACTIVE` admin row. There is no password fallback.
- [ ] **SMTP configured** (`SMTP_HOST` + `MAIL_FROM`). Otherwise every email
      notification is logged and discarded.
- [ ] **Both DLT templates registered and set** — `BSNL_TEMPLATE_ID` for OTP,
      `BSNL_NOTIFY_TEMPLATE_ID` for notification SMS — with
      `SMS_PROVIDER=bsnl`. Indian DLT rejects unregistered content outright.
- [ ] **`STORAGE_DRIVER=s3` with all five `S3_*` values**, and confirm the boot
      log does *not* say it fell back to local.
- [ ] **`MFA_SECRET_KEY` set** if anyone is to enrol in TOTP.
- [ ] **`CHANNEX_BASE_URL` pointed at production**, not the staging default.
- [ ] **`CORS_ORIGINS` set to the real origins.** The default is `*`.
- [ ] **Release keystores for both Flutter apps.**
      `owner_app/android/app/build.gradle.kts` currently reads
      `signingConfig = signingConfigs.getByName("debug")` with the comment
      *"Signing with the debug keys for now"*. A debug-signed APK cannot be
      published or upgraded in place.
- [ ] **Firebase authorized domains** — add the production portal domain under
      Firebase console → Authentication → Settings → Authorized domains, or
      Google sign-in fails in the web builds. Project `tavelo-c4669`.
- [ ] **A trigger for the workers.** Nothing in the app schedules them today
      (see [ARCHITECTURE.md](./ARCHITECTURE.md#workers)). Without one,
      subscriptions never expire, metrics never accrue, announcements never
      publish and queued notifications never send.
- [ ] **Razorpay webhook** pointed at `POST /api/v1/admin/webhooks/payments/razorpay`
      with `PAYMENT_WEBHOOK_SECRET_RAZORPAY` matching the dashboard value.

## Local Docker

```bash
docker compose up --build
docker compose exec api npm run db:migrate
docker compose exec api npm run db:seed
```

`postgres:16-alpine` + `redis:7-alpine` + the API on `:3000`, with development
secrets inline in `docker-compose.yml`. Not a production reference.

## Rollback

Migrations are forward-only — there are no `down` scripts. Rolling the image
back does **not** roll the schema back, so every migration must be compatible
with the previous release (add columns nullable or defaulted, never rename or
drop in the same deploy that stops using them).
