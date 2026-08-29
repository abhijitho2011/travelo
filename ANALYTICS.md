# Analytics

Three separate surfaces compute numbers, for three different audiences:

| Surface | Module | Audience |
| --- | --- | --- |
| Platform analytics | `src/modules/analytics` | Tavelo admins — MRR, ARR, owner and subscription health |
| Property dashboards | `src/modules/reservations/desk.service.ts` | hotel staff — occupancy, arrivals, month revenue |
| Owner portfolio | `src/modules/owner-auth/owner-portal.service.ts` | owners — the same figures across their hotels |

**Read the approximations section before quoting any of these numbers in a
financial context.** Several are deliberately imprecise, and the code says so.

## Platform analytics

`GET /api/v1/admin/analytics/*` and `GET /api/v1/admin/dashboard`, all
`analytics.view`.

| Endpoint | Returns |
| --- | --- |
| `/analytics/overview` | `ownersTotal`, `ownersActive`, `propertiesTotal`, `rooms`, `subsActive`, `expiringSoon`, `mrr`, `arr`, `arpu` |
| `/analytics/revenue` | the `daily_platform_metrics` series (`from`/`to`, default last **180 days**) |
| `/analytics/subscriptions` | counts grouped by subscription status |
| `/analytics/owners` | counts grouped by owner status |
| `/dashboard` | all four in one call, resolved in parallel |

### Definitions, as computed

| Metric | Definition |
| --- | --- |
| `ownersActive` | `count(*) filter (where status='ACTIVE')` |
| `subsActive` | subscriptions in `ACTIVE` **or** `TRIAL` |
| `expiringSoon` | status in `EXPIRING`/`GRACE_PERIOD`, **or** `ACTIVE` with `current_period_end < now() + 7 days` |
| `mrr` | per **`ACTIVE`** subscription: `ANNUAL` cycle ⇒ `round((price_override ?? plan.annual_price) / 12)`, otherwise `price_override ?? plan.monthly_price`. Summed. |
| `arr` | `mrr × 12` |
| `arpu` | `round(mrr / activeSubscriptionCount)` |

All money is **paise**.

### Daily metrics

`DailyMetricsAggregator.run(day)` writes one `daily_platform_metrics` row per
day — `mrr`, `arr`, `arpu`, `active_subscriptions`, `active_owners` — upserted
on `day`, so re-running a day corrects it rather than duplicating it. That table
is the only history; `/analytics/revenue` reads it and computes nothing.

> ⚠️ Nothing schedules the aggregator (see
> [ARCHITECTURE.md](./ARCHITECTURE.md#workers)). Until something calls it,
> `daily_platform_metrics` stays empty and the revenue chart is blank — while
> `/analytics/overview` still returns live figures, because it computes them on
> the fly. A blank chart next to a populated tile is that gap, not a bug in the
> chart.

## Property and portfolio metrics

### Occupancy

```
occupancy % = OCCUPIED / (every live room that is not OUT_OF_ORDER)
```

rounded to one decimal.

`OUT_OF_ORDER` rooms leave the **denominator** because they cannot be sold — a
hotel with a flooded wing is not failing to fill it. `MAINTENANCE` **stays in**:
it is a same-day state, not a withdrawal from inventory. Getting this backwards
would either flatter a hotel that has taken rooms off the board or punish one
doing routine upkeep.

### Month revenue

Paise for a calendar month: the sum of `total_paise` over every `CHECKED_IN` or
`CHECKED_OUT` reservation whose stay **touches** the month, using the same
strict-inequality overlap the booking rules use.

`PENDING`, `CANCELLED` and `NO_SHOW` are excluded — no money is owed on them.

## The approximations, stated plainly

### 1. A stay is counted whole in every month it touches

This is the big one, and the code flags it in two places. From
`desk.service.ts`:

> APPROXIMATION, deliberately and documented: it sums the FULL `total_paise` of
> every CHECKED_OUT or CHECKED_IN reservation whose stay TOUCHES the month,
> rather than apportioning each stay night-by-night. A booking straddling month
> end therefore lands entirely in both months' figures.
>
> That is the right trade for a dashboard tile — it needs one indexed range scan
> and no per-night expansion — but it is NOT an accounting number, and the
> finance surface must not be built on it. Proper night-level apportionment
> belongs with a folio/ledger table, which does not exist yet.

Consequences to keep in mind:

- **Monthly figures do not sum to the annual figure.** Every straddling stay is
  double-counted across the boundary.
- A 28-night stay over a month end appears in full in both months.
- The owner portfolio tile uses the identical rule, **deliberately**, so that an
  owner and their GM never see two different numbers for the same month. Being
  consistently approximate beats being inconsistently precise.

### 2. MRR annualises `annual_price`, not `monthly_price × duration_months`

For an `ANNUAL`-cycle subscription MRR uses `annual_price / 12`. But
`annual_price` is described in the schema as *"legacy; not used for period
maths"* — the amount actually charged for a period is
`monthly_price × duration_months`. **MRR can therefore disagree with what is
billed** for any plan whose `annual_price` was not kept in step. Reported as a
discrepancy, not fixed.

### 3. MRR ignores everything that is not `ACTIVE`

`TRIAL`, `EXPIRING` and `GRACE_PERIOD` subscriptions contribute nothing, though
`subsActive` counts `TRIAL`. So `mrr / subsActive` is not `arpu` — `arpu`
divides by the count of `ACTIVE` rows only.

### 4. `arr = mrr × 12` is a snapshot, not a forecast

No churn, no expansion, no seasonality. It is today's run rate multiplied out.

### 5. Everything is computed live, per request

`/analytics/overview` runs its aggregates on every call, over the whole
`subscriptions` table joined to plans. Fine at the current size; it is a
sequential scan, and the first thing to move behind `daily_platform_metrics`
when it stops being fine.

## Related

- [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md) — the statuses these metrics slice by
- [BILLING.md](./BILLING.md) — the numbers that *are* accounting numbers
- [ARCHITECTURE.md](./ARCHITECTURE.md#workers) — the aggregator and its missing trigger
