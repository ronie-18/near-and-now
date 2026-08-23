-- Two related exposures found while fixing app_users/admins.password_hash
-- (20260930270000): delivery_partners has never had a column-level
-- restriction applied at all, and app_users' re-grant from that same
-- migration still included expo_push_token.
--
-- 1. delivery_partners.session_token/session_token_issued_at is a rider's
--    live auth bearer token (not a hash — directly usable to impersonate
--    that rider's app session), currently readable by ANY admin session via
--    DeliveryPage.tsx's `select('*')` (or any raw select against the anon-key
--    admin client) — the same admin_read-gated-only-by-is_admin_authenticated()
--    RLS shape already fixed for app_users/admins' password_hash, just never
--    applied to this table.
-- 2. delivery_partners.expo_push_token and app_users.expo_push_token
--    (customer/rider push tokens) have the same unrestricted-admin-read gap
--    stores.expo_push_token had before 20260830000000 — since Expo's
--    push-send API doesn't authenticate the sender, any admin session can
--    currently read these and send arbitrary push notifications
--    impersonating the app to that user's device.
--
-- Confirmed the legitimate admin-panel column needs via repo-wide grep of
-- admin/src's actual .select() calls: DeliveryPage.tsx's own list view was
-- the only `select('*')` against this table — every other call site already
-- explicitly lists user_id/name/phone. Same Postgres mechanic as
-- 20260830000000/20260930270000: a column-level REVOKE can't carve an
-- exception out of a pre-existing table-level GRANT SELECT, so
-- delivery_partners needs the full revoke-then-column-grant treatment;
-- app_users already has a column-level grant from 20260930270000, so a
-- targeted column REVOKE is enough to additionally close expo_push_token
-- there without re-touching the rest of that grant.

REVOKE SELECT ON public.delivery_partners FROM anon, authenticated;
GRANT SELECT (
  user_id, name, email, phone, address, vehicle_type, vehicle_number,
  is_online, status, is_approved, approved_at, approved_by,
  verification_submitted_at, profile_image_url, vehicle_image_url,
  last_seen, created_at, updated_at, auth_user_id, upi_id, deleted_at
) ON public.delivery_partners TO anon, authenticated;

REVOKE SELECT (expo_push_token) ON public.app_users FROM anon, authenticated;

-- SECURITY DEFINER accessors for the admin broadcast-push feature
-- (NotificationsPage.tsx), mirroring admin_get_store_push_tokens()
-- (20260830000000) exactly — the one legitimate reader of these columns,
-- gated on an actual admin session rather than column-level table access.
CREATE OR REPLACE FUNCTION public.admin_get_delivery_partner_push_tokens()
RETURNS TABLE(expo_push_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_authenticated() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT dp.expo_push_token
  FROM public.delivery_partners dp
  WHERE dp.expo_push_token IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_delivery_partner_push_tokens() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_customer_push_tokens()
RETURNS TABLE(expo_push_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_authenticated() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT u.expo_push_token
  FROM public.app_users u
  WHERE u.role = 'customer' AND u.expo_push_token IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_customer_push_tokens() TO anon, authenticated;
