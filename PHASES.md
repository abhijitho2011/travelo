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

## ⬜ Phase 4 — PMS depth
- 4.1 Night audit · 4.2 Rate plans / seasonal pricing · 4.3 Guest profiles/CRM
- 4.4 Per-night availability calendar · 4.5 Room move / stay extension
- 4.6 Hotel reporting (ADR/RevPAR/occupancy/tax/C-Form) · 4.7 Owner ops dashboards
- 4.8 Maintenance→OUT_OF_ORDER wiring · 4.9 Inventory depletion
- 4.10 Export coverage · 4.11 Group bookings

## ⬜ Phase 5 — Admin console write-paths (`frontend` branch)
- 5.1 Notification deliveries + templates · 5.2 Channex sync/logs/mapping
- 5.3 Gateway-order UI · 5.4 Roles/permissions editor, admin CRUD, session revoke
- 5.5 Plan + feature-matrix editor, subscription detail/extend
- 5.6 Invoice/payment detail, property/announcement/ticket create
- 5.7 Analytics panels + audit filters · 5.8 UI permission gating; kill `/discounts`
- 5.9 Delete dead `web/` on main; merge branch strategy

## ⬜ Phase 6 — Notifications & engagement
- 6.1 FCM push (both apps) · 6.2 Guest-facing notifications
- 6.3 Operational notifications · 6.4 Deep links + router errorBuilder
- 6.5 WhatsApp channel (optional)

## ⬜ Phase 7 — Security & compliance hardening
- 7.1 Owner/staff MFA / step-up · 7.2 Sign-out-all + admin staff session revoke
- 7.3 Tiered rate limiting · 7.4 Require `CHANNEX_WEBHOOK_SECRET` in prod
- 7.5 GST engine (slabs/CGST-SGST/HSN) · 7.6 Audit/delivery retention + cursor pagination
- 7.7 Pagination consistency + load-more

## ⬜ Phase 8 — Infrastructure & quality
- 8.1 GitHub Actions CI · 8.2 Sentry + `/metrics` + correlation IDs
- 8.3 Postgres backups + S3 lifecycle · 8.4 OpenAPI coverage + versioning
- 8.5 Docs sync · 8.6 Repo hygiene (untrack `dist`/APK/build)
- 8.7 E2E expansion · 8.8 Support attachments

## Deferred backlog (new modules, not defects)
~45 role permissions with no screens: banquet, laundry, payroll, attendance/
leave, patrol, GRN/procurement, corporate accounts, keycard, driver depth,
CCTV/asset registers.
