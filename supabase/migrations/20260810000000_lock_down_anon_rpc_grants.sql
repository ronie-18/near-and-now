-- Security hardening pass (2026-07-23 audit): several SECURITY DEFINER RPCs were
-- granted EXECUTE to anon/authenticated with no caller-identity check inside the
-- function body — fine as long as only the backend (via the service-role client)
-- ever calls them, but any holder of the public anon key could call these directly
-- against Postgres/PostgREST, bypassing the Express backend and its auth entirely.
--
-- Confirmed via full-repo grep: finalize_order_if_ready, mark_verification_submitted_if_ready,
-- and mark_rider_verification_submitted_if_ready are only ever invoked from
-- backend/src via supabaseAdmin (the service-role client) — anon/authenticated
-- access was never actually needed. Revoking it closes the anon-RPC-forgery path
-- (e.g. calling finalize_order_if_ready to force-advance a brand-new order to
-- ready_for_pickup before any store has accepted it) without touching the
-- functions' own logic.
REVOKE EXECUTE ON FUNCTION finalize_order_if_ready(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION mark_verification_submitted_if_ready(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION mark_rider_verification_submitted_if_ready(UUID) FROM anon, authenticated;

-- debug_admin_headers() was a temporary diagnostic function from the 2026-07-17
-- admin-auth investigation, explicitly commented "safe to drop once the
-- admin-auth 0-rows issue is resolved" (it has been, as of the very next day's
-- migrations) but was never actually dropped. It's SECURITY DEFINER, granted to
-- anon/authenticated, and returns the full matching admin_sessions row
-- (including session_token) for any caller who can supply an x-admin-token —
-- confirmed unused anywhere in the codebase. Drop it entirely.
DROP FUNCTION IF EXISTS public.debug_admin_headers();
