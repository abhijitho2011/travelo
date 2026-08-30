-- Phase 6: guest-facing notification templates.
-- Guests are not app users, so these go out over SMS (guest_phone is required)
-- and EMAIL (when a guest email is on the booking). Same (template_key, channel)
-- shape as 0011/0019; idempotent on conflict.

INSERT INTO "notification_templates" ("template_key", "name", "channel", "subject", "body", "status")
VALUES
  ('booking.confirmed', 'Booking confirmed', 'EMAIL',
   'Your booking at {{propertyName}} is confirmed',
   E'Hello {{guestName}},\n\nYour booking {{reservationNumber}} at {{propertyName}} is confirmed.\n\nCheck-in: {{checkIn}}\nCheck-out: {{checkOut}}\n\nWe look forward to welcoming you.\n\n— {{propertyName}}',
   'Active'),
  ('booking.confirmed', 'Booking confirmed', 'SMS', NULL,
   E'{{propertyName}}: booking {{reservationNumber}} confirmed. Check-in {{checkIn}}, check-out {{checkOut}}.',
   'Active'),

  ('booking.checked_in', 'Checked in', 'EMAIL',
   'Welcome to {{propertyName}}',
   E'Hello {{guestName}},\n\nYou are now checked in at {{propertyName}} (booking {{reservationNumber}}).\n\nWe hope you enjoy your stay. Reach out to the front desk for anything you need.\n\n— {{propertyName}}',
   'Active'),
  ('booking.checked_in', 'Checked in', 'SMS', NULL,
   E'{{propertyName}}: you are checked in (booking {{reservationNumber}}). Enjoy your stay!',
   'Active')
ON CONFLICT ("template_key", "channel") DO UPDATE SET
  "name" = EXCLUDED."name",
  "subject" = EXCLUDED."subject",
  "body" = EXCLUDED."body",
  "status" = EXCLUDED."status";
