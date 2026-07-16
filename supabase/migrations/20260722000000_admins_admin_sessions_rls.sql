-- `admins` and `admin_sessions` were the only two tables in the admin-auth
-- system with base anon GRANTs (added in 20260718000000_fix_admin_sessions_grants.sql)
-- but no RLS ever enabled. Combined, that meant:
--   1. Any caller with just the public anon key could `SELECT * FROM admins`
--      and read every admin's password_hash directly — no login required.
--   2. Any caller could INSERT an arbitrary row into admin_sessions (any
--      admin_id, any self-chosen session_token), fully bypassing the
--      password check and forging a valid admin session.
--
-- Fixed at the app layer too: admin login now goes through a new backend
-- endpoint (POST /api/admin/login, using the service-role client, which
-- always bypasses RLS) instead of querying Supabase directly from the
-- browser. This migration closes the same hole at the database layer,
-- independent of what the frontend does, using the same
-- is_admin_authenticated()-gated pattern already used for every other
-- admin-facing table (see 20260515000002_admin_data_access_rls.sql) —
-- that function is SECURITY DEFINER and reads admin_sessions internally
-- with RLS bypassed, so it isn't affected by the policies added here.

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_full_access" ON public.admins;
CREATE POLICY "admin_full_access" ON public.admins
  FOR ALL USING (public.is_admin_authenticated());

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_full_access" ON public.admin_sessions;
CREATE POLICY "admin_full_access" ON public.admin_sessions
  FOR ALL USING (public.is_admin_authenticated());
