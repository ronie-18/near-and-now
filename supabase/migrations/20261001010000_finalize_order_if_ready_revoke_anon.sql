-- finalize_order_if_ready was correctly locked down by
-- 20260930260000_revoke_public_grant_order_verification_rpcs.sql (REVOKE EXECUTE
-- FROM PUBLIC, anon, authenticated) specifically because anon-callable access lets
-- any client holding just the public anon key force-advance ANY order straight to
-- 'ready_for_pickup' via POST /rest/v1/rpc/finalize_order_if_ready — before any
-- store actually accepted it, entirely bypassing the Express backend's own
-- order-acceptance business logic.
--
-- 20260930340000_finalize_order_if_ready_require_accepted.sql (a same-day, unrelated
-- fix adding the "at least one allocation must be accepted" check) did
-- `CREATE OR REPLACE FUNCTION finalize_order_if_ready(...)` and re-added the
-- function's *original* pre-260000 grant line
-- (`GRANT EXECUTE ... TO service_role, authenticated, anon`), silently re-opening
-- the exact hole 260000 had just closed a few migrations earlier the same day —
-- CREATE OR REPLACE does not reset grants on its own, but this migration's own
-- explicit GRANT statement did. Confirmed live via anon-key RPC call on 2026-10-01
-- (during the deep-dive audit that produced this fix): calling it with a
-- nonexistent order id returned `200 false` — a real execution, not a 42501
-- permission error — while the sibling functions revoked by the same 260000
-- migration (mark_verification_submitted_if_ready,
-- mark_rider_verification_submitted_if_ready) correctly still return 401, since
-- neither of those was ever CREATE OR REPLACE'd again after 260000.
--
-- Re-closes the same hole, the same way, for this one function only — the two
-- siblings are already fine and untouched here.

REVOKE EXECUTE ON FUNCTION public.finalize_order_if_ready(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_order_if_ready(UUID) FROM anon, authenticated;
