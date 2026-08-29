# Subscriptions

An owner pays for a **plan**. The plan sets how long a billing period is and how
many properties the owner may run. A **subscription** is that owner's live
relationship with a plan: a status and a current period.

Modules: `src/modules/plans`, `src/modules/subscriptions`,
`src/modules/entitlements`. Money is in [BILLING.md](./BILLING.md).

## Plans

`subscription_plans`:

| Column | Type | Notes |
| --- | --- | --- |
| `name` | varchar(128) **unique** | |
| `monthly_price` | integer, **paise** | the single source of truth for price |
| `annual_price` | integer, paise | **legacy — not used for period maths** |
| `duration_months` | integer, default `1` | the billing period length |
| `currency` | varchar(8), default `INR` | |
| `property_limit` | integer, default `1` | |
| `status` | `ACTIVE` \| `ARCHIVED` | |

> **The total charged for one period is `monthly_price × duration_months`.**
> `annual_price` survives from an earlier model and is read in exactly one
> place — `DailyMetricsAggregator`, for the MRR of an `ANNUAL`-cycle
> subscription. Do not reach for it anywhere else.

`plan_features` is a join of `(plan_id, feature_key)` against the `features`
catalogue (`key`, `name`, `description`). Features are what the plan *unlocks*;
`property_limit` is what it *caps*.

`duration_months` is validated at renewal time, not only at write time:
`computeRenewal` refuses anything that is not an integer in **1…120**.

### Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/plans` | `plan.view` |
| GET | `/plans/features` | `plan.view` |
| GET | `/plans/:id` | `plan.view` |
| POST | `/plans` | `plan.edit` |
| PATCH | `/plans/:id` | `plan.edit` |
| PUT | `/plans/:id/features` | `plan.edit` |
| DELETE | `/plans/:id` | `plan.edit` |

## Subscriptions

`subscriptions`, one row per owner relationship:

| Column | Notes |
| --- | --- |
| `owner_id` | → `owners`, `ON DELETE CASCADE` |
| `plan_id` | → `subscription_plans`, `ON DELETE RESTRICT` — a plan in use cannot be deleted out from under a subscriber |
| `status` | see below; default `TRIAL` |
| `billing_cycle` | `MONTHLY` \| `ANNUAL`, default `MONTHLY` |
| `starts_at` | |
| `current_period_start` / `current_period_end` | the live period |
| `cancel_at` | scheduled cancellation |
| `property_limit_override` | per-owner override of the plan's cap |
| `price_override` | per-owner price, in paise |
| `auto_renew` | default true |

Indexed on `owner_id`, `status` and `current_period_end` — the last one because
the lifecycle worker sweeps by expiry date every run.

### Statuses

`subscriptionStatusValues`, seven:

| Status | Meaning |
| --- | --- |
| `TRIAL` | initial default |
| `ACTIVE` | paid and inside its period |
| `EXPIRING` | inside its period, but ≤ 7 days from the end |
| `EXPIRED` | past `current_period_end` |
| `GRACE_PERIOD` | expired less than 7 days ago |
| `SUSPENDED` | expired 14+ days ago |
| `CANCELLED` | terminated deliberately |

### Lifecycle worker

`SubscriptionLifecycleWorker.run(now)` in
`src/modules/workers/workers.module.ts`. Four set-based `UPDATE`s, in order:

| From | To | When |
| --- | --- | --- |
| `ACTIVE` | `EXPIRING` | `current_period_end` within the next 7 days (and still future) |
| `ACTIVE`, `EXPIRING` | `EXPIRED` | `current_period_end <= now` |
| `EXPIRED` | `GRACE_PERIOD` | `current_period_end > now - 7 days` |
| `GRACE_PERIOD` | `SUSPENDED` | `current_period_end <= now - 14 days` |

So an unpaid subscription reads: warned from day −7, expired on day 0, in grace
until day +7, suspended from day +14. (Between day +7 and +14 it stays
`GRACE_PERIOD` — the `EXPIRED → GRACE_PERIOD` rule no longer matches, and the
`SUSPENDED` rule does not yet.)

`CANCELLED` and `TRIAL` are never touched by the worker.

**Notifications are strictly downstream of the state machine.** `announce()`
runs only after every `UPDATE` has landed, and re-derives its audience from
**current state** rather than from the update results — so a run that crashed
halfway through last night catches up tonight. `notifyOnceQuietly` is what stops
that catching-up from becoming a daily repeat. The whole block is wrapped:

> A notification problem must never make the lifecycle run look failed.

Warnings fire at `EXPIRY_WARNING_DAYS = [30, 7, 3]` days out, keyed
`subscription.expiring` with `relatedType = subscription.expiring.<days>`.
Transitions emit `subscription.expired`, `subscription.grace_started`,
`subscription.suspended`. Each goes to the owner over `EMAIL` and `IN_APP`.

