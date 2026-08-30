-- Key cards — the physical room keys reception issues against a stay.
--
-- One row per card handed over. A card always belongs to exactly one
-- reservation and dies with it (ON DELETE CASCADE). Status is the STORED
-- lifecycle only — ACTIVE | DEACTIVATED | LOST; an ACTIVE card past its
-- expires_at reports as EXPIRED at the API layer, derived, never written.

CREATE TABLE IF NOT EXISTS key_cards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL,
  reservation_id uuid NOT NULL,
  -- 'KC-0001' style, unique per property (below), never globally.
  card_number    varchar(16) NOT NULL,
  status         varchar(16) NOT NULL DEFAULT 'ACTIVE',
  -- The staff member who handed the card over; nullable so a departed
  -- colleague never blocks the row.
  issued_by      uuid,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  -- Check-out day at 11:00 — the card outlives the guest by nothing.
  expires_at     timestamptz NOT NULL,
  deactivated_at timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "key_cards" ADD CONSTRAINT "key_cards_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Card numbers are unique PER PROPERTY: two hotels may both hold KC-0001.
CREATE UNIQUE INDEX IF NOT EXISTS key_cards_property_number_unique ON key_cards (property_id, card_number);
--> statement-breakpoint
-- Hot path: "this property's active cards".
CREATE INDEX IF NOT EXISTS key_cards_property_status_idx ON key_cards (property_id, status);
