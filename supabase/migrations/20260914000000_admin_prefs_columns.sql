ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb,
  ADD COLUMN IF NOT EXISTS display_preferences jsonb;
