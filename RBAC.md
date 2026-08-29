# RBAC

Two independent permission systems, because two independent populations:

| | Admin | Staff |
| --- | --- | --- |
| Who | Tavelo employees | hotel employees |
| Roles | rows in `roles`, editable at runtime | a fixed enum of **24**, code-owned |
| Permissions | rows in `permissions`, granted per role | a static map in TypeScript |
| Source of truth | the database (seeded from `scripts/seed*.js/ts`) | `src/modules/staff-auth/role-permissions.ts` |
| Guard | `PermissionsGuard` | `StaffPermissionsGuard` |
| Decorator | `@RequirePermissions('owner.view')` | `@RequireStaffPermissions('reservation.create')` |

Owners have no permission system at all: an owner sees their own data and
nothing else. That is tenancy, not RBAC — see
[MULTI_TENANCY.md](./MULTI_TENANCY.md).

---

# Admin RBAC

## Model

- **`permissions`** — the catalogue. `{ key, group, description }`, keys are
  `group.action`.
- **`roles`** — named collections. `isSystem = true` roles cannot have their
  permission set edited through the API.
- **`role_permissions`** — role → permission key. A row may hold `"*"`
  (wildcard, only `super_admin`) or `"<group>.*"`.
- **`admin_roles`** — admin → role, many-to-many.

## Guard semantics

`PermissionsGuard`:

1. reads the `@RequirePermissions(...)` metadata;
2. loads the admin's effective permissions (Redis-cached, falling back to an
   in-process cache with a 5-minute TTL);
3. passes if the granted set contains `"*"`, or a `"<group>.*"` covering the
   requirement, or **every** literal key required;
4. otherwise throws `ForbiddenException` naming the missing keys.

The matcher is a pure function — `PermissionsService.matches(required, granted)`
— unit-tested in `permissions.service.spec.ts`.

`PermissionsService.invalidate(adminId)` is called whenever an admin's role
assignments change, their status changes, or a role's permission set is edited
(for every admin holding that role).

## Permission catalogue

Seeded by `groupPerms(...)` in `scripts/seed.ts`:

| Group | Keys |
| --- | --- |
| Owner | `owner.view` `owner.create` `owner.edit` `owner.suspend` `owner.delete` |
| Property | `property.view` `property.edit` `property.suspend` |
| Staff | `staff.read` `staff.manage` |
| Subscription | `subscription.view` `subscription.edit` `subscription.cancel` |
| Plan | `plan.view` `plan.edit` |
| Billing | `billing.view` `billing.refund` `billing.export` |
| Payment | `payment.record` |
| Refund | `refund.view` `refund.create` |
| Invoice | `invoice.view` `invoice.create` `invoice.edit` |
| Support | `support.view` `support.reply` `support.assign` `support.resolve` |
| Impersonation | `impersonation.view` `impersonation.start` `impersonation.stop` |
| Announcement | `announcement.view` `announcement.edit` |
| Notification | `notification.view` `notification.edit` |
| Integration | `integration.view` `integration.sync` |
| Job | `job.view` `job.retry` |
| Analytics | `analytics.view` |
| Search | `search.query` |
| Audit | `audit.view` `audit.export` |
| Admin | `admin.view` `admin.create` `admin.edit` |
| Settings | `settings.locations.manage` `settings.amenities.manage` |

> ⚠️ **The two seeds disagree, and the Settings group is the casualty.**
> `scripts/seed-node.mjs` (run on Railway by `RUN_SEED=true`) declares the
> `Settings` group and grants both keys to `operations_admin`.
> `scripts/seed.ts` (`npm run db:seed`, the documented local path) **does
> not** — it has no `Settings` entry at all. Migration `0008` inserts
> `settings.amenities.manage` and grants it to `operations_admin`, but nothing
> inserts `settings.locations.manage` outside `seed-node.mjs`.
>
> Net effect on a database seeded locally: the four
> `/settings/locations/*` routes and the four `/settings/amenities/*` routes are
> reachable only by `super_admin` (via `"*"`). Reported, not fixed.

## Seeded system roles

All are `isSystem: true`.

