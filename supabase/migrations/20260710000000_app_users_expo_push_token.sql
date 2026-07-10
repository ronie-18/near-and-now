-- Add expo_push_token to app_users so customer-app push notifications can be delivered.
-- Pattern mirrors stores (migration 20260623000001) and delivery_partners (migration 20260423000000).

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

CREATE INDEX IF NOT EXISTS app_users_expo_push_token_idx
  ON public.app_users(expo_push_token)
  WHERE expo_push_token IS NOT NULL;
