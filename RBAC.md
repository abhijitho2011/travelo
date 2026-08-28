# RBAC — Phase 1

## Model
- **`permissions`** — the catalog. Each row is `{ key, group, description }`. Keys are `group.action` (e.g. `admin.create`, `billing.refund`). See `scripts/seed.ts` for the seeded catalog.
- **`roles`** — named collections. System roles (`isSystem = true`) cannot have their permission set edited via the API.
- **`role_permissions`** — many-to-many role → permission keys. A role may grant `"*"` (wildcard, only used by `super_admin`) or `"<group>.*"` (group wildcard).
- **`admin_roles`** — many-to-many admin → role.

## Guard semantics
Decorate controllers with `@RequirePermissions('foo.bar', 'baz.qux')`. The `PermissionsGuard`:
1. Reads `PERMISSIONS_KEY` metadata.
2. Loads the admin's effective permissions (Redis-cached; falls back to in-process memory for 5 min TTL).
3. Passes if the granted set contains `"*"`, or `"<group>.*"` covering the requirement, or every literal key.
4. Otherwise throws `ForbiddenException` with the missing keys.

Static matcher: `PermissionsService.matches(required, granted)` — unit-tested in `permissions.service.spec.ts`.

## Cache invalidation
`PermissionsService.invalidate(adminId)` is called whenever an admin's role assignments change, an admin's status changes, or a role's permission set is updated (for every admin holding that role).

## Seeded roles
| key | permissions |
| --- | --- |
| `super_admin` | `*` |
| `platform_admin` | `owner.*` (view/create/edit), `subscription.view/edit`, `property.view/edit` |
| `finance_admin` | `billing.*`, `subscription.view`, `owner.view` |
| `support_admin` | `support.*`, `owner.view`, `impersonation.start` |
| `operations_admin` | read-only `owner`, `subscription`, `property` |

## Endpoint permission map (Phase 1)
| method | path | permission |
| --- | --- | --- |
| GET | `/admin-users` | `admin.view` |
| POST | `/admin-users` | `admin.create` |
| PATCH | `/admin-users/:id` | `admin.edit` |
| PATCH | `/admin-users/:id/status` | `admin.edit` |
| GET/DELETE | `/admin-users/:id/sessions[/...]` | `admin.view` / `admin.edit` |
| GET | `/roles` | `admin.view` |
| POST | `/roles` | `admin.create` |
| PATCH | `/roles/:id` | `admin.edit` |
| GET | `/permissions` | `admin.view` |
| GET | `/audit-logs` | `audit.view` |
