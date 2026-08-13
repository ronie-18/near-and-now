-- =============================================================================
-- Closes a TOCTOU race in per_user_limit enforcement, the sibling gap to the
-- one 20260811000000_atomic_coupon_usage_increment.sql already fixed for the
-- *global* usage_limit. Found 2026-08-13 during a full-codebase deep audit.
--
-- validateCoupon() (backend/src/services/database.service.ts) enforces
-- per_user_limit with a plain read: count the customer's existing
-- coupon_redemptions rows for this coupon, compare against per_user_limit.
-- coupon_redemptions has no unique constraint on (coupon_id, customer_id), so
-- two near-simultaneous checkout requests with the same "1 per user" coupon
-- (double-tap, two tabs/devices) can both read zero prior redemptions, both
-- pass validateCoupon, and both insert a redemption row — the customer
-- redeems a single-use coupon twice.
--
-- Same fix shape as the global-limit fix: fold the per-user check into the
-- same row-locked function that does the redemption insert + usage_count
-- increment, so both limits are enforced atomically at the one place that
-- actually commits a redemption, not just pre-checked non-atomically before
-- it. Replaces increment_coupon_usage_if_available (which only bumped
-- usage_count; the redemption row insert happened separately, un-guarded, in
-- JS beforehand) with record_coupon_redemption_if_available, which does the
-- insert and the increment together under the same coupon-row lock.
--
-- As with the existing global-limit gap (see recordCouponUsage's own
-- comment): this runs as a fire-and-forget step *after* the order is already
-- created, so a redemption rejected here (e.g. a genuine race lost) can't
-- retroactively un-apply the discount already baked into that order's total
-- — logged as a warning for manual review, same tolerance already accepted
-- for the global limit. What this migration actually closes is the case
-- that mattered: a *third* concurrent attempt (or two, arriving within the
-- same lock window) no longer both succeed — only one insert can win once
-- serialized behind the row lock.
-- =============================================================================

CREATE OR REPLACE FUNCTION record_coupon_redemption_if_available(
  p_coupon_id UUID,
  p_customer_id UUID,
  p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage_count INTEGER;
  v_usage_limit INTEGER;
  v_per_user_limit INTEGER;
  v_redeemed_by_user INTEGER;
BEGIN
  SELECT usage_count, usage_limit, per_user_limit
    INTO v_usage_count, v_usage_limit, v_per_user_limit
  FROM coupons
  WHERE id = p_coupon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_usage_limit IS NOT NULL AND v_usage_count >= v_usage_limit THEN
    RETURN FALSE; -- global limit already reached
  END IF;

  IF v_per_user_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_redeemed_by_user
    FROM coupon_redemptions
    WHERE coupon_id = p_coupon_id AND customer_id = p_customer_id;

    IF v_redeemed_by_user >= v_per_user_limit THEN
      RETURN FALSE; -- this customer's per-user limit already reached
    END IF;
  END IF;

  INSERT INTO coupon_redemptions (coupon_id, customer_id, order_id)
  VALUES (p_coupon_id, p_customer_id, p_order_id);

  UPDATE coupons SET usage_count = v_usage_count + 1 WHERE id = p_coupon_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION record_coupon_redemption_if_available(UUID, UUID, UUID) TO service_role;

-- increment_coupon_usage_if_available is superseded by the function above
-- (recordCouponUsage no longer calls it) but left in place rather than
-- dropped — release_coupon_usage_for_order and any other future caller
-- don't reference it, and dropping a SECURITY DEFINER function a deployed
-- backend might still transiently call mid-deploy is not worth the risk for
-- a same-day code+migration pair.
