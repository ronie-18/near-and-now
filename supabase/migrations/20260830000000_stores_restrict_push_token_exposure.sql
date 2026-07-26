-- stores.public_read (USING (true), from 20260515000002_admin_data_access_rls.sql) is a
-- row-level policy, so it can't selectively hide one column: anyone holding the anon key
-- can currently read expo_push_token off any store row. Since Expo's push-send API doesn't
-- authenticate the sender, that token alone is enough to send arbitrary push notifications
-- impersonating the app to that shopkeeper's device.
--
-- Column-level REVOKE is the fix, not a new row policy -- stores already has both
-- "admin_full_access" (is_admin_authenticated()) and "public_read" as OR'd policies, and the
-- admin panel's broadcast-push feature (NotificationsPage.tsx) connects with the same anon-key
-- client as everyone else, just with an admin-session header. A column-level REVOKE from
-- anon/authenticated applies to that connection regardless of which RLS policy would otherwise
-- allow the row, so admin's read needs a SECURITY DEFINER function that bypasses the column
-- grant internally instead of a table SELECT.

-- A column-level REVOKE cannot carve an exception out of a pre-existing table-level
-- GRANT SELECT (Postgres tracks table-level and column-level privileges separately,
-- and table-level wins regardless of any column-level revoke entry) -- confirmed this
-- the hard way: the naive `REVOKE SELECT (expo_push_token) ... FROM anon, authenticated`
-- ran without error but had zero effect, verified via a real anon-key REST request that
-- still returned the token. The actual fix is to revoke table-level SELECT entirely and
-- re-grant it column-by-column, omitting expo_push_token.
REVOKE SELECT ON public.stores FROM anon, authenticated;
GRANT SELECT (
  id, owner_id, name, phone, address, latitude, longitude, is_active, created_at,
  updated_at, image_url, owner_image_url, is_approved, approved_at, approved_by,
  verification_submitted_at
) ON public.stores TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_store_push_tokens()
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
  SELECT s.expo_push_token
  FROM public.stores s
  WHERE s.expo_push_token IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_store_push_tokens() TO anon, authenticated;
