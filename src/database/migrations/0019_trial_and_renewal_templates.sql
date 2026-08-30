-- Trial-lifecycle notification templates (Phase 2, item 2.4).
--
-- TRIAL was a dead status: the lifecycle worker never touched it, so a trial
-- never expired, converted or notified. The worker now expires trials; these
-- are the messages it sends. Same (template_key, channel) shape as 0011, and
-- ON CONFLICT keeps re-seeding idempotent.

INSERT INTO "notification_templates" ("template_key", "name", "channel", "subject", "body", "status")
VALUES
  ('subscription.trial_ending', 'Trial ending', 'EMAIL',
   'Your Tavelo trial ends in {{days}} day(s)',
   E'Hello {{ownerName}},\n\nYour Tavelo {{planName}} trial for {{propertyName}} ends on {{expiryDate}} — {{days}} day(s) from now.\n\nAdd a subscription from the owner app before then and nothing changes: your rooms, reservations and staff accounts carry straight over.\n\n— The Tavelo team',
   'Active'),
  ('subscription.trial_ending', 'Trial ending', 'IN_APP',
   'Trial ends in {{days}} day(s)',
   E'Your {{planName}} trial ends on {{expiryDate}}. Subscribe from the app to keep going.',
   'Active'),

  ('subscription.trial_expired', 'Trial expired', 'EMAIL',
   'Your Tavelo trial has ended',
   E'Hello {{ownerName}},\n\nYour Tavelo {{planName}} trial for {{propertyName}} ended on {{expiryDate}}.\n\nYour data is safe and nothing has been deleted. Subscribe from the owner app to restore full access whenever you are ready.\n\n— The Tavelo team',
   'Active'),
  ('subscription.trial_expired', 'Trial expired', 'IN_APP',
   'Trial ended',
   E'Your {{planName}} trial ended on {{expiryDate}}. Subscribe to restore full access.',
   'Active')
ON CONFLICT ("template_key", "channel") DO UPDATE SET
  "name" = EXCLUDED."name",
  "subject" = EXCLUDED."subject",
  "body" = EXCLUDED."body",
  "status" = EXCLUDED."status";
