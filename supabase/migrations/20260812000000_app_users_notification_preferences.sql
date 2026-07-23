-- getNotificationPreferences/updateNotificationPreferences (notifications.controller.ts)
-- were pure stubs — always returned a hardcoded object, never touched the DB.
-- Gives customers real, persisted per-user notification preferences.
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB
  NOT NULL DEFAULT '{"email": true, "sms": true, "push": true}'::jsonb;
