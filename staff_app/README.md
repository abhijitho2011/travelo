# Tavelo — unified staff app

One Flutter app for every hotel employee. The signed-in user's **role** decides
what the app is: a General Manager sees an operations dashboard, an approval
queue and the team directory; a room attendant sees a list of rooms to clean; a
security guard sees the gate. There is no second app and no build flavour —
`GET /auth/me` returns a role and a permission list, and the UI is derived from
those two facts.

## Where this app sits in the chain

```
Super Admin  →  creates Owner
Owner        →  creates Property + General Manager / Assistant GM
GM / AGM     →  creates the rest of the property's staff   ← this app's Team module
staff        →  sign in here with mobile + OTP, or Google
```

The backend is the Nest API in this repo (`src/modules/staff-auth`). Roles,
permissions and tenant scoping are enforced server-side; this app renders what
the server says it may.

---

## Running it

```bash
cd staff_app
flutter pub get
flutter analyze            # must be clean
flutter test               # 17 tests
flutter run  --dart-define=API_BASE_URL=https://travelo-admin-api-production.up.railway.app/api/v1
flutter build web --release --no-wasm-dry-run
```

`API_BASE_URL` defaults to the deployed Railway backend. There is **no localhost
fallback anywhere** — the app talks to `$API_BASE_URL/staff`. Firebase values
for Google sign-in are also `--dart-define`-able
(`FIREBASE_API_KEY`, `FIREBASE_APP_ID`, …); the defaults point at the shared
`tavelo-c4669` project.

---

## Architecture

```
lib/
  main.dart                     app entry; ProviderScope + MaterialApp.router
  firebase_options.dart
  core/
    config/                     AppConfig — every host, via --dart-define
    networking/                 ApiClient (envelope unwrap, single-flight 401→refresh→retry)
                                ApiException + ApiErrorCodes
    authentication/             AuthController, AuthState, Session, GoogleAuthService
    storage/                    TokenStore (secure, `tavelo.staff.*`), LocalStore (cache + queue)
    permissions/                PermissionSet, PermissionKeys (P), RoleConfig, PermissionGate
    routing/                    Routes, guards, app_router
    notifications/              model + controller
    offline/                    PendingOperation, SyncQueue, ConnectivityService
    theme/                      AppColors, AppTypography, AppTheme, ThemeController
    widgets/                    AppShell, primitives, cards, states, status badge, OTP field
    utils/                      Fmt (money, dates, durations)
  features/
    auth/ dashboard/ management/ reception/ housekeeping/ security/ profile/
    notifications/ accounts/ sales/ travel_desk/ maintenance/ spa/ restaurant/
    inventory/ driver/ events/
```

Feature-first: each feature owns `data/` (models + repository), `application/`
(controllers) and `presentation/` (screens). There is no shared `screens/`
folder. State is **Riverpod**, routing is **go_router**.

---

## How RoleConfig works

`core/permissions/role_config.dart` is the architectural core. It is a single
map, `StaffRole → RoleConfig`, covering all **23 roles** in the server's
`hotelStaffRoleValues`. Each entry declares:

| field | meaning |
| --- | --- |
| `homeRoute` | where the user lands after sign-in |
| `homeModuleLabel` | the module's real name, used by the placeholder screen |
| `bottomNav` | ordered `NavItem`s for the bottom bar |
| `moreMenu` | overflow destinations, shown in the "More" sheet |
| `built` | false while the home module is still a placeholder |

A `NavItem` carries `label`, `icon`, `route` and `requires: [permission keys]`.

### The resolution chain

```
GET /auth/me
   ├─ role  ──────────────► StaffRole.fromWire(...)  ──► RoleConfig.of(role)
   └─ permissions[] ──────► PermissionSet
                                  │
        RoleConfig.visibleNav(permissions)  ──► the bottom bar this user sees
        RoleConfig.visibleMore(permissions) ──► the More sheet
        RoleConfig.allowedRoutes            ──► what RoleGuard permits
        RoleConfig.requirementsFor(route)   ──► what PermissionGuard checks
```

**No screen anywhere branches on `role == ...`.** The GM and the AGM share one
identical map entry; what narrows the AGM's app is purely the permission set the
server returns for them (no `staff.delete`, `reports.export`, `payroll.read` or
`owner.read`). Add a permission server-side and the client widens on its own.

