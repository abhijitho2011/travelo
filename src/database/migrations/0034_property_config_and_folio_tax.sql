-- PMS foundation, part 1: property configuration, folio tax, reservation depth.
--
-- Everything here is additive and defaulted, so every existing row stays a
-- valid row and nothing running today changes behaviour until a property
-- fills the new configuration in.

-- ---------- property_settings: one row per property ----------
--
-- The knobs the spec's "Property configuration" screens turn: how the folio is
-- numbered and printed, what the check-in day looks like, how tax is
-- registered, and how the booking engine presents the hotel. 1:1 with
-- properties, keyed on property_id so a read never needs a join.
CREATE TABLE IF NOT EXISTS "property_settings" (
  "property_id"            uuid PRIMARY KEY,
  -- Tax registration. GSTIN is what prints on every invoice; the state code
  -- (first two GSTIN digits) decides intra- vs inter-state supply.
  "gstin"                  varchar(15),
  "gst_state_code"         varchar(2),
  "prices_include_tax"     boolean NOT NULL DEFAULT false,
  -- Folio / invoice presentation.
  "invoice_prefix"         varchar(12) NOT NULL DEFAULT 'INV',
  "invoice_next_number"    integer NOT NULL DEFAULT 1,
  "invoice_footer"         text,
  "invoice_show_gstin"     boolean NOT NULL DEFAULT true,
  "invoice_show_hsn"       boolean NOT NULL DEFAULT true,
  "invoice_show_breakup"   boolean NOT NULL DEFAULT true,
  -- The check-in day. SINGLE: one fixed check-in/out time. THREE_SLOT: three
  -- arrival windows. HOURLY: rooms sold by the hour. Times are local HH:MM.
  "checkin_model"          varchar(12) NOT NULL DEFAULT 'SINGLE',
  "checkin_time"           varchar(5) NOT NULL DEFAULT '14:00',
  "checkout_time"          varchar(5) NOT NULL DEFAULT '11:00',
  "slots"                  jsonb,
  -- Enquiry/hold bookings expire unpaid after this many minutes. NULL = never.
  "hold_expiry_minutes"    integer,
  -- What a guest sees on the hosted booking page and the embeddable widget.
  "booking_engine_enabled" boolean NOT NULL DEFAULT false,
  "booking_engine_slug"    varchar(80),
  "brand_color"            varchar(9),
  "brand_logo_key"         varchar(512),
  "booking_terms"          text,
  -- Which events reach the guest and the hotelier, by channel.
  "guest_notifications"    jsonb NOT NULL DEFAULT '{}'::jsonb,
  "hotelier_notifications" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "currency"               varchar(8) NOT NULL DEFAULT 'INR',
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_settings" ADD CONSTRAINT "property_settings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "property_settings_booking_slug_unique"
  ON "property_settings" ("booking_engine_slug") WHERE "booking_engine_slug" IS NOT NULL;
--> statement-breakpoint

-- ---------- property_taxes: the taxes and fees a property levies ----------
--
-- The statutory GST slabs live in code (billing/gst.ts) because they are law,
-- not configuration. This table is everything ELSE a hotel adds on top — a
-- municipal tax, a service charge, a tourism levy — each with its own HSN/SAC
-- so it prints correctly on the invoice.
CREATE TABLE IF NOT EXISTS "property_taxes" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"   uuid NOT NULL,
  "name"          varchar(80) NOT NULL,
  -- PERCENT (basis points of the taxable amount) or FIXED (paise per unit).
  "calculation"   varchar(8) NOT NULL DEFAULT 'PERCENT',
  "value"         integer NOT NULL,
  -- PER_NIGHT | PER_STAY | PER_GUEST — how a FIXED amount multiplies.
  "basis"         varchar(12) NOT NULL DEFAULT 'PER_STAY',
  -- ROOM | RESTAURANT | SPA | ADDON | ALL — which charges it attaches to.
  "applies_to"    varchar(12) NOT NULL DEFAULT 'ROOM',
  "hsn_code"      varchar(16),
  "is_active"     boolean NOT NULL DEFAULT true,
  "sort_order"    integer NOT NULL DEFAULT 0,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  "deleted_at"    timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_taxes" ADD CONSTRAINT "property_taxes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_taxes_property_idx" ON "property_taxes" ("property_id");
--> statement-breakpoint

-- ---------- property_policies: cancellation / no-show / deposit rules ----------
--
-- A policy is a rule the folio and the (manual) payment desk apply: "cancel
-- within 24h → charge one night". `charge_kind` NONE | FIRST_NIGHT | PERCENT |
-- FIXED; `value` is basis points for PERCENT, paise for FIXED.
CREATE TABLE IF NOT EXISTS "property_policies" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"   uuid NOT NULL,
  -- CANCELLATION | NO_SHOW | EARLY_CHECKOUT | DEPOSIT
  "kind"          varchar(16) NOT NULL,
  "name"          varchar(80) NOT NULL,
  "description"   text,
  -- Applies when the event is within this many hours of check-in. NULL = always.
  "hours_before"  integer,
  "charge_kind"   varchar(12) NOT NULL DEFAULT 'NONE',
  "value"         integer NOT NULL DEFAULT 0,
  "is_default"    boolean NOT NULL DEFAULT false,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  "deleted_at"    timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_policies" ADD CONSTRAINT "property_policies_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_policies_property_kind_idx" ON "property_policies" ("property_id", "kind");
--> statement-breakpoint

-- ---------- addon_services: things sold with a stay ----------
--
-- Airport pickup, breakfast for a room-only plan, a late checkout. Posted to
-- the folio as a line; surfaced on the booking engine and the guest link.
CREATE TABLE IF NOT EXISTS "addon_services" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"    uuid NOT NULL,
  "name"           varchar(120) NOT NULL,
  "description"    text,
  "price_paise"    integer NOT NULL,
  -- PER_STAY | PER_NIGHT | PER_GUEST | PER_GUEST_NIGHT
  "unit"           varchar(16) NOT NULL DEFAULT 'PER_STAY',
  -- accommodation | restaurant | other — picks the statutory GST treatment.
  "tax_category"   varchar(16) NOT NULL DEFAULT 'other',
  "hsn_code"       varchar(16),
  "sell_online"    boolean NOT NULL DEFAULT true,
  "is_active"      boolean NOT NULL DEFAULT true,
  "sort_order"     integer NOT NULL DEFAULT 0,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  "deleted_at"     timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "addon_services" ADD CONSTRAINT "addon_services_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "addon_services_property_idx" ON "addon_services" ("property_id");
--> statement-breakpoint

-- ---------- booking_sources: the property's own list of where bookings come from ----------
--
-- The fixed enum (WALK_IN, PHONE, EMAIL, OTA, OTHER) stays as the coarse
-- channel for reports; this is the finer, hotel-defined list — "MakeMyTrip",
-- "Corporate — Infosys", "Instagram" — each mapped to a coarse channel.
CREATE TABLE IF NOT EXISTS "booking_sources" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"   uuid NOT NULL,
  "name"          varchar(80) NOT NULL,
  "channel"       varchar(16) NOT NULL DEFAULT 'OTHER',
  "commission_bp" integer NOT NULL DEFAULT 0,
  "is_active"     boolean NOT NULL DEFAULT true,
  "sort_order"    integer NOT NULL DEFAULT 0,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "deleted_at"    timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booking_sources" ADD CONSTRAINT "booking_sources_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_sources_property_idx" ON "booking_sources" ("property_id");
--> statement-breakpoint

-- ---------- reservations: what a booking now carries ----------

-- Which rate plan was sold (EP/CP/MAP, refundable or not). Nullable: every
-- booking before today has none, and a flat nightly rate is still allowed.
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "rate_plan_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- The coarse source column grows to fit BOOKING_ENGINE and future channels.
ALTER TABLE "reservations" ALTER COLUMN "source" TYPE varchar(24);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "booking_source_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_booking_source_id_booking_sources_id_fk" FOREIGN KEY ("booking_source_id") REFERENCES "public"."booking_sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Market segment for reports: LEISURE | CORPORATE | GROUP | OTA | ... free text
-- with a sub-segment ("Wedding party", "Infosys").
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "segment" varchar(32);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "sub_segment" varchar(64);
--> statement-breakpoint
-- An enquiry/hold: PENDING with a deadline. The hold-expiry worker cancels
-- past-due ones so a room is never quietly kept off sale by a booking nobody
-- confirmed.
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "hold_expires_at" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservations_hold_expiry_idx"
  ON "reservations" ("hold_expires_at") WHERE "hold_expires_at" IS NOT NULL AND "status" = 'PENDING';
--> statement-breakpoint
-- Pinned to its room: auto-allocation and bulk moves leave it alone.
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "room_locked" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Desk flags the spec calls out by name.
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "scanty_baggage" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "registration_card_printed_at" timestamptz;
--> statement-breakpoint
-- Guest identity artefacts: object-store KEYS (presigned on read), never bytes.
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "guest_photo_key" varchar(512);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "guest_id_proof_key" varchar(512);
--> statement-breakpoint
-- Company billing details that print on the invoice for a corporate stay.
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "company_name" varchar(160);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "company_gstin" varchar(15);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "company_address" text;
--> statement-breakpoint
-- Actual arrival/departure times within the day, for the slot models.
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "checkin_time" varchar(5);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "checkout_time" varchar(5);
--> statement-breakpoint

-- ---------- folio_line_items: tax and discounts become first-class ----------
--
-- The columns for tax existed since 0028 but nothing filled them. These make
-- the folio able to explain every rupee: the pre-tax amount, any discount, the
-- rate that was applied and why, and an exemption when one was granted.
ALTER TABLE "folio_line_items" ADD COLUMN IF NOT EXISTS "discount_paise" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "folio_line_items" ADD COLUMN IF NOT EXISTS "tax_rate_bp" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "folio_line_items" ADD COLUMN IF NOT EXISTS "tax_exempt" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "folio_line_items" ADD COLUMN IF NOT EXISTS "tax_category" varchar(16);
--> statement-breakpoint
ALTER TABLE "folio_line_items" ADD COLUMN IF NOT EXISTS "quantity" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "folio_line_items" ADD COLUMN IF NOT EXISTS "voided_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "folio_line_items" ADD COLUMN IF NOT EXISTS "voided_by" uuid;
--> statement-breakpoint
ALTER TABLE "folio_line_items" ADD COLUMN IF NOT EXISTS "void_reason" varchar(200);
--> statement-breakpoint

-- ---------- folio_events: the folio's own log ----------
--
-- Reservation events already exist; the folio needs its own because "who
-- changed this price and when" is a finance question, asked independently of
-- the stay's timeline.
CREATE TABLE IF NOT EXISTS "folio_events" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reservation_id" uuid NOT NULL,
  "property_id"    uuid NOT NULL,
  "type"           varchar(40) NOT NULL,
  "actor_staff_id" uuid,
  "payload"        jsonb,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "folio_events" ADD CONSTRAINT "folio_events_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folio_events_reservation_idx" ON "folio_events" ("reservation_id", "created_at");
