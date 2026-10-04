-- Store allocation hardening (2026-10-04), part 2 of 4.
--
-- finalize_order_if_ready (last changed in 20260930340000) advanced an order
-- to 'ready_for_pickup' as soon as no allocation was 'pending_acceptance' and
-- at least one was 'accepted'. Two gaps:
--
--  1. Items in flight between stores were invisible to it. When a store
--     declines items, Node first unassigns them (assigned_store_id = NULL) and
--     only then looks for a new store. If another store's accept lands in that
--     window, no allocation is pending yet, so the order was dispatched with
--     items that had no store — and the new store's allocation then arrived on
--     an order that was already 'ready_for_pickup', where this function
--     (correctly) refuses to run again. The same state is left behind
--     permanently if the process dies between the two steps.
--
--  2. An 'accepted' allocation with no accepted items counted as accepted.
--     acceptAllocation never checked that accepted_item_ids belonged to the
--     allocation, so a request naming only foreign ids produced an 'accepted'
--     row with nothing to pick up, and the order went out to riders anyway.
--
-- Now:
--   * any order_item still waiting for a store (assigned_store_id IS NULL and
--     not written off as 'unavailable') blocks dispatch — the sweep in
--     shopkeeper.controller.ts re-runs reallocation for such items, so this is
--     self-healing rather than a new way to get stuck;
--   * at least one accepted allocation must actually list accepted items.
--
-- Grants: service_role only, as re-established by 20261001010000. Stated
-- explicitly here so a CREATE OR REPLACE can never silently widen them again.

CREATE OR REPLACE FUNCTION public.finalize_order_if_ready(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status         TEXT;
  v_pending_count  INTEGER;
  v_waiting_items  INTEGER;
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

  -- Items between stores (or orphaned mid-reallocation) are not ready to be
  -- picked up by anyone yet.
  SELECT COUNT(*) INTO v_waiting_items
  FROM order_items
  WHERE customer_order_id = p_order_id
    AND assigned_store_id IS NULL
    AND item_status <> 'unavailable';

  IF v_waiting_items > 0 THEN
    RETURN FALSE;
  END IF;

  -- Something must actually be accepted, by a store that accepted real items.
  SELECT COUNT(*) INTO v_accepted_count
  FROM order_store_allocations
  WHERE order_id = p_order_id
    AND status = 'accepted'
    AND cardinality(accepted_item_ids) > 0;

  IF v_accepted_count = 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE customer_orders SET status = 'ready_for_pickup' WHERE id = p_order_id;

  INSERT INTO order_status_history (customer_order_id, status, notes)
  VALUES (p_order_id, 'ready_for_pickup', 'All stores confirmed — broadcasting to drivers');

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_order_if_ready(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_order_if_ready(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_order_if_ready(UUID) TO service_role;
