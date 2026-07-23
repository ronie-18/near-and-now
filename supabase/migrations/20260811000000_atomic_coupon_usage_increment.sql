-- Fixes a read-then-write race in coupon redemption counting: recordCouponUsage
-- used to read coupons.usage_count, then write count+1 in a separate statement,
-- with no locking between the two. Two concurrent redemptions of the same
-- coupon (e.g. a usage_limit: 1 promo code applied by two customers at nearly
-- the same instant) could both read the same starting count and both write the
-- same result, silently losing one of the two increments — and, worse, letting
-- a coupon be redeemed past its usage_limit since the limit re-check and the
-- increment weren't atomic either.
--
-- Mirrors the row-locking pattern already used by finalize_order_if_ready(),
-- accept_driver_offer(), and mark_verification_submitted_if_ready(): lock the
-- coupon row FOR UPDATE before deciding, so concurrent callers serialize and
-- the limit check + increment happen as one atomic step.
CREATE OR REPLACE FUNCTION increment_coupon_usage_if_available(p_coupon_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage_count INTEGER;
  v_usage_limit INTEGER;
BEGIN
  SELECT usage_count, usage_limit INTO v_usage_count, v_usage_limit
  FROM coupons
  WHERE id = p_coupon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_usage_limit IS NOT NULL AND v_usage_count >= v_usage_limit THEN
    RETURN FALSE; -- limit already reached — do not increment
  END IF;

  UPDATE coupons SET usage_count = v_usage_count + 1 WHERE id = p_coupon_id;
  RETURN TRUE;
END;
$$;

-- Only ever called from backend/src via supabaseAdmin (the service-role
-- client) — no anon/authenticated grant needed (same reasoning as the
-- anon-RPC lockdown in 20260810000000_lock_down_anon_rpc_grants.sql).
GRANT EXECUTE ON FUNCTION increment_coupon_usage_if_available(UUID) TO service_role;
