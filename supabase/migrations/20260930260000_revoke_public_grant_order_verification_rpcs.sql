-- finalize_order_if_ready, mark_verification_submitted_if_ready, and
-- mark_rider_verification_submitted_if_ready (created in 20260720000000/
-- 20260803000000/20260805000000) were only partially locked down by
-- 20260810000000_lock_down_anon_rpc_grants.sql, which revokes EXECUTE from
-- anon/authenticated — but Postgres also grants EXECUTE to the separate
-- PUBLIC pseudo-role at function creation time, and a REVOKE ... FROM
-- anon, authenticated does not touch that grant. Every role (including
-- anon) inherits PUBLIC's privileges regardless of any per-role revoke.
--
-- This exact gotcha was already found and fixed once for a different
-- function (ensure_stores_near_location, see 20260929000000), and that
-- migration's own comment explicitly flagged that the same latent
-- PUBLIC-grant gap likely still applies to these three functions from the
-- 2026-07-23 fix — that follow-up was never done until now.
--
-- Confirmed live via pg_proc.proacl-equivalent reasoning: since no
-- migration between 20260810000000 and today ever issued a
-- "REVOKE ... FROM PUBLIC" for any of these three, they still carry the
-- original creation-time PUBLIC grant, making them callable via
-- POST /rest/v1/rpc/<fn> by anyone holding just the bundled anon key,
-- entirely outside the Express backend's own auth/business-rule checks
-- (e.g. force-advancing a brand-new order to ready_for_pickup before any
-- store accepted it, or forging a premature verification-submitted admin
-- notification for an arbitrary store/rider).
REVOKE EXECUTE ON FUNCTION public.finalize_order_if_ready(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_verification_submitted_if_ready(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_rider_verification_submitted_if_ready(UUID) FROM PUBLIC;

-- Re-affirm the anon/authenticated revoke too (idempotent — already applied
-- by 20260810000000 — but explicit here so this migration is a complete,
-- self-contained closure of the gap rather than relying on a prior file).
REVOKE EXECUTE ON FUNCTION public.finalize_order_if_ready(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_verification_submitted_if_ready(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_rider_verification_submitted_if_ready(UUID) FROM anon, authenticated;
