-- Add session_token_issued_at to support server-side session TTL enforcement.
-- Existing tokens get issued_at = NOW() so they stay valid for one more 30-day window.

ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS session_token_issued_at TIMESTAMPTZ;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS session_token_issued_at TIMESTAMPTZ;

-- Backfill: treat existing tokens as issued now (one grace period).
UPDATE public.delivery_partners
  SET session_token_issued_at = NOW()
  WHERE session_token IS NOT NULL AND session_token_issued_at IS NULL;

UPDATE public.app_users
  SET session_token_issued_at = NOW()
  WHERE session_token IS NOT NULL AND session_token_issued_at IS NULL;
