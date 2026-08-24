-- finalize_order_if_ready (20260720000000) only checked that no allocation
-- was still 'pending_acceptance' before flipping the order to
-- 'ready_for_pickup' — it never checked that at least one allocation was
-- actually 'accepted'. If every store on an order ends up rejecting (or
-- every item on a single-store order is marked unavailable and
-- reallocateMissingItems exhausts its 8km search radius without placing
-- any of them — flagUnresolvableItemsForRefund handles that by flagging the
-- items, not by creating a new allocation), the order has zero pending AND
-- zero accepted allocations, and this function still marked it
-- 'ready_for_pickup'.
--
-- broadcastToNearbyDrivers then has no 'accepted' allocation to pick a
-- search center from and silently returns without offering the order to
-- anyone; reBroadcastIfStuck re-fires every 3 minutes forever and hits the
-- same no-op. The order sits at 'ready_for_pickup' indefinitely — the
-- customer's tracking screen says "packed and ready, waiting for a driver"
-- for an order nothing was ever actually prepared for, with no automatic
-- cancellation anywhere.
--
-- Fix: also require at least one 'accepted' allocation to exist before
-- advancing to ready_for_pickup. If every store rejected/was unresolvable,
-- this now correctly returns FALSE and leaves the order at its current
-- pre-ready status instead of falsely marking it ready — closing the silent
-- stuck-order state. (Automatically cancelling/refunding an order in that
-- all-rejected state is a separate product decision, not addressed here.)
CREATE OR REPLACE FUNCTION finalize_order_if_ready(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_pending_count INTEGER;
  v_accepted_count INTEGER;
BEGIN
  SELECT status INTO v_status
  FROM customer_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_status NOT IN ('pending_at_store', 'store_accepted', 'preparing_order') THEN
    RETURN FALSE; -- already resolved (or moved on) by a concurrent caller
  END IF;

  SELECT COUNT(*) INTO v_pending_count
  FROM order_store_allocations
  WHERE order_id = p_order_id AND status = 'pending_acceptance';

  IF v_pending_count > 0 THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*) INTO v_accepted_count
  FROM order_store_allocations
  WHERE order_id = p_order_id AND status = 'accepted';

  IF v_accepted_count = 0 THEN
    RETURN FALSE; -- every store rejected / nothing was ever accepted — not actually ready
  END IF;

  UPDATE customer_orders SET status = 'ready_for_pickup' WHERE id = p_order_id;

  INSERT INTO order_status_history (customer_order_id, status, notes)
  VALUES (p_order_id, 'ready_for_pickup', 'All stores confirmed — broadcasting to drivers');

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_order_if_ready(UUID) TO service_role, authenticated, anon;
