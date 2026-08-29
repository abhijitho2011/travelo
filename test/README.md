# Tavelo test suites

Two suites, two commands, two very different costs.

| | `npm test` | `npm run test:e2e` |
|---|---|---|
| What it runs | everything under `src/**/*.spec.ts` | `test/*.e2e-spec.ts` |
| Database | none — the Drizzle client is a stand-in | a real PostgreSQL 16 in a throwaway container |
| Docker | **never needed** | required, or the suite skips |
| Typical time | seconds | minutes (image pull on the first run) |

`npm test` is the one you run constantly. It must stay fast and must never
require Docker, so nothing under `src/` may reach for a container.

---

## The unit + security suite (`npm test`)

`jest` is configured in `package.json` with `rootDir: "src"`, so it never sees
`test/`. Every `.e2e-spec.ts` lives outside that root and is therefore invisible
to it — which is what keeps the fast suite Docker-free.

### `src/security/` — the security suite (spec §64)

Everything else in the repository tests one service or one guard in isolation.
That proves the unit behaves; it cannot prove the **route** is protected,
because a guard that was never applied still passes its own unit test.

The security suite therefore boots the whole `AppModule` over HTTP —
same global prefix, same `owner`/`staff` prefix exclusions as `src/main.ts` —
and drives it with `supertest`.

| File | §64 item |
|---|---|
| `security-harness.ts` | the harness: boots the app, scripts the database, enumerates routes |
| `fixtures.ts` | guard-satisfying rows for one admin, one owner, one staff member |
| `tokens.ts` | mints all five token families, plus four forgeries |
| `harness.smoke.spec.ts` | proves the harness itself is honest before anything is concluded from it |
| `token-isolation.security.spec.ts` | 1 — token isolation across the four audiences |
| `jwt-forgery.security.spec.ts` | 2 — expired, wrong-secret, `alg:none`, edited-payload |
| `cross-tenant.security.spec.ts` | 3 — cross-tenant / IDOR, 404 never 403 |
| `permission-bypass.security.spec.ts` | 4 — permission bypass with a known-good URL and payload |
| `session-lifecycle.security.spec.ts` | 5 + 6 — account state, refresh rotation, revocation |
| `impersonation.security.spec.ts` | 7 — impersonation is permissioned, live-checked, read-only |
| `audit-immutability.security.spec.ts` | 8 — no write surface on audit logs |
| `otp-disclosure.security.spec.ts` | 9 — OTP never in a body, no account oracle, lockout |
| `throttling.security.spec.ts` | 10 — a burst is actually rejected |

Three conventions run through all of it:

- **Every refusal is paired with a control.** A 403 proves nothing if the
  request would have failed anyway, so each denied call is shown succeeding for
  a properly privileged caller at the same URL with the same payload.
- **The fixtures try to leak.** The cross-tenant fixtures hand over the foreign
  row *unless* the query also names the caller's tenant, so a service that
  forgets its scope returns 200 with someone else's data and the test fails —
  rather than the test quietly assuming the scope was there.
- **Negative claims are made against the router.** "No endpoint can edit an
  audit log" is asserted by enumerating every mounted route, not by probing a
  few URLs and collecting 404s.

#### Environment

`src/config/config.module.ts` validates the environment when it is *imported*,
which happens before any `beforeAll`. Each spec therefore calls
`installTestEnv()` at module scope and pulls in `app.module` through a dynamic
`import()` — the same pattern `src/app.bootstrap.spec.ts` uses. Setting env in
`beforeAll` is too late and fails confusingly.

#### Known failing test

`session-lifecycle.security.spec.ts` contains one `it.failing` case documenting
a real defect: **refresh tokens carry no `jti`**, so two rotations of the same
session inside one `iat` second produce a byte-identical token, and the
reuse detector cannot fire. Jest reports it as passing *because it fails* —
delete the `.failing` once a unique claim is added to the three `signRefresh`
methods.

---

## The E2E suite (`npm run test:e2e`)

`test/jest-e2e.json`, `maxWorkers: 1`, one container per spec file.

### Database strategy

1. `testcontainers` starts `postgres:16-alpine` on a **dynamically allocated
   host and port** — the container's own. That is the only localhost reference
   in either suite, and it is deliberately not hard-coded, so parallel runs and
   several developers never collide.
2. `test/support/database.ts` applies `src/database/migrations` **exactly as
   `scripts/railway-boot.mjs` does in production**: `.sql` files only, sorted by
   filename, tracked in a `_boot_migrations` table, each migration and its
   bookkeeping row committed together. Using the production path rather than
   `drizzle-kit push` is the point — these tests exercise the schema a deploy
   will actually produce, migration bugs included.
3. `seedMinimum()` inserts only what the API has no endpoint to create: one
   subscription plan and one state/district pair. Everything else — owner,
   subscription, property, room types, rooms, staff, reservations, payments,
   invoices — is created **through the API**, because a fixture-built world
   tests the fixture.
4. The only mock is the SMS provider, and only so a test can read the one-time
   code the server correctly refuses to put in a response body.

### What the specs cover

- `platform-flow.e2e-spec.ts` — one customer's first day, in order: admin OTP
  sign-in → owner with a mandatory plan → subscription → property → owner
  appoints a GM → GM signs in → room type → room → bulk rooms → GM hires a
  receptionist (`PENDING_APPROVAL`) → approves → receptionist signs in →
  reservation → confirm → check-in (room `OCCUPIED`) → check-out (room `DIRTY`)
  → manual payment → subscription renewed from `max(now, period_end)` → invoice
  → CSV export with rows → the audit log containing the whole chain.
- `tenant-isolation.e2e-spec.ts` — two real tenants in one real database. The
  mocked-DB suite proves the services *build* a scoped query; this proves the
  scoping holds when there is genuinely something else in the table to leak.

### Without Docker

The suite **skips; it does not fail.** `test/support/docker.ts` probes for a
container runtime synchronously — it has to be synchronous, because Jest decides
which tests exist while the file is loading — and each spec picks `describe` or
`describe.skip` from the answer. `test/support/global-setup.ts` prints the
reason to stderr before any test file loads, because Jest swallows console
output from a suite that is entirely skipped.

```
$ npm run test:e2e     # on a machine with no Docker

  Tavelo E2E suite SKIPPED: no reachable Docker daemon.
  ...
Test Suites: 2 skipped, 0 of 2 total
Tests:       30 skipped, 30 total
```

Exit code 0. Set `TAVELO_E2E_SKIP_DOCKER=true` to force the skip on a machine
that *has* Docker — useful for a CI job that should not spend the minutes.
