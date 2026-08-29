-- The money path: recordable payments, exportable ledgers.
--
-- No new TABLES — payments, invoices, refunds and webhook_events already exist.
-- What was missing is the authority to use them:
--
--   payment.record  — record a payment that did not come from a gateway (cash,
--                     NEFT, UPI, cheque) and create a gateway order. This is a
--                     money-moving permission, deliberately separate from
--                     billing.view (read) and billing.refund (give money back).
--
-- SUPER_ADMIN holds '*' and therefore already has it. FINANCE_ADMIN is granted
-- it explicitly below — it is the role whose job this is.
--
-- Also adds two indexes the new paths lean on:
--   payments_pending_ref_idx — a webhook resolves its PENDING payment by
--                              gateway_ref; without this that is a seq scan on
--                              every capture.
--   invoices_subscription_idx — the renewal chain and the CSV export both read
--                              invoices by subscription.

INSERT INTO "permissions" ("key", "group", "description")
VALUES ('payment.record', 'Payment', 'record a manual payment or create a gateway order')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r.id, 'payment.record'
FROM "roles" r
WHERE r.key = 'finance_admin'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "payments_pending_ref_idx"
  ON "payments" USING btree ("gateway_ref")
  WHERE "status" = 'PENDING';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "invoices_subscription_idx"
  ON "invoices" USING btree ("subscription_id");