| key | name | grants |
| --- | --- | --- |
| `super_admin` | Super Admin | `*` |
| `finance_admin` | Finance Admin | `billing.view/refund/export`, `payment.record`, `refund.view/create`, `invoice.view/create/edit`, `subscription.view/edit`, `owner.view`, `analytics.view`, `search.query`, `notification.view` |
| `support_admin` | Support Admin | `support.view/reply/assign/resolve`, `owner.view`, `property.view`, `staff.read`, `subscription.view`, `impersonation.start/stop/view`, `notification.view`, `search.query` |
| `operations_admin` | Operations Admin | `owner.view`, `subscription.view`, `property.view`, `staff.read`, `staff.manage`, `integration.view/sync`, `job.view/retry`, `analytics.view`, `search.query`, `notification.view` (+ `settings.*` under `seed-node.mjs` only) |
| `platform_admin` | Platform Admin | `owner.view/create/edit`, `property.view/edit`, `staff.read`, `subscription.view/edit`, `plan.view/edit`, `announcement.view/edit`, `notification.view/edit`, `search.query`, `analytics.view` |

Notice what nobody but `super_admin` holds: `owner.delete`, `admin.*`,
`audit.view`, `audit.export`, `subscription.cancel`, `property.suspend`.
Destroying an owner, minting an admin and reading the audit log are all
deliberately unroutable through a delegated role.

The full endpoint → permission map is in [API.md](./API.md).

---

# Staff RBAC

## The 24 roles

`hotelStaffRoleValues` in `src/database/schema/owner.ts`. Every one of them has
an entry in `STAFF_ROLE_PERMISSIONS` — a test asserts none is missing, and
`permissionsForRole` resolves an **unknown role to none, never to all**.

| # | Role | Shape of the grant |
| --- | --- | --- |
| 1 | `GENERAL_MANAGER` | the widest staff surface — 60 keys |
| 2 | `ASSISTANT_GENERAL_MANAGER` | GM minus 8 withheld keys |
| 3 | `HR` | 4 keys: `staff.read` `staff.create` `staff.update` `profile.read` |
| 4 | `ACCOUNTS` | finance, invoices, folios, tax, payments, reports |
| 5 | `RECEPTIONIST` | reservations incl. cancel, check-in/out, guests, `room.status.update`, `keycard.issue`, `payment.collect` |
| 6 | `SALES_MANAGER` | leads, corporates, targets, `rate.read`, may create reservations — **not** cancel |
| 7 | `TRAVEL_DESK` | trips, tours, transport, may read reservations — not create |
| 8 | `HOUSEKEEPING_SUPERVISOR` | housekeeping + task assignment, `room.status.update`, laundry, lost & found |
| 9 | `ROOM_ATTENDANT` | tasks, `maintenance.report`, `room.read`, `room.status.update` |
| 10 | `CLEANING_STAFF` | tasks, `maintenance.report`, `area.read` |
| 11 | `TECHNICIAN` | maintenance lifecycle, tasks, `asset.read`, `inventory.request` |
| 12 | `SPA_MANAGER` | spa bookings/services/roster, `spa.revenue.read`, task assignment |
| 13 | `SPA_ACCOUNTS` | spa invoices + revenue, `finance.read`, `payment.collect` |
| 14 | `SPA_STAFF` | spa bookings read, own tasks |
| 15 | `RESTAURANT_MANAGER` | menu, tables, orders incl. `order.void`, POS, `restaurant.revenue.read` |
| 16 | `CASHIER` | POS, bills, `payment.collect`, `shift.close` |
| 17 | `WAITER` | tables, orders, `kot.create`, menu read |
| 18 | `CHEF` | KOT lifecycle, `menu.update`, kitchen stock |
| 19 | `CLEANER` | tasks, `maintenance.report`, `area.read`, `table.read` |
| 20 | `INVENTORY_STORE_MANAGER` | inventory lifecycle, stock, GRN, purchase requests |
| 21 | `SECURITY_MANAGER` | gate, visitors, incidents, patrols, `cctv.read` |
| 22 | `SECURITY_STAFF` | gate, vehicle in/out, visitor record, `incident.create` |
| 23 | `DRIVER` | trips, vehicle logs, own tasks |
| 24 | `EVENT_MANAGER` | events, banquets, leads read, task assignment |

## The exclusions are the design

From the file's own header, applied throughout:

- **Security, housekeeping, kitchen, cleaning, attendant, driving *and HR*
  roles hold no `finance.*`, `revenue.*`, `payroll.*`, `payment.*`,
  `procurement.*` or `owner.*` permission.** They see operational work, not the
  money or the hotel's ownership.
- **Only management and the finance-facing roles see revenue.**
- **Only the GM sees payroll and the owner record.**

