# Tavelo — Owner App (Flutter)

Cross-platform (iOS / Android / Web) portal for **hotel owners**. Owner accounts
are created by the Super Admin; only an existing owner account can sign in.
Sign-in is passwordless — **mobile + OTP**, or **Google**.

Package `tavelo_owner`, Dart SDK `^3.9.0`. State: **Riverpod**. Routing:
**go_router**. Networking: **Dio**.

## What's here

- **Auth** — `AuthScaffold` (split-screen desktop, centred mobile), mobile+OTP,
  Google sign-in via Firebase, and typed states for
  blocked / suspended / network failure.
- **Portfolio dashboard** — hotels, rooms, revenue, occupancy; per-hotel cards
  with listing completeness; first-time-owner empty state; subscription
  warning / expired banners that never block sign-in.
- **Properties** — list, create (against the server-enforced property limit),
  photos, amenities, room types and rooms (read-only), and full address with
  admin-managed **State → District** dropdowns.
- **Team** — create / list / block / delete **General Manager** and **Assistant
  General Manager**. Those are the only two roles an owner may create; the rest
  of the property's staff are created by the GM in the staff app.
- **Subscription** — current plan, period, and invoice history.
- **Support** — raise a ticket, read the thread, reply.
- **Account** — profile, and a security screen listing live sessions with
  revoke-one / revoke-all.
- **Impersonation banner** — a permanent, unmissable bar whenever Tavelo
  Support is viewing the account, with every write control disabled. The API
  refuses those writes regardless; the banner makes it visible rather than a
  surprise at submit time. See [IMPERSONATION.md](../IMPERSONATION.md).

## Design system

Shared with `staff_app`: **Sora** for display, **Manrope** for body. Light and
dark themes, a `NavigationRail` shell on tablet and desktop widths, tokens in
`lib/core/theme/` (`app_colors`, `app_spacing`, `app_typography`, `app_theme`,
`theme_controller`).

## Structure

```
lib/
  core/
    api/           Dio client, envelope unwrap, 401 refresh, secure token store
    auth/          AuthController, AuthState (incl. impersonation context)
    config/        AppConfig — API base URL via --dart-define (no localhost fallback)
    data/          OwnerRepository, locations (admin-managed + bundled fallback)
    models/        tolerant domain models
    storage/       local prefs, theme mode
    theme/         the design system
    utils/
    widgets/       AppShell, AuthScaffold, cards, ImpersonationBanner, states…
    providers.dart Riverpod wiring
  features/        auth · dashboard · properties · staff · subscription · support · account
  firebase_options.dart
  router.dart      go_router + auth guard + splash
  main.dart
```

## Run

The API base URL is injected — there is **no localhost fallback**.

```bash
flutter pub get
flutter analyze                # must be clean

flutter run -d chrome \
  --dart-define=API_BASE_URL=https://<your-api-host>/api/v1

flutter run \
  --dart-define=API_BASE_URL=https://<your-api-host>/api/v1
```

Google sign-in additionally needs the Firebase web config passed as
`--dart-define`s (`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`,
`FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`,
`FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_MEASUREMENT_ID`) —
`Dockerfile.portal` at the repo root shows the full set. The production domain
must be listed under Firebase → Authentication → Authorized domains or Google
sign-in fails silently in the web build.

## Backend endpoints consumed

All under `/api/v1/owner/*`, all live. The full reference is in
[API.md](../API.md#owner-surface--apiv1owner).

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/google`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` |
| Account | `GET/PATCH /profile`, `GET /sessions`, `POST /sessions/revoke-all`, `DELETE /sessions/:id` |
| Portfolio | `GET /portfolio/summary` |
| Properties | `GET/POST /properties`, `GET/PUT /properties/:id/amenities`, `GET /properties/:id/room-types`, `GET /properties/:id/rooms` |
| Photos | `GET/POST /properties/:id/photos`, `GET /properties/:id/photos/:photoId/raw`, `DELETE /properties/:id/photos/:photoId` |
| Team | `GET /staff`, `GET/POST /properties/:id/staff`, `PATCH /properties/:id/staff/:sid`, `POST .../status`, `DELETE .../:sid` |
| Subscription | `GET /subscription`, `GET /subscription/invoices` |
| Support | `GET/POST /support/tickets`, `GET /support/tickets/:id`, `POST /support/tickets/:id/messages` |
| Locations | `GET /reference/locations` |

Errors arrive as typed codes the UI branches on — `PROPERTY_LIMIT_REACHED`,
`ACCOUNT_SUSPENDED`, `ACCOUNT_BLOCKED`, `STAFF_EMAIL_TAKEN`, `OTP_THROTTLED`.

## Release builds

⚠️ `android/app/build.gradle.kts` still signs release with the **debug**
keystore. A release keystore is required before publishing — see the
[production checklist](../DEPLOYMENT.md#before-you-call-it-production).

## Deploy

`Dockerfile` + `railway.json` build the web bundle for Railway. The repo-root
`Dockerfile.portal` serves this app and `staff_app` together from one service
(`/owner/`, `/staff/`, and a chooser at `/`).
