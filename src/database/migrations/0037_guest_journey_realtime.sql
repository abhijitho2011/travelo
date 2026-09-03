-- PMS milestone 8: the contactless guest journey, conversations, reviews.
-- Additive and defaulted.

-- ---------- magic links ----------
-- One link per reservation, carrying a hashed token. The guest uses it to
-- check in online, choose services and instructions, and request checkout.
CREATE TABLE IF NOT EXISTS "guest_links" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"            uuid NOT NULL,
  "reservation_id"         uuid NOT NULL,
  "token_hash"             varchar(64) NOT NULL,
  "expires_at"             timestamptz NOT NULL,
  "sent_at"                timestamptz,
  "opened_at"              timestamptz,
  "checkin_submitted_at"   timestamptz,
  "checkout_requested_at"  timestamptz,
  "created_at"             timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guest_links" ADD CONSTRAINT "guest_links_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "guest_links_token_hash_unique" ON "guest_links" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_links_reservation_idx" ON "guest_links" ("reservation_id");
--> statement-breakpoint
-- What the desk tells guests on the link: wifi, parking, breakfast times.
ALTER TABLE "property_settings" ADD COLUMN IF NOT EXISTS "guest_instructions" text;
--> statement-breakpoint
-- Where reviews are requested after checkout (a Google/OTA review URL).
ALTER TABLE "property_settings" ADD COLUMN IF NOT EXISTS "review_url" varchar(512);
--> statement-breakpoint

-- ---------- conversations ----------
-- One thread per guest phone (or reservation). Messages in both directions
-- over SMS / EMAIL / WHATSAPP / INTERNAL, whether automated or typed.
CREATE TABLE IF NOT EXISTS "conversations" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"      uuid NOT NULL,
  "reservation_id"   uuid,
  "guest_name"       varchar(160),
  "guest_phone"      varchar(32),
  "guest_email"      varchar(254),
  "last_message_at"  timestamptz,
  "last_preview"     varchar(200),
  "unread_count"     integer NOT NULL DEFAULT 0,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_property_last_idx" ON "conversations" ("property_id", "last_message_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_property_phone_idx" ON "conversations" ("property_id", "guest_phone");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id"  uuid NOT NULL,
  "property_id"      uuid NOT NULL,
  -- IN (from the guest) | OUT (to the guest)
  "direction"        varchar(3) NOT NULL,
  -- SMS | EMAIL | WHATSAPP | INTERNAL
  "channel"          varchar(12) NOT NULL,
  "body"             text NOT NULL,
  -- QUEUED | SENT | FAILED | RECEIVED
  "status"           varchar(12) NOT NULL DEFAULT 'QUEUED',
  -- MANUAL | AUTOMATION | GUEST
  "origin"           varchar(12) NOT NULL DEFAULT 'MANUAL',
  "automation_key"   varchar(64),
  "sent_by"          uuid,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx" ON "messages" ("conversation_id", "created_at");
--> statement-breakpoint
-- Automations run once per reservation per key (pre-arrival, welcome, review).
CREATE TABLE IF NOT EXISTS "stay_automations_sent" (
  "reservation_id"  uuid NOT NULL,
  "automation_key"  varchar(64) NOT NULL,
  "sent_at"         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("reservation_id", "automation_key")
);
--> statement-breakpoint

-- ---------- reviews ----------
CREATE TABLE IF NOT EXISTS "reviews" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"      uuid NOT NULL,
  "reservation_id"   uuid,
  -- GOOGLE | BOOKING_COM | MAKEMYTRIP | TRIPADVISOR | DIRECT | OTHER
  "source"           varchar(24) NOT NULL DEFAULT 'DIRECT',
  "guest_name"       varchar(160),
  "rating"           integer NOT NULL,
  "title"            varchar(200),
  "body"             text,
  "reviewed_at"      date,
  "response"         text,
  "responded_at"     timestamptz,
  "responded_by"     uuid,
  "external_url"     varchar(512),
  "created_at"       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_property_created_idx" ON "reviews" ("property_id", "created_at");
--> statement-breakpoint

-- ---------- guest templates for the journey ----------
INSERT INTO "notification_templates" ("template_key", "name", "channel", "subject", "body", "status")
VALUES
  ('guest.magic_link', 'Your stay link', 'SMS', NULL,
   E'{{propertyName}}: manage your stay {{reservationNumber}} — check in online, add services, see arrival instructions: {{link}}',
   'Active'),
  ('guest.magic_link', 'Your stay link', 'EMAIL',
   'Your stay at {{propertyName}} — check in online',
   E'Hello {{guestName}},\n\nUse your personal link to check in before you arrive, add services and find arrival instructions for booking {{reservationNumber}}:\n\n{{link}}\n\nSee you on {{checkIn}}.\n\n— {{propertyName}}',
   'Active'),
  ('stay.pre_arrival', 'Arriving tomorrow', 'SMS', NULL,
   E'{{propertyName}}: we look forward to welcoming you tomorrow for booking {{reservationNumber}}. Check-in from {{checkinTime}}. {{link}}',
   'Active'),
  ('stay.pre_arrival', 'Arriving tomorrow', 'EMAIL',
   'See you tomorrow at {{propertyName}}',
   E'Hello {{guestName}},\n\nWe look forward to welcoming you tomorrow. Check-in is from {{checkinTime}}.\n\n{{instructions}}\n\nYour stay link: {{link}}\n\n— {{propertyName}}',
   'Active'),
  ('stay.review_request', 'How was your stay?', 'SMS', NULL,
   E'{{propertyName}}: thank you for staying with us. A quick review helps us a lot: {{reviewUrl}}',
   'Active'),
  ('stay.review_request', 'How was your stay?', 'EMAIL',
   'How was your stay at {{propertyName}}?',
   E'Hello {{guestName}},\n\nThank you for staying with us. If you have a minute, a review would mean a great deal:\n\n{{reviewUrl}}\n\n— {{propertyName}}',
   'Active'),
  ('guest.message', 'Message from the hotel', 'SMS', NULL, E'{{body}}', 'Active'),
  ('guest.message', 'Message from the hotel', 'EMAIL', '{{propertyName}}', E'{{body}}\n\n— {{propertyName}}', 'Active')
ON CONFLICT DO NOTHING;
