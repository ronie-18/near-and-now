-- Atomically decides whether a multi-store order is ready to broadcast to drivers.
-- Mirrors the row-locking pattern already used by accept_driver_offer() so that when
-- two stores on the same order accept at nearly the same instant, only one of them
-- wins the "I'm the last one, dispatch to drivers" transition — the other correctly
-- sees the order already resolved and no-ops instead of double-broadcasting.
CREATE OR REPLACE FUNCTION finalize_order_if_ready(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_pending_count INTEGER;
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

  UPDATE customer_orders SET status = 'ready_for_pickup' WHERE id = p_order_id;

  INSERT INTO order_status_history (customer_order_id, status, notes)
  VALUES (p_order_id, 'ready_for_pickup', 'All stores confirmed — broadcasting to drivers');

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_order_if_ready(UUID) TO service_role, authenticated, anon;
