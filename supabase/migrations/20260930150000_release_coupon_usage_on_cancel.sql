-- Cancelling an order never restored coupon usage — a cancelled order
-- permanently burned the customer's per_user_limit use and the coupon's
-- global usage_count, even though the order was never fulfilled. Mirrors
-- increment_coupon_usage_if_available's row-locked pattern (migration
-- 20260811000000) so a concurrent redemption/cancellation can't race the
-- usage_count update. Found 2026-08-11 during an order-cancellation/refund
-- audit.

CREATE OR REPLACE FUNCTION release_coupon_usage_for_order(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon_id UUID;
BEGIN
  DELETE FROM coupon_redemptions
  WHERE order_id = p_order_id
  RETURNING coupon_id INTO v_coupon_id;

  IF v_coupon_id IS NULL THEN
    RETURN FALSE; -- no coupon was used on this order
  END IF;

  UPDATE coupons
  SET usage_count = GREATEST(usage_count - 1, 0)
  WHERE id = v_coupon_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION release_coupon_usage_for_order(UUID) TO service_role;