The AGM is the GM minus a specific eight — `AGM_WITHHELD`:

```
finance.export  reports.export  payroll.read  owner.read
staff.delete    payment.refund  procurement.approve  audit.read
```

No exports, no payroll, no owner record, and no irreversible team or spend
action.

### Two distinctions worth internalising

**`room.status.update` vs `room.update`.** Reception flips a room to OCCUPIED on
check-in and DIRTY on check-out; an attendant marks it CLEANING then INSPECTED.
That is `room.status.update` — a narrow endpoint. `room.update` (renumber,
re-rate, re-type) belongs to GM and AGM only. A room attendant cannot renumber a
floor.

**`reservation.cancel` is separate from `reservation.update`.** Cancelling is the
one front-office act that destroys revenue. Reception has it — a guest ringing
to cancel cannot be told to wait for the GM. Sales and the travel desk, who can
*raise* bookings, deliberately cannot.

## Who may create whom

`src/modules/staff-auth/role-creation.ts`. Hotel management is appointed by the
**owner**; no staff member, however senior, may mint a peer or a superior from
inside the property.

| Actor | May create | Count |
| --- | --- | --- |
| `GENERAL_MANAGER` | every role except GM and AGM (HR included) | 22 |
| `ASSISTANT_GENERAL_MANAGER` | every role except GM and AGM (HR included) | 22 |
| `HR` | every role except GM, AGM and HR itself | 21 |
| everyone else | nothing — they hold no `staff.create` | 0 |

`creatableRolesFor(actorRole)` returns `[]` for anyone without `staff.create`,
so the helper — not the caller — is the single place that knows the answer. The
route's permission guard already refuses them; this is the second lock on the
same door.

Refusal codes, both 403:

| Code | Meaning |
| --- | --- |
| `ROLE_NOT_ASSIGNABLE` | nobody inside the hotel may create that role (GM/AGM) |
| `ROLE_NOT_PERMITTED` | somebody may, but not this actor (HR reaching for HR) |

GM and AGM are creatable **only by the owner**, through
`POST /api/v1/owner/properties/:id/staff`, whose DTO validates against the
narrower `ownerCreatableStaffRoleValues = ['GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER']`.
Widening `hotelStaffRoleValues` therefore cannot accidentally widen what an
owner can create.

## Account statuses and the approval flow

`hotelStaffStatusValues` — seven:

| Status | Can sign in | Meaning |
| --- | --- | --- |
| `INVITED` | no | row created, never onboarded |
| `PENDING_APPROVAL` | no | raised, waiting on a GM/AGM |
| `APPROVED` | no | approved but not yet activated |
| `ACTIVE` | **yes** | the only status that authenticates |
| `BLOCKED` | no | |
| `SUSPENDED` | no | |
| `DEACTIVATED` | no | |

**HR can hire but cannot put anyone into service.** This is enforced at both
doors:

- HR holds no `staff.approve`, so every account it raises is written
  `PENDING_APPROVAL`. The `activate: true` shortcut on `POST /staff/team` is
  honoured only for a creator holding `staff.approve` — inert for HR.
- `POST /staff/team/:id/status` closes the matching back door: moving anybody
  **to `ACTIVE`** requires `staff.approve`, not merely `staff.update`
  (`ACTIVATION_NOT_PERMITTED` otherwise). Putting someone into service *is* the
  approval decision, whichever endpoint reaches it. So HR can block, suspend and
  deactivate, but never activate or reactivate.

Nobody may approve, re-status or delete **their own** row. Role is not editable
through this surface at all — the only place a role is chosen is at creation.

## Permission gating at the button level

`GET /api/v1/staff/auth/me` returns `{ user, hotel, organization, role, permissions }`.
The mobile app renders its navigation and enables/disables individual controls
from that `permissions` array, so a user is never shown a button that will 403.

The app is **not the authority**. `StaffPermissionsGuard` re-checks the resolved
list server-side on every protected route, and the role is read from the
`hotel_staff` row on every request — never from the token. Demote someone and
their next call is refused, without waiting for a token to expire.
`staff_app/lib/core/permissions/role_config.dart` mirrors the creatable-role
matrix for the same reason: so the UI never offers a role the API will reject.

## Related

- [API.md](./API.md) — every endpoint with its required permission
- [MULTI_TENANCY.md](./MULTI_TENANCY.md) — the scoping that runs underneath all of this
- [AUTH.md](./AUTH.md) — how each surface authenticates
