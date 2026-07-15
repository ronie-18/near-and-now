-- admin_sessions was created outside the tracked migration history (no CREATE
-- TABLE for it exists anywhere in supabase/migrations/) — almost certainly
-- hand-created in the Supabase Table Editor at some point. Its admin_id foreign
-- key was left pointing at a table called "admin_users", which doesn't hold the
-- actual admin accounts — those live in "admins" (see 20260515000000_admin_
-- tables_and_seed.sql). Every session insert at login has therefore always
-- failed with a foreign key violation (23503 / surfaced as 409 Conflict).
--
-- authenticateAdmin() in admin/src/services/adminAuthService.ts never checks
-- this insert's error, so login still "succeeds" client-side (token minted,
-- stored in sessionStorage) while no session row is ever created. The next
-- page load's isAdminAuthenticated() check then correctly finds no matching
-- session and bounces back to /login — the "redirects back to login form" bug.

ALTER TABLE public.admin_sessions
  DROP CONSTRAINT IF EXISTS admin_sessions_admin_id_fkey;

ALTER TABLE public.admin_sessions
  ADD CONSTRAINT admin_sessions_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE CASCADE;