An unrecognised role string resolves to `StaffRole.unknown`, which routes to a
clean placeholder — never a crash, never invented data.

### Router guards

Composed once in `core/routing/guards.dart` and applied by a single
`GoRouter.redirect`. Screens never repeat any of it.

```
AuthGuard          is there a session? → splash / login / otp / session-expired
AccountStatusGuard is the account usable? → /account-status
FirstLoginGuard    first sign-in on this device? → /welcome (once)
RoleGuard          is this route in RoleConfig.allowedRoutes?  → /access-denied
PermissionGuard    does the user hold requirementsFor(route)?  → /access-denied
```

Detail routes canonicalise to their parent nav route by longest-prefix match
(`/reception/reservations/R-12` → `/reception/reservations`), so a detail screen
inherits its parent's guard requirements rather than being unguarded.

### Permission gating at the button level

`PermissionGate` is the only sanctioned way to render a conditional action:

```dart
PermissionGate(
  permission: P.staffDelete,          // GM holds it; AGM does not
  child: OutlinedButton.icon(... 'Remove' ...),
)
```

Two modes: `GateMode.hide` (the default — an action you may not take should not
advertise itself) and `GateMode.disable` (dimmed with an explanatory tooltip,
for cases where the missing control would confuse the layout). A `fallback` may
supply a `PermissionNote` explaining why the surface is thinner than expected.
`ref.hasPermission(key)` / `ref.watchPermission(key)` cover imperative cases.

Concrete demonstrations shipped in this build:

* **Team directory** — the GM sees Approve / Suspend / Block / Reactivate /
  Remove. An AGM, who the server does not grant `staff.delete`, never sees
  **Remove** at all; it is absent, not greyed out.
* **Reservations** — a receptionist holds `checkin.perform` and
  `checkout.perform` but not `reservation.cancel`, so the **Cancel** button is
  simply not built for them; a GM sees it on the same screen.
* **KPI tiles** — revenue and ADR only render for a role holding `revenue.read`.
* **Check-in stepper** — the payment step is skipped entirely for anyone without
  `payment.collect`, rather than asking them to do something they cannot.
* **Incidents** — a guard holds `incident.create` but not `incident.read`, so
  they get the report form and an honest note where the history would be.

---

## Design system

Ported from the reference React app's design tokens. `oklch()` values were
converted to sRGB and live in `core/theme/app_colors.dart`, each with its
originating `oklch(...)` in a trailing comment so a future token change can be
re-derived rather than eyeballed.

| token | light | dark |
| --- | --- | --- |
| `--primary` `oklch(0.62 0.13 163)` | `#139E6F` | `#35CE95` |
| `--background` | `#F4F8F6` | `#070B09` |
| `--card` | `#FFFFFF` | `#0E1412` |
| `--border` | `#D9E0DD` | `white @ 10%` |
| `--critical` / `--warning` / `--healthy` | `#CC3333` / `#CD9219` / `#139E6F` | `#F66D64` / `#E9B452` / `#35CE95` |

Plus the operational palette (`st-available`, `st-occupied`, `st-dirty`,
`st-cleaning`, `st-inspected`, `st-maintenance`, `st-ooo`).

Typography: **Sora** for display, headings and KPI numerals; **Manrope** for
body — via `google_fonts`, reproducing the CSS's `letter-spacing: -0.015em` on
headings and `-0.03em` on the `.kpi` utility, with tabular figures.
`--radius: 0.875rem` and its ±4/±2 derivatives are in `core/theme/app_spacing.dart`.

Components in `core/widgets`: `PageHeader`, `Panel`, `SoftCard`, `KpiCard` +
`KpiGrid`, `StatusBadge` / `StatusDot`, `Segmented`, `SectionHeader`,
`TaskCard`, `RoomCard`, `ReservationCard`, `WorkOrderCard`, `ApprovalCard`,
`AlertCard`, `DataRow2`, `EmptyState`, `ErrorState`, `Shimmer` +
`ListSkeleton` / `KpiSkeleton`, `OtpField`, `AppShell`, `OfflineIndicator`,
`ComingSoonScreen`.

