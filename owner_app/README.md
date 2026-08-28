# Travelo — Owner App (Flutter)

Cross-platform (iOS / Android / Web) portal for **hotel owners**. Owner accounts
are created by the Super Admin; only an existing owner account can sign in.
Login is passwordless (**mobile number + OTP**). Built with Flutter so the same
codebase ships as the future mobile app.

## What's here (v0.1)

- **Premium auth system** — reusable `AuthShell` (split-screen desktop, centered
  mobile), login (mobile + OTP + Google placeholder), invitation activation,
  secure/blocked/suspended/network error states.
- **Portfolio dashboard** — welcome, portfolio stats (hotels / rooms / revenue /
  occupancy), per-hotel cards with listing-completeness, first-time-owner empty
  state, subscription warning/expired banners (never blocks login).
- **Properties** — list + add property with **photos** (`image_picker`) and full
  **address** incl. admin-managed **State → District** dropdowns.
- **Managers** — create/list/**block**/**delete** **General Manager** and
  **Assistant General Manager** (first/last name, address, PIN, state, district,
  mobile, email).
- Property limit is enforced server-side; the UI surfaces
  `PROPERTY_LIMIT_REACHED` clearly.

## Architecture

```
lib/
  core/
    config/        AppConfig — API base URL via --dart-define (no localhost)
    api/           Dio client, envelope unwrap, 401 refresh, secure token store
    auth/          AuthController (OTP), AuthState
    models/        tolerant domain models
    data/          OwnerRepository, locations (admin-managed + bundled fallback)
    providers.dart Riverpod wiring
  theme/           design system (colors, radius, Inter type)
  widgets/         AuthShell, shared UI
  features/        auth / dashboard / properties / staff
  router.dart      go_router + auth guard + splash
```

State: **Riverpod**. Routing: **go_router**. Networking: **Dio**.

## Run

The API base URL is injected — there is **no localhost fallback**. It defaults to
the deployed Railway backend.

```bash
flutter pub get

# Web
flutter run -d chrome \
  --dart-define=API_BASE_URL=https://travelo-admin-api-production.up.railway.app/api/v1

# Android / iOS device
flutter run \
  --dart-define=API_BASE_URL=https://travelo-admin-api-production.up.railway.app/api/v1
```

## Backend endpoints consumed (owner scope, `/api/v1/owner/*`)

| Area          | Endpoint |
|---------------|----------|
| Request OTP   | `POST /auth/otp/request` |
| Verify OTP    | `POST /auth/otp/verify` |
| Session       | `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout` |
| Portfolio     | `GET /portfolio/summary` |
| Properties    | `GET/POST /properties` |
| Managers      | `GET/POST /properties/:id/staff`, `POST .../staff/:sid/status`, `DELETE .../staff/:sid` |
| Locations     | `GET /reference/locations` (admin-managed states/districts) |

These land as the backend **owner module** is built (see repo root backend).
Until then the app runs and degrades gracefully (bundled location data, clear
error states).
