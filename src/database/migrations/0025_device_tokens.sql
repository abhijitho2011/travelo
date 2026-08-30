-- Phase 6: push-notification device tokens.
-- One FCM registration token per row, owned by exactly one owner OR one staff
-- member. The PUSH channel resolves an IN_APP-style recipient to its live
-- tokens here; unregistered tokens are soft-revoked, not deleted.

CREATE TABLE IF NOT EXISTS device_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid,
  staff_id    uuid,
  token       text NOT NULL,
  platform    varchar(16) NOT NULL DEFAULT 'android',
  app         varchar(16) NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  -- Exactly one principal owns a token.
  CONSTRAINT device_tokens_one_owner CHECK (
    (owner_id IS NOT NULL)::int + (staff_id IS NOT NULL)::int = 1
  )
);

-- One row per token: registering an existing token updates it in place.
CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_token_idx ON device_tokens (token);
-- Hot path: "live tokens for this owner / this staff member".
CREATE INDEX IF NOT EXISTS device_tokens_owner_idx ON device_tokens (owner_id, revoked_at);
CREATE INDEX IF NOT EXISTS device_tokens_staff_idx ON device_tokens (staff_id, revoked_at);
