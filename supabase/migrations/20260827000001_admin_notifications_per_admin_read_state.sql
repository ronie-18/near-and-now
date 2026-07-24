-- =============================================================================
-- admin_notifications.is_read was a single global boolean shared by every
-- admin — once ANY admin (including via their own "mark all read") flipped
-- it, the notification silently showed as read for every other admin/super
-- admin too, even if they'd never actually seen it. Reported directly by the
-- user: "whenever the super admin opens the page they should also be able to
-- see notifications for other admins" — confirmed live (TOTAL 61, UNREAD 0,
-- including a notification from 36 minutes earlier).
--
-- Fixed by tracking read state per admin instead of a single shared flag.
-- is_read itself is left in place (unused going forward) rather than dropped —
-- no code references it after this migration's paired admin/src changes, but
-- dropping a column is irreversible and this one is harmless to leave, per
-- this repo's existing tolerance for retired-but-harmless columns.
-- =============================================================================

ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS read_by UUID[] NOT NULL DEFAULT '{}';

-- Mirrors admin_has_permission()'s header-read pattern (backend/src middleware
-- reads the same x-admin-token header via req.adminId; RLS/RPC functions here
-- can't reach that, so they re-derive it from admin_sessions the same way
-- admin_has_permission() already does for permission checks).
CREATE OR REPLACE FUNCTION public.current_admin_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_token TEXT;
  v_admin_id UUID;
BEGIN
  BEGIN
    v_token := (current_setting('request.headers', true)::jsonb) ->> 'x-admin-token';
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT s.admin_id INTO v_admin_id
  FROM public.admin_sessions s
  WHERE s.session_token = v_token
    AND s.expires_at > NOW()
    AND s.logged_out_at IS NULL
  LIMIT 1;

  RETURN v_admin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_admin_notification_read(p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID := public.current_admin_id();
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.admin_notifications
  SET read_by = array_append(read_by, v_admin_id)
  WHERE id = p_notification_id
    AND NOT (v_admin_id = ANY(read_by));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_admin_notifications_read()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID := public.current_admin_id();
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.admin_notifications
  SET read_by = array_append(read_by, v_admin_id)
  WHERE NOT (v_admin_id = ANY(read_by));
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_admin_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_admin_notification_read(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_admin_notifications_read() TO anon, authenticated;
