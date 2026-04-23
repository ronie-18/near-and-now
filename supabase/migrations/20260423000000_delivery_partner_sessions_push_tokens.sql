-- Add session_token (for rider app auth) and expo_push_token (for push notifications)
-- to the delivery_partners table.

ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS session_token TEXT,
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Fast lookup when verifying rider requests
CREATE INDEX IF NOT EXISTS delivery_partners_session_token_idx
  ON public.delivery_partners(session_token)
  WHERE session_token IS NOT NULL;