Status is **never conveyed by colour alone** — every `StatusBadge` carries an
icon and a text label as well as its tone. Light, dark and system themes are all
supported (`ThemeController`, persisted locally).

---

## Offline — what is real and what is not

**Real:**
* `SyncQueue` — a durable, disk-backed queue of `PendingOperation`s with exactly
  the specified envelope: `operationId`, `entityId`, `operationType`,
  `createdAt`, `userId`, `deviceId`, `syncStatus` (+ `payload`, `attempts`,
  `lastError`).
* Cached server data (`cache.*`) and pending mutations (`pending.mutations`) are
  separate namespaces in `LocalStore`. Signing out clears the cache and
  **keeps** the queue.
* The connectivity indicator and its pending-count badge in the app bar, plus a
  detail sheet listing what is waiting.
* Attendant task transitions, gate/visitor/lost-found records and incident
  reports all fall back to the queue on a network failure, and the UI says
  "Saved on this device" rather than claiming success.

**Not real yet — stated plainly in the app itself:** no module has registered a
`SyncHandler`, so `SyncQueue.drain()` finds no handler for any operation type
and leaves everything queued. Nothing is lost and nothing is falsely reported as
synced; the pending-sync sheet tells the user automatic sending is not switched
on. Making a module sync for real is one `registerHandler` call.

---

## What is built

| role(s) | module | state |
| --- | --- | --- |
| `GENERAL_MANAGER`, `ASSISTANT_GENERAL_MANAGER` | Management dashboard, Approval centre, **Team directory + Add staff** | built |
| `RECEPTIONIST` | Front desk, Bookings list + detail, 8-step digital check-in | built |
| `ROOM_ATTENDANT`, `CLEANING_STAFF` | My Tasks + task detail (photo & note capture) | built |
| `SECURITY_STAFF` | Gate, vehicle log, staff movement, visitors, lost & found, incidents | built |
| everyone | Auth (all states), profile, notifications, access denied | built |

The Team module hits `GET/POST /staff/team`, `POST /team/:id/approve`,
`POST /team/:id/status` and `DELETE /team/:id`. Pending staff are folded into
the approval centre alongside every other approval type, so a GM has one queue.
The add-staff form offers the 21 roles a manager may create — GM and AGM are
excluded, because hotel management is appointed by the Owner and the server
rejects it anyway.

## What is deferred

Each of these routes to `ComingSoonScreen`, which names the role and the module
and says plainly that it is not built. **No fake data anywhere.**

Accounts · Sales CRM · Travel Desk · Housekeeping supervisor board ·
Maintenance board · My Work Orders · Spa dashboard / My Appointments / Spa
bookings · Restaurant dashboard / POS / My Tables / Kitchen Display / Cleaning
tasks · Inventory & Store · Security Manager dashboard · Driver (My Trips) ·
Events & Banquets.

Also deferred: per-module offline sync handlers (above), and push notification
delivery — the notifications centre reads `GET /notifications` and degrades to
an empty state while that endpoint is absent.

---

## Adding a new role module

1. **Route** — add a path constant to `core/routing/routes.dart`.
2. **Feature** — create `lib/features/<name>/{data,application,presentation}/`.
   Repositories should treat a 404 as "not available yet" for reads
   (`ApiException.isMissingEndpoint`) and let writes surface their failure.
3. **Screen** — build it from `core/widgets`; use `PageBody` for the page
   scaffold so gutters and max width stay consistent.
4. **Register** — add a `GoRoute` inside the `ShellRoute` in
   `core/routing/app_router.dart`.
5. **Wire the role** — in `core/permissions/role_config.dart`, replace the
   role's `_simple(...)` placeholder entry with a full `RoleConfig`: set
   `homeRoute`, `built: true`, and list its `bottomNav` / `moreMenu` items with
   the permission keys each needs.
6. **Permissions** — add any new keys to `core/permissions/permission_keys.dart`,
   matching `src/modules/staff-auth/role-permissions.ts` exactly.
7. **Gate the actions** — wrap every button that mutates something in a
   `PermissionGate`.
8. **Test** — `test/role_config_test.dart` already asserts that every role has a
   reachable home and that the security surface stays restricted; extend it.

No routing, navigation or role logic needs to be touched anywhere else.
