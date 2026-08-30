# Tavelo — Remediation Phase Plan

Derived from the 2026-08-30 five-surface audit (backend, owner app, staff app,
admin console, infra). Every audit finding maps to exactly one item below.
Status is kept current as phases land.

Legend: ✅ done & deployed · 🔶 partial (remainder noted) · ⬜ not started

---

## ✅ Phase 1 — Guest revenue integrity  (DONE, deployed, migration 0018)
- ✅ 1.1 Guest folio + per-payment ledger
- ✅ 1.2 Restaurant/spa ROOM_CHARGE posts to the folio
- ✅ 1.3 Checkout balance gate + guest receipt PDF
- ✅ 1.4 Front-desk collect-payment + refund UI
- ✅ 1.5 Idempotency on payments/checkout
- ✅ 1.6 Cashfree refunds
- ✅ 1.7 Refund retry worker + admin re-trigger
- ✅ 1.8 Webhook amount reconciliation

## ✅ Phase 2 — SaaS self-serve loop  (DONE, deployed, migration 0019)
- ✅ 2.1 Owner-scoped renewal order endpoint
- 🔶 2.2 Owner app in-app checkout — plumbing/CTA/invoice-download done; the
  final Razorpay/Cashfree WIDGET redemption is unwired (needs configured
  gateway credentials + on-device testing).
- 🔶 2.3 Auto-renew + dunning — the expiring/grace/suspended + trial reminder
  ladder IS the dunning; unattended auto-CHARGE needs gateway recurring
  mandates (not built).
- ✅ 2.4 Trial lifecycle (expiry + notifications; only ever-paid subs get grace)
- ✅ 2.5 Prorated plan change (`POST /subscriptions/:id/change-plan`)
- ✅ 2.6 Subscription-status enforcement (owner writes)
- ✅ 2.7 Entitlement enforcement (`@RequireFeature`, applied to restaurant)
- ✅ 2.8 Owner app renew CTA + invoice download + auto-renew display

## ✅ Phase 3 — Correctness fixes (DONE, deployed)
- ✅ 3.1 Staff `GET /approvals` + approve/reject — approvals aggregator
  (expenses + POs) built server-side
- ✅ 3.2 `GET /dashboard/alerts` — built (approvals/low-stock/open work orders)
- ✅ 3.3 Staff notifications: app model mismatch fixed (type/readAt/meta),
  `read-all` wired, badge polling (dispatch already worked server-side)
- ✅ 3.4 Offline sync queue — StaffSyncHandler registered; the queue drains
- ✅ 3.5 `cleaner` role built onto My Tasks (every role now built)
- ✅ 3.6 Owner notification inbox + bell
- ✅ 3.7 Owner photo management (view/add/delete after creation)
- ✅ 3.8 Owner 401→signOut bridge; staff transient-vs-expired refresh
- ✅ 3.9 Small: `lowStock` coercion, `/restaurant/orders` list screen,
  lost-found status action, inventory supplier screens, admin jobs-retry
  re-drives the queue, 404 debug logging — all done.
- ✅ 3.10 Owner property GET/PATCH/DELETE (edit + archive); model parses
  `contact`, dead `starRating` chip removed

## ✅ Phase 4 — PMS depth (DONE, deployed, migrations 0020–0024)
- ✅ 4.1 Night audit (auto no-show + daily snapshots)
- ✅ 4.2 Rate plans — date-ranged overrides applied at booking (first cut)
- ✅ 4.3 Guest CRM — repeat lookup, history, blacklist (first cut)
- ✅ 4.4 Per-night availability check (fixes false refusals)
- ✅ 4.5 Room move / stay extension
- ✅ 4.6 Hotel reporting (occupancy/ADR/RevPAR + arrivals/departures manifest)
- ✅ 4.7 Owner operational visibility per hotel
- ✅ 4.8 Work order takes the room OUT_OF_ORDER on create
- ✅ 4.9 Inventory depletion from restaurant sales via recipes
- ✅ 4.10 Staff CSV export (reservations + expenses)
- ✅ 4.11 Group bookings — master + linked reservations (first cut)

First-cut items (4.2/4.3/4.9/4.11) have documented later refinements: per-night
re-pricing + BAR/OTA plans; reservation-time guest auto-link + blacklist
enforcement; recipe-driven depletion is done but a fuller BOM is future; group
shared-folio + allotment blocks.

## ✅ Phase 5 — Admin console write-paths (DONE, deployed, `frontend` branch)
- ✅ 5.1 Notification deliveries + templates · ✅ 5.2 Channex sync/logs/mapping
- ✅ 5.3 Gateway-order UI (Razorpay/Cashfree selector on each subscription)
- ✅ 5.4 Roles/permissions editor (matrix), admin create/edit, session revoke
- ✅ 5.5 Plan + feature-matrix editor; subscription extend (already wired)
- ✅ 5.6 Payment/invoice detail; invoice/property/announcement/ticket create;
  ticket assign