> ⚠️ **Nothing schedules this worker.** See
> [ARCHITECTURE.md](./ARCHITECTURE.md#workers) — there is no cron, no BullMQ
> processor and no interval in the application. Without an external trigger,
> subscriptions never leave `ACTIVE` and no expiry warning is ever sent.

### Renewal maths

`BillingService.computeRenewal(now, currentPeriodEnd, durationMonths)`:

```ts
const periodStart = new Date(Math.max(now.getTime(), currentPeriodEnd.getTime()));
return { periodStart, periodEnd: addMonths(periodStart, durationMonths) };
```

**`max(now, currentPeriodEnd)`** is the whole point. Paying early does not throw
away the time you have already bought — the new period starts where the old one
ended. Paying late starts from today, so a lapsed owner does not pay for the
gap. `addMonths` (`src/common/date/add-months.ts`) handles the month-end cases.

Settlement also forces `status: 'ACTIVE'`, so paying is what resurrects an
`EXPIRED`, `GRACE_PERIOD` or `SUSPENDED` subscription.

### Manual extensions

`POST /subscriptions/:id/extend` (`subscription.edit`) pushes the expiry out by
a number of **days** with a reason, and writes a `subscription_extensions` row
holding `previous_expiry`, `new_expiry`, the actor and an
**`idempotency_key`** — uniquely indexed on `(subscription_id, idempotency_key)`
so a retried goodwill extension cannot double-apply.

### Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/subscriptions` | `subscription.view` |
| POST | `/subscriptions` | `subscription.edit` |
| GET | `/subscriptions/:id` | `subscription.view` |
| PATCH | `/subscriptions/:id` | `subscription.edit` |
| POST | `/subscriptions/:id/extend` | `subscription.edit` |
| POST | `/subscriptions/:id/suspend` | `subscription.edit` |
| POST | `/subscriptions/:id/reactivate` | `subscription.edit` |
| POST | `/subscriptions/:id/cancel` | `subscription.cancel` |
| GET | `/subscriptions/:id/events` | `subscription.view` |

Owner-side, read-only: `GET /api/v1/owner/subscription` and
`GET /api/v1/owner/subscription/invoices`.

`subscription_events` is the per-subscription history — `renewal` rows are
written inside the settlement transaction, carrying the payment id, invoice
number, previous period end and new period bounds.

## Property limits

The cap an owner is actually under is
**`subscription.property_limit_override ?? plan.property_limit`**
(`OwnerPortalService.effectivePropertyLimit` — note that an override of `0` is
honoured, because the check is `!== null && !== undefined`, not truthiness).

The subscription consulted is the owner's **most recently created** one, and it
only counts if its status is usable:

```ts
const USABLE_SUB_STATUSES = ['TRIAL', 'ACTIVE', 'EXPIRING', 'GRACE_PERIOD'];
```

Anything else — `EXPIRED`, `SUSPENDED`, `CANCELLED`, or no subscription at all —
yields a limit of **0**. So an owner whose subscription has lapsed keeps their
existing properties and can keep working, but cannot add another until they pay.

Enforced in `OwnerPortalService.createProperty`: count the owner's live
(`deleted_at IS NULL`) properties, compare, and refuse with
`PROPERTY_LIMIT_REACHED` (403). It is checked on **creation only** — lowering a
plan's limit does not retroactively disable properties an owner already has.
Soft-deleting a property frees a slot.

## Entitlements

Feature access is resolved per owner, not read straight off the plan:

```
entitlement(feature) = plan_features(plan)  overridden by  owner_feature_overrides
```

`owner_feature_overrides` is `(owner_id, feature_key)` unique, with a `granted`
boolean, a `reason` and `created_by`. `EntitlementsService.resolve` starts from
the plan's feature keys and then, per override, **adds when `granted` is true
and deletes when it is false** — so an override can revoke a feature the plan
includes, not only add one. The response carries `planFeatures`, the raw
`overrides`, the resolved `effective` list and the subscription, so the console
can show *why* an owner has a feature, not just that they do.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/owners/:ownerId/entitlements` | `owner.view` |
| POST | `/owners/:ownerId/entitlements/overrides` | `owner.edit` |
| DELETE | `/owners/:ownerId/entitlements/overrides/:id` | `owner.edit` |

Both writes are audited (`entitlement.override.set` / `.removed`) — a
per-customer exception to the price list is exactly the kind of thing someone
asks about six months later.

## Related

- [BILLING.md](./BILLING.md) — how a payment becomes a renewed period
- [ANALYTICS.md](./ANALYTICS.md) — how MRR is derived from these rows
- [DATABASE.md](./DATABASE.md#subscriptions--billing) — the tables in full
