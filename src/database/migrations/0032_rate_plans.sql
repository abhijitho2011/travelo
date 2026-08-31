-- Rate plans, taxes/fees and dynamic pricing rules — the commercial layer that
-- sits on top of a room type.
--
-- A room type says WHAT the unit is; a rate plan says what it COSTS and on what
-- terms (meal plan, cancellation, payment, stay and advance-booking limits).
-- One room type may sell under several plans ("Room Only", "Breakfast
-- Included", "Non-refundable"), so plans hang off the type rather than
-- replacing its base rate.
--
-- MONEY IS INTEGER PAISE everywhere, exactly like the rest of the schema.
-- PERCENTAGES ARE INTEGER BASIS POINTS: 1250 = 12.50%. Basis points are used so
-- a tax rate never becomes a float — 12.5% is not representable in paise, but
-- 1250 bps is exact, and a percent computation stays integer arithmetic.

CREATE TABLE IF NOT EXISTS rate_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL,
  room_type_id        uuid NOT NULL,
  name                varchar(120) NOT NULL,
  -- Per unit, per night, in paise.
  base_price_paise    integer NOT NULL DEFAULT 0,
  currency            varchar(8) NOT NULL DEFAULT 'INR',
  -- ROOM_ONLY | BREAKFAST | HALF_BOARD | FULL_BOARD | ALL_INCLUSIVE
  meal_plan           varchar(24) NOT NULL DEFAULT 'ROOM_ONLY',
  -- FLEXIBLE | NON_REFUNDABLE | CUSTOM
  cancellation_policy varchar(24) NOT NULL DEFAULT 'FLEXIBLE',
  -- Free text shown to the guest; the only place CUSTOM is explained.
  cancellation_note   text,
  -- PAY_AT_PROPERTY | PREPAID | PARTIAL | CUSTOM
  payment_policy      varchar(24) NOT NULL DEFAULT 'PAY_AT_PROPERTY',
  -- Nights. NULL = no limit.
  min_stay            integer,
  max_stay            integer,
  -- Days between booking and arrival. NULL = no limit.
  min_advance_days    integer,
  max_advance_days    integer,
  -- Per extra head, per night, in paise.
  extra_adult_paise   integer NOT NULL DEFAULT 0,
  extra_child_paise   integer NOT NULL DEFAULT 0,
  extra_infant_paise  integer NOT NULL DEFAULT 0,
  -- ACTIVE | INACTIVE. INACTIVE keeps history but stops selling.
  status              varchar(16) NOT NULL DEFAULT 'ACTIVE',
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rate_plans_room_type_idx ON rate_plans (room_type_id);
--> statement-breakpoint
-- Partial, mirroring room_types: a soft-deleted plan frees its name again.
CREATE UNIQUE INDEX IF NOT EXISTS rate_plans_room_type_name_unique ON rate_plans (room_type_id, name) WHERE deleted_at IS NULL;
--> statement-breakpoint

-- Taxes and fees charged on top of (or extracted from) the room rate.
--
-- `value` IS DUAL-UNIT and the `calculation` column decides which:
--   calculation = 'PERCENT' -> value is BASIS POINTS (1250 = 12.5%)
--   calculation = 'FIXED'   -> value is PAISE
-- Nothing else in this table is money.
CREATE TABLE IF NOT EXISTS room_type_fees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL,
  room_type_id uuid NOT NULL,
  name         varchar(120) NOT NULL,
  -- TAX | FEE | SERVICE | CITY_TAX
  kind         varchar(16) NOT NULL DEFAULT 'TAX',
  -- PERCENT | FIXED — see the dual-unit note above.
  calculation  varchar(12) NOT NULL DEFAULT 'PERCENT',
  -- BASIS POINTS when calculation = 'PERCENT', PAISE when 'FIXED'.
  value        integer NOT NULL,
  -- PER_ROOM | PER_GUEST
  basis        varchar(12) NOT NULL DEFAULT 'PER_ROOM',
  -- PER_NIGHT | PER_STAY
  period       varchar(12) NOT NULL DEFAULT 'PER_NIGHT',
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_type_fees" ADD CONSTRAINT "room_type_fees_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_type_fees" ADD CONSTRAINT "room_type_fees_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS room_type_fees_room_type_idx ON room_type_fees (room_type_id);
--> statement-breakpoint

-- Dynamic pricing: conditional adjustments to a room type's rate.
--
-- `threshold` MEANS DIFFERENT THINGS per trigger, which is why it is a bare
-- integer rather than four half-empty columns:
--   OCCUPANCY        -> occupancy percent (0-100)
--   LENGTH_OF_STAY   -> nights
--   ADVANCE_BOOKING  -> days before arrival
--   DAY_OF_WEEK      -> ISO weekday, 1 = Monday .. 7 = Sunday
--   SEASON / SPECIAL_DATE -> unused; the date range carries the condition
--
-- `adjustment_value` is BASIS POINTS when adjustment_kind = 'PERCENT' and
-- PAISE when 'FIXED'. It MAY BE NEGATIVE — that is a discount.
CREATE TABLE IF NOT EXISTS pricing_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL,
  room_type_id     uuid NOT NULL,
  -- OCCUPANCY | DAY_OF_WEEK | SEASON | LENGTH_OF_STAY | ADVANCE_BOOKING | SPECIAL_DATE
  trigger          varchar(24) NOT NULL,
  -- GT | GTE | LT | LTE | EQ
  comparator       varchar(8) NOT NULL DEFAULT 'GTE',
  threshold        integer,
  -- SEASON / SPECIAL_DATE only.
  start_date       date,
  end_date         date,
  -- PERCENT | FIXED
  adjustment_kind  varchar(12) NOT NULL DEFAULT 'PERCENT',
  -- Basis points or paise; negative = discount.
  adjustment_value integer NOT NULL,
  enabled          boolean NOT NULL DEFAULT true,
  -- Higher wins when two rules fire on the same night.
  priority         integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pricing_rules_room_type_enabled_idx ON pricing_rules (room_type_id, enabled);
