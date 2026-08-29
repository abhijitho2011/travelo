# Multi-tenancy

One database, one schema, no row-level security. Isolation is enforced in the
application, at a small number of places, with one consistent rule.

## The chain

```
Tavelo (admin)
  └── Owner                        owners.id
        └── Property               properties.owner_id
              ├── Staff            hotel_staff.property_id  (+ owner_id denormalised)
              ├── Room types       room_types.property_id
              ├── Rooms            rooms.property_id
              └── Reservations     reservations.property_id
        └── Subscription           subscriptions.owner_id
              └── Invoices/payments
```

Each surface enters the chain at a different depth, and that depth *is* its
scope:

| Caller | Scoped to | Comes from | Can see |
| --- | --- | --- | --- |
| Admin | nothing — platform-wide | admin RBAC decides, not tenancy | everything their permissions allow |
| Owner | their own `owners.id` | `OwnerJwtGuard` → token `sub` | their properties, staff, subscription, invoices, tickets |
| Staff | their own `hotel_staff.property_id` | `StaffJwtGuard` → the **row**, not the token | that one property's rooms, reservations, team |
| Support (impersonating) | the target owner's id | the `impersonation_sessions` row, re-read per request | what that owner can see, **read-only** |

Two details in that table matter more than they look:

- **The scope is read from the database, not from the token.** `StaffJwtGuard`
  re-reads `hotel_staff` on every request, so the role *and* the property come
  from the live row. Moving someone between properties, or demoting them, takes
  effect on their next call.
- **Owners have no permission model.** There is nothing to grant an owner —
  they see their own subtree, entirely, and nothing else. All owner-side
  enforcement is scoping.

## The rule: 404, never 403

Cross-tenant access returns **404 Not Found**, not 403 Forbidden. From
`reservations.service.ts`:

> TENANT ISOLATION. A reservation, a room and a room type are only ever
> resolved by (id, propertyId = the caller's own). Cross-property reads 404,
> indistinguishable from a miss — never 403.

And from `owner-errors.ts`, on `STAFF_NOT_FOUND`:

> 404 rather than 403 for a staff row the owner does not hold: a 403 would
> confirm the row exists at some other property.

**Why.** A 403 is an answer. It says *this id is real, it just isn't yours* —
which turns any id-shaped endpoint into an oracle: enumerate uuids, keep the
403s, and you have learned the size and shape of a competitor's operation
without ever reading a row. A 404 says nothing. A row you may not see and a row
that does not exist are the same event, and the only way to keep them the same
event is to answer identically.

The cost is a slightly worse debugging experience — "not found" when you meant
"not yours". That is the right trade, and the `request_id` in the envelope plus
the audit log recover the difference internally.

## How it is enforced

Not by a global interceptor. By **resolving every row through a scoped lookup**,
so an unscoped query is a visible mistake in review rather than an invisible
one at runtime.

### Owner scope

`OwnerPortalService.assertOwnedProperty(ownerId, propertyId)` is called at the
top of every property-addressed method:

```ts
where(and(eq(properties.id, propertyId), eq(properties.ownerId, ownerId), isNull(properties.deletedAt)))
```

Miss ⇒ `PROPERTY_NOT_FOUND` (404). List endpoints filter by `owner_id` directly
rather than asserting afterwards.

### Property scope

`ReservationsService` resolves each entity through a private `require*` helper
that carries the property id into the `WHERE`:

```ts
private async requireRoom(propertyId: string, id: string) {
  const [row] = await this.db.select().from(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt)))
    .limit(1);
  if (!row) throw ReservationErrors.roomNotFound();
  return row;
}
```

`ReservationsService.conditions()` seeds every list query with
`[eq(reservations.propertyId, propertyId), isNull(reservations.deletedAt)]`
before any user filter is appended, so a filter can narrow the scope but never
widen it.

The same shape applies on `/staff/team`: every route resolves its target by
`(id, propertyId = the caller's own, deleted_at IS NULL)`.

### Soft deletes are part of the boundary

`deleted_at IS NULL` sits in the same predicate as the tenant key, deliberately.
A soft-deleted row is out of scope in exactly the same way a foreign row is —
same query, same 404, no second code path to forget. Admin search does the same
thing: soft-deleted owners must not surface anywhere in the admin panel.

## Uniqueness is scoped too

Constraints that would be global in a single-tenant system are per-tenant here.
`hotel_staff` has a **partial unique index on `(property_id, email)`**, so the
same person can hold accounts at two hotels, but not two at one hotel. The
violation is surfaced as a typed `STAFF_EMAIL_TAKEN` (409) rather than a raw
constraint error.

## Where tenancy meets concurrency

Scoping answers *may you see this row*. It does not answer *may two of you write
it at once*. Reservations need both: `assertRoomFree` runs the overlap check
**inside** the transaction that performs the write, over rows locked with
`SELECT … FOR UPDATE`.

```
existing.check_in < checkOut AND checkIn < existing.check_out
```

Both inequalities strict, over `CONFIRMED` and `CHECKED_IN`, so same-day
turnover is legal — a stay ending on the 15th does not collide with one starting
on the 15th. Checking before the transaction would be a time-of-check /
time-of-use bug that shows up exactly on the busy evening it must not.

## What is deliberately *not* tenant-scoped

| Thing | Why |
| --- | --- |
| Amenity catalogue | platform-wide, curated by admins (`settings.amenities.manage`); properties select from it |
| States and districts | platform-wide reference data (`settings.locations.manage`) |
| Plans and plan features | the product catalogue |
| Notification templates | platform-wide, rendered per recipient |
| Announcements | platform-wide, targeted at publish time |

## Testing the boundary

The isolation guarantees have their own suites rather than being assumed:
`owner-token-isolation.spec.ts` (a token from one family is refused by the
others), `owner-route-mounting.spec.ts` (the owner surface really is excluded
from the admin prefix), and the staff-team and reservations specs, which assert
the 404 on a foreign id explicitly.

If you add a table that hangs off a property or an owner, the checklist is:
carry the tenant key in the `WHERE` of **every** lookup, throw a 404 on a miss,
add `deleted_at IS NULL` to the same predicate, scope any unique constraint to
the tenant, and write the foreign-id test.

## Related

- [AUTH.md](./AUTH.md) — how each surface proves who it is
- [RBAC.md](./RBAC.md) — what a caller may do *within* their scope
- [IMPERSONATION.md](./IMPERSONATION.md) — the one sanctioned way to cross the boundary
