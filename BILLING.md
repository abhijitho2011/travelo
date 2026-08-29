# Billing

Money in Tavelo is **integer paise**. There is no floating point anywhere in
the settlement path, and no tax arithmetic is invented by it.

Module: `src/modules/billing`. Subscription semantics are in
[SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md).

## One settlement path

`BillingService.settleSuccessfulPayment(input)` is the **only** place money
becomes a renewed subscription and an issued invoice. From the code:

> The gateway webhook and the manual-payment endpoint both land here, so the
> two can never drift: same renewal maths, same invoice shape, same events,
> same audit trail. The only difference between them is what they put in
> `gateway` and `gatewayRef`.

Callers:

| Caller | `gateway` | `source` |
| --- | --- | --- |
| Razorpay webhook → `dispatchWebhook` | `RAZORPAY` | `webhook` |
| `POST /billing/payments/manual` | `MANUAL` | `manual` |

### What happens, in order

**Before the transaction.** `amountPaise` must be a positive integer.
The invoice number is allocated **outside** the transaction, deliberately:

> the sequence is a counter, not part of the money, and a rollback must not hand
> the same number to two invoices.

**Inside one transaction** (`settleInTx`):

1. **Renew** — if `subscriptionId` is present, load the subscription with its
   plan, verify it belongs to `ownerId` (else 400), compute
   `computeRenewal(now, currentPeriodEnd, plan.durationMonths)`, and write
   `current_period_start`, `current_period_end` and `status: 'ACTIVE'`.
2. **Invoice** — insert an `invoices` row for the period just paid for, status
   `PAID`, `issued_at` and `paid_at` set to now. **`subtotal = total = amount`,
   `tax = 0`, `discount = 0`**:

   > No tax maths is invented here. The amount collected IS the subtotal and the
   > total; a tax regime, when one exists, must be applied by whatever builds
   > the charge, not by the settlement path.
3. **Payment** — either resolve the parked `PENDING` order row
   (`existingPaymentId` → `SUCCESS`, linked to the invoice) or insert a fresh
   `SUCCESS` row. The raw gateway payload is stored on it.
4. **History** — insert a `subscription_events` row of type `renewal` carrying
   the source, gateway ref, payment and invoice ids, and both the previous and
   new period ends.

**After the commit**, in order, each best-effort:

5. `audit.record('billing.payment.settled.<source>')`.
6. `pdf.generateQuietly(invoice.id)` — swallows and logs.
7. `notifyPaymentSuccess(...)` — enqueues only.

Steps 5–7 are outside the transaction on purpose: **a storage failure must not
undo a payment the gateway has already taken.** An invoice with no PDF is a
recoverable annoyance; a captured payment with no renewal is not.

### Renewal maths

```ts
periodStart = max(now, currentPeriodEnd)
periodEnd   = addMonths(periodStart, plan.durationMonths)
```

