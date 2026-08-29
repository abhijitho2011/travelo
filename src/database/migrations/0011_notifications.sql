-- Notifications that actually deliver.
--
-- Three things happen here:
--
--   1. `notifications` (the in-app inbox) grows owner_id / staff_id and loses
--      the NOT NULL on admin_id. It was admin-only; owners and hotel staff now
--      receive in-app notifications too. Exactly one recipient column is set,
--      enforced by a CHECK.
--
--   2. `notification_templates` swaps its unique key from (template_key) to
--      (template_key, channel). One key must be able to carry an email body
--      AND a short SMS body — with the old constraint that was impossible, and
--      an SMS would have had to reuse (and truncate) the email copy.
--
--   3. `notification_deliveries` is new: one row per send ATTEMPT, holding the
--      rendered copy, the status, the attempt count and the last error. It is
--      the answer to "did the owner actually get told".

-- ---------- 1. Inbox recipients ----------

ALTER TABLE "notifications" ALTER COLUMN "admin_id" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
--> statement-breakpoint

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "staff_id" uuid;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "hotel_staff"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_one_recipient_chk"
    CHECK (
      (("admin_id" IS NOT NULL)::int + ("owner_id" IS NOT NULL)::int
       + ("staff_id" IS NOT NULL)::int) = 1
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notifications_owner_idx"
  ON "notifications" USING btree ("owner_id", "read_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notifications_staff_idx"
  ON "notifications" USING btree ("staff_id", "read_at");
--> statement-breakpoint

-- ---------- 2. Per-channel templates ----------

DO $$
DECLARE c text;
BEGIN
  -- The old single-column unique may have been created as a constraint or as
  -- a bare index depending on how the table was first built. Drop whichever.
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'notification_templates'::regclass
      AND contype = 'u'
      AND (SELECT count(*) FROM unnest(conkey)) = 1
  LOOP
    EXECUTE format('ALTER TABLE notification_templates DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "notification_templates_key_channel_idx"
  ON "notification_templates" USING btree ("template_key", "channel");
--> statement-breakpoint

-- ---------- 3. The delivery audit trail ----------

CREATE TABLE IF NOT EXISTS "notification_deliveries" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notification_key" varchar(128) NOT NULL,
  "channel"          varchar(16) NOT NULL,
  "recipient"        varchar(320) NOT NULL,
  "subject"          varchar(255),
  "body"             text NOT NULL,
  "status"           varchar(16) NOT NULL DEFAULT 'PENDING',
  "attempts"         integer NOT NULL DEFAULT 0,
  "last_error"       text,
  "related_type"     varchar(64),
  "related_id"       uuid,
  "scheduled_for"    timestamptz NOT NULL DEFAULT now(),
  "sent_at"          timestamptz,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_status_chk"
    CHECK ("status" IN ('PENDING','SENT','FAILED','SKIPPED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- The worker's only hot query: due PENDING rows, oldest first.
CREATE INDEX IF NOT EXISTS "notification_deliveries_due_idx"
  ON "notification_deliveries" USING btree ("status", "scheduled_for");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notification_deliveries_created_idx"
  ON "notification_deliveries" USING btree ("created_at");
--> statement-breakpoint

-- ---------- 4. Template copy ----------
--
-- Idempotent: re-running refreshes the copy but never duplicates a row. Edits
-- made through POST /notifications/templates are overwritten by a re-run, so
-- treat this block as the source of truth for the shipped defaults.

INSERT INTO "notification_templates" ("template_key", "name", "channel", "subject", "body", "status")
VALUES
  ('subscription.expiring', 'Subscription expiring', 'EMAIL',
   'Your Tavelo subscription expires in {{days}} day(s)',
   E'Hello {{ownerName}},\n\nYour Tavelo {{planName}} subscription for {{propertyName}} expires on {{expiryDate}} — that is {{days}} day(s) from now.\n\nRenew before then and nothing changes: your rooms, reservations and staff accounts stay exactly as they are.\n\n— The Tavelo team',
   'Active'),
  ('subscription.expiring', 'Subscription expiring', 'IN_APP',
   'Subscription expires in {{days}} day(s)',
   E'Your {{planName}} plan expires on {{expiryDate}}. Renew to avoid interruption.',
   'Active'),
  ('subscription.expiring', 'Subscription expiring', 'SMS', NULL,
   E'Tavelo: your {{planName}} plan expires on {{expiryDate}} ({{days}} day(s)). Please renew.',
   'Active'),

  ('subscription.expired', 'Subscription expired', 'EMAIL',
   'Your Tavelo subscription has expired',
   E'Hello {{ownerName}},\n\nYour Tavelo {{planName}} subscription for {{propertyName}} expired on {{expiryDate}}.\n\nYour data is safe. A short grace period follows, after which access is suspended until the subscription is renewed.\n\n— The Tavelo team',
   'Active'),
  ('subscription.expired', 'Subscription expired', 'IN_APP',
   'Subscription expired',
   E'Your {{planName}} plan expired on {{expiryDate}}. Renew to restore full access.',
   'Active'),

  ('subscription.grace_started', 'Grace period started', 'EMAIL',
   'Your Tavelo subscription is in its grace period',
   E'Hello {{ownerName}},\n\n{{propertyName}} is now running on a grace period that ends on {{graceEndsOn}}. Everything still works today.\n\nIf the subscription is not renewed by then, the account is suspended — staff sign-in and the front desk stop until it is renewed.\n\n— The Tavelo team',
   'Active'),
  ('subscription.grace_started', 'Grace period started', 'IN_APP',
   'Grace period started',
   E'Your account is in a grace period until {{graceEndsOn}}. Renew before then to avoid suspension.',
   'Active'),

  ('subscription.suspended', 'Subscription suspended', 'EMAIL',
   'Your Tavelo account has been suspended',
   E'Hello {{ownerName}},\n\nThe grace period for {{propertyName}} has ended and the account is now suspended.\n\nNothing has been deleted. Renewing the subscription restores access immediately.\n\n— The Tavelo team',
   'Active'),
  ('subscription.suspended', 'Subscription suspended', 'IN_APP',
   'Account suspended',
   E'{{propertyName}} is suspended. Renew the subscription to restore access.',
   'Active'),
  ('subscription.suspended', 'Subscription suspended', 'SMS', NULL,
   E'Tavelo: {{propertyName}} is suspended for non-renewal. Renew to restore access.',
   'Active'),

  ('payment.success', 'Payment received', 'EMAIL',
   'Payment received — invoice {{invoiceNumber}}',
   E'Hello {{ownerName}},\n\nWe have received {{amount}} for {{planName}}. Invoice {{invoiceNumber}} is issued and your subscription now runs to {{periodEnd}}.\n\nThank you.\n\n— The Tavelo team',
   'Active'),
  ('payment.success', 'Payment received', 'IN_APP',
   'Payment received',
   E'{{amount}} received. Invoice {{invoiceNumber}}. Subscription active to {{periodEnd}}.',
   'Active'),

  ('payment.failed', 'Payment failed', 'EMAIL',
   'We could not process your payment',
   E'Hello {{ownerName}},\n\nA payment of {{amount}} for {{propertyName}} did not go through ({{reason}}).\n\nNo money has left your account. You can retry from the billing page whenever you are ready.\n\n— The Tavelo team',
   'Active'),
  ('payment.failed', 'Payment failed', 'IN_APP',
   'Payment failed',
   E'A payment of {{amount}} failed: {{reason}}. Please retry from Billing.',
   'Active'),

  ('support.ticket.created', 'Support ticket created', 'IN_APP',
   'New support ticket: {{subject}}',
   E'{{ownerName}} raised a {{priority}} priority ticket ({{category}}): {{subject}}',
   'Active'),
  ('support.ticket.created', 'Support ticket created', 'EMAIL',
   'New support ticket: {{subject}}',
   E'A new {{priority}} priority support ticket was raised by {{ownerName}}.\n\nCategory: {{category}}\nSubject: {{subject}}\n\nOpen it in the admin console to respond.',
   'Active'),

  ('support.ticket.replied', 'Support ticket replied', 'EMAIL',
   'Re: {{subject}}',
   E'Hello {{ownerName}},\n\nOur support team has replied to your ticket "{{subject}}":\n\n{{message}}\n\nReply from the support page to continue the conversation.\n\n— Tavelo Support',
   'Active'),
  ('support.ticket.replied', 'Support ticket replied', 'IN_APP',
   'Support replied to "{{subject}}"',
   E'{{message}}',
   'Active'),

  ('staff.pending_approval', 'Staff awaiting approval', 'IN_APP',
   'New team member awaiting approval',
   E'{{staffName}} was added as {{role}} at {{propertyName}} and is waiting for approval.',
   'Active'),
  ('staff.pending_approval', 'Staff awaiting approval', 'EMAIL',
   'A new team member is waiting for approval',
   E'{{staffName}} was added as {{role}} at {{propertyName}} and cannot sign in until approved.\n\nApprove or reject them from Team in the Tavelo staff app.',
   'Active'),

  ('staff.approved', 'Staff approved', 'EMAIL',
   'Your Tavelo account is active',
   E'Hello {{staffName}},\n\nYour account at {{propertyName}} has been approved. You can now sign in to the Tavelo staff app with your registered mobile number.\n\nRole: {{role}}\n\n— The Tavelo team',
   'Active'),
  ('staff.approved', 'Staff approved', 'SMS', NULL,
   E'Tavelo: your staff account at {{propertyName}} is approved. Sign in with this mobile number.',
   'Active'),
  ('staff.approved', 'Staff approved', 'IN_APP',
   'Account approved',
   E'Your account at {{propertyName}} is approved. Role: {{role}}.',
   'Active'),

  ('announcement.published', 'Announcement published', 'IN_APP',
   '{{title}}',
   E'{{message}}',
   'Active'),
  ('announcement.published', 'Announcement published', 'EMAIL',
   '{{title}}',
   E'{{message}}\n\n— The Tavelo team',
   'Active')
ON CONFLICT ("template_key", "channel") DO UPDATE SET
  "name"       = EXCLUDED."name",
  "subject"    = EXCLUDED."subject",
  "body"       = EXCLUDED."body",
  "status"     = EXCLUDED."status",
  "updated_at" = now();