- ✅ 5.7 Audit actor/entity-id filters (analytics panels already on dashboard)
- ✅ 5.8 Permission-gated navigation; dead `/discounts` removed
- ✅ 5.9 Dead `web/` deleted on main; admin console lives on `frontend`

## ✅ Phase 6 — Notifications & engagement (DONE, deployed, migrations 0025–0026)
- ✅ 6.1 FCM push — device_tokens table + register/revoke endpoints (owner +
  staff), FcmPushChannel over the existing Firebase service-account app,
  firebase_messaging wired into both apps (register on sign-in, revoke on
  sign-out, token-refresh). On-device delivery still needs the platform FCM
  config files + APNs key (a deploy/credential step, not code).
- ✅ 6.2 Guest-facing — booking.confirmed + booking.checked_in to the guest's
  SMS + email on confirm / confirmed-create / check-in (templates in 0026).
- ✅ 6.3 Operational — notify() auto-mirrors a PUSH target off every owner/staff
  IN_APP target (reusing the IN_APP template), so every existing in-app event
  (approvals, payments, subscription lifecycle, support) reaches devices.
- ✅ 6.4 Deep links — tapped-notification routing (routeForData) in both apps;
  owner app gains a go_router errorBuilder for stale/removed targets.
- 🔶 6.5 WhatsApp — deferred (optional). Channel stays UnavailableChannel;
  needs a WhatsApp Business API provider + credentials.

## ✅ Phase 7 — Security & compliance hardening (DONE, deployed, migrations 0027–0028)
- ✅ 7.1 Owner + staff TOTP MFA — mirrors admin MFA (enroll/verify/disable/status,
  challenge-gated login, recovery codes, AES-256-GCM secret). Needs
  `MFA_SECRET_KEY`. Backend done; Flutter enroll/challenge UI is a follow-up.
- ✅ 7.2 Staff sign-out-all + session listing (`/staff/sessions`) and
  admin-driven staff revoke (`staff.manage`).
- ✅ 7.3 Tiered rate limiting — strict `auth` tier (10/min) on login/OTP/MFA via
  `@AuthThrottle()`; broad `default` (120/min) elsewhere.
- ✅ 7.4 `CHANNEX_WEBHOOK_SECRET` required in production (env + handler).
- ✅ 7.5 GST engine — CGST/SGST/IGST slabs (accommodation/restaurant/service),
  exact paise split, invoice tax breakdown, subscriptions at 18%. Folio tax
  columns added; folio-line GST is a future step.
- ✅ 7.6 Retention worker — daily prune of audit logs + settled deliveries
  (AUDIT_RETENTION_DAYS / DELIVERY_RETENTION_DAYS; 0 disables). Cursor pagination
  deferred — offset is sufficient at current scale.
- ✅ 7.7 Shared `Paginated<T>` + `resolvePage` helper; unbounded session lists
  now capped at MAX_PAGE_LIMIT.

## ✅ Phase 8 — Infrastructure & quality (DONE, deployed)
- ✅ 8.1 GitHub Actions CI — `.github/workflows/ci.yml` (backend tsc+eslint+jest,
  e2e via testcontainers, both Flutter apps) + `frontend-ci.yml` (admin console).
- ✅ 8.2 `/metrics` (dependency-free Prometheus, raw via `@Res()`) + optional
  Sentry (dynamic-import peer) + correlation IDs (already existed).
- 🔶 8.3 Backups — documented in `docs/OPERATIONS.md` (Railway managed Postgres
  backups + S3 lifecycle policy); the actual enablement is a Railway/bucket
  config step, not code.
- ✅ 8.4 OpenAPI — refreshed DocumentBuilder (title/version/servers/tags), raw
  spec at `/api/docs-json`.
- ✅ 8.5 Docs sync — `docs/OPERATIONS.md`; `.env.example` updated with Phase 7/8
  vars.
- ✅ 8.6 Repo hygiene — `.gitignore` covers Flutter build/.dart_tool + aab/ipa;
  tree normalised with prettier so CI lint passes.
- ✅ 8.7 E2E — `test/infra.e2e-spec.ts` (health/metrics/404 envelope).
- ✅ 8.8 Support attachments — upload (admin + owner) to the `support_attachments`
  table via StorageService, presigned download URLs in ticket detail. Admin-
  console + Flutter attachment UI is a follow-up.

## Deferred backlog (new modules, not defects)
~45 role permissions with no screens: banquet, laundry, payroll, attendance/
leave, patrol, GRN/procurement, corporate accounts, keycard, driver depth,
CCTV/asset registers.
