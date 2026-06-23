-- Add expo_push_token to stores so shopkeeper push notifications can be delivered.
-- Pattern mirrors delivery_partners (migration 20260423000000).
-- One token per store; when a shopkeeper owns multiple stores all are updated on register.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

CREATE INDEX IF NOT EXISTS stores_expo_push_token_idx
  ON public.stores(expo_push_token)
  WHERE expo_push_token IS NOT NULL;