`durationMonths` must be an integer in 1…120 or the call is rejected. Paying
early does not forfeit time already bought; paying late does not bill for the
gap. See [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md#renewal-maths).

## Webhooks

`POST /api/v1/admin/webhooks/payments/:provider` — `@Public()`, no auth. Two
providers are registered in `payment-providers.ts`: `razorpay` and `cashfree`.

`main.ts` boots with `bodyParser: false` and installs `express.json` with a
`verify` hook that stashes `req.rawBody`, so signature verification sees the
**exact bytes that were signed** rather than a re-serialisation.

### The flow

1. Look up the provider; unknown ⇒ 400.
2. Verify the signature against
   `PAYMENT_WEBHOOK_SECRET_<PROVIDER>` (Razorpay reads
   `x-razorpay-signature`). Mismatch ⇒ 400 *Signature mismatch*.
   **If the secret is not configured the check is skipped** with a warning that
   says "dev only" — do not run production without it.
3. **Claim idempotency before any money moves.**
4. Dispatch the settlement hint the provider extracted.
5. Mark the `webhook_events` row `processed_at`.

### Idempotency

`webhook_events` has a unique index on `(provider, event_id)`. The row is
inserted **first**, and a duplicate-key error short-circuits to
`{ ok: true, replayed: true }`:

> Idempotency is claimed BEFORE any money moves: the unique index on
> (provider, event_id) is what makes a redelivered webhook a no-op rather than a
> second renewal. A gateway retrying five times must renew once.

If processing then throws, the event row **stays**, unprocessed, with the reason
recorded on it, and the endpoint still returns 2xx — the gateway has no useful
retry to make, and the failure is visible in the table rather than hidden in a
retry storm. A `fail`-shaped event that settles nothing triggers
`notifyWebhookFailure`, which is the only moment the owner learns the charge did
not go through.

## Gateway orders

`POST /billing/payments/orders` (`payment.record`) creates a Razorpay order for
a subscription's next period and parks a `PENDING` payment carrying its id; the
webhook later finds that row and settles it as `existingPaymentId`. The response
includes `keyId` (the public key) for the checkout widget.

Without **both** `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` the endpoint
returns a typed `GATEWAY_NOT_CONFIGURED`. The manual path still collects money,
so an unconfigured deployment is a working one.

## Invoices

`invoices`, with `invoice_number` unique.

**Numbering** — `InvoiceNumberService`: `INV-<YYYYMM>-<000001>`, where the
sequence comes from an atomic upsert on `invoice_sequences`:

```sql
INSERT INTO invoice_sequences (year_month, last_seq, updated_at) VALUES ($1, 1, now())
ON CONFLICT (year_month) DO UPDATE SET last_seq = invoice_sequences.last_seq + 1, updated_at = now()
RETURNING last_seq
```

One statement, so concurrent settlements cannot collide, and the counter resets
per calendar month (UTC).

**PDFs** — generated with `pdfkit` and written through `StorageService`
(s3 or local), then attached to the invoice. Generated post-commit and
best-effort at settlement; `POST /billing/invoices/:id/generate-pdf`
(`invoice.edit`) regenerates on demand, and
`GET /billing/invoices/:id/document` (`invoice.view`) serves it — a presigned
URL under the s3 driver, a streamed fallback under `local`. Audited as
`invoice.document.generated` / `invoice.document.attached`.

**Manual invoice lifecycle** — `POST /billing/invoices` (`invoice.create`), then
`/issue`, `/mark-paid`, `/cancel` (all `invoice.edit`), each audited as
`invoice.<status>`.

## Refunds

`POST /billing/payments/:id/refund` (`billing.refund`).

**In a transaction** (`refundInTx`):

- the payment must be `SUCCESS` or `PARTIALLY_REFUNDED`, else 400;
- `SUM(refunds.amount)` for the payment is loaded and
  `newAmount + alreadyRefunded > payment.amount` is refused — **over-refunding
  is impossible**;
- a `refunds` row is inserted as `PENDING` with the actor;
- the payment moves to `REFUNDED` if fully covered, else `PARTIALLY_REFUNDED`;
- audited as `billing.refund.created`.

**After the commit**, the gateway is called only when
`razorpay.configured && payment.gateway === 'RAZORPAY' && payment.gatewayRef`:

| Outcome | Refund row |
| --- | --- |
| No gateway call possible | `MANUAL` — somebody must move the money by hand |
| Razorpay accepted | `PROCESSED`, with the gateway refund id |
| Razorpay threw | stays **`PENDING`** for retry; audited `billing.refund.gateway.failed` |

The ledger entry exists either way. The gateway call is the part that can fail,
and it fails into a visible state rather than a lost one.

## Payment statuses

`PENDING` · `SUCCESS` · `FAILED` · `REFUNDED` · `PARTIALLY_REFUNDED` ·
`CANCELLED`.
Gateways: `RAZORPAY` · `CASHFREE` · `MANUAL` · `STRIPE` (enum value only — no
Stripe adapter exists).

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/billing/payments` | `billing.view` |
| GET | `/billing/payments/:id` | `billing.view` |
| GET | `/billing/failed` | `billing.view` |
| POST | `/billing/payments/manual` | `payment.record` |
| POST | `/billing/payments/orders` | `payment.record` |
| POST | `/billing/payments/:id/refund` | `billing.refund` |
| GET | `/billing/refunds` | `billing.view` |
| GET | `/billing/invoices` | `billing.view` |
| GET | `/billing/invoices/:id` | `billing.view` |
| GET | `/billing/invoices/:id/document` | `invoice.view` |
| POST | `/billing/invoices` | `invoice.create` |
| POST | `/billing/invoices/:id/generate-pdf` | `invoice.edit` |
| POST | `/billing/invoices/:id/issue` | `invoice.edit` |
| POST | `/billing/invoices/:id/mark-paid` | `invoice.edit` |
| POST | `/billing/invoices/:id/cancel` | `invoice.edit` |
| POST | `/webhooks/payments/:provider` | **public** (signature-verified) |

Owner-side, read-only: `GET /api/v1/owner/subscription/invoices`.

## Exports

`GET /api/v1/admin/export/:entity` — `JwtAuthGuard` only; the permission is
resolved **per entity** from `EXPORT_PERMISSIONS` inside the controller rather
than by a decorator. `/export/owners` and `/export/owners.csv` are the same
thing.

| Entity | Requires |
| --- | --- |
| `owners` | `owner.view` |
| `properties` | `property.view` |
| `staff` | `staff.read` |
| `subscriptions` | `subscription.view` |
| `payments` | `billing.view` |
| `invoices` | `invoice.view` |
| `audit-logs` | `audit.view` **and** `audit.export` |

> The permission each export needs is the same one that shows the list in the
> console, so an export can never be a privilege escalation dressed as a
> download. Audit logs need a second key on top — bulk-extracting the audit
> trail is its own decision.

Output is CSV via `src/common/csv/to-csv.ts`, streamed, paged at 200 rows with a
hard ceiling of **50,000 rows** per export — streaming means memory is not the
constraint, but an unbounded query against a growing table is still a way to
take the database down by clicking a button. Every export writes an `export.csv`
audit row.

## Money-handling rules, if you are adding to this

1. **Paise, integers, everywhere.** `BillingService.formatAmount` is the only
   place paise become a human string.
2. **Nothing settles outside `settleSuccessfulPayment`.** A second path is a
   second set of renewal rules.
3. **Claim idempotency before you move money**, not after.
4. **Post-commit work is best-effort and must not throw upward.** PDFs and
   notifications cannot be allowed to unwind a captured payment.
5. **Never invent tax.** The charge builder owns that.

## Related

- [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md) · [AUDIT.md](./AUDIT.md) ·
  [ANALYTICS.md](./ANALYTICS.md) ·
  [DEPLOYMENT.md](./DEPLOYMENT.md#payments)
