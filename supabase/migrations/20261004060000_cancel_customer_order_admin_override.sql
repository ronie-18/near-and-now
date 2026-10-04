-- Admin cancel of a rider-assigned order (2026-10-04 review follow-up).
--
-- orders.controller.ts updateOrderStatus routes an admin "set status to
-- order_cancelled" through databaseService.cancelOrder → cancel_customer_order
-- (so refunds, coupon release, allocation/offer cleanup all happen). But
-- cancel_customer_order (20261002000000) refuses with DRIVER_ASSIGNED once any
-- store_orders row has a rider — correct for a CUSTOMER cancel, but it also
-- removed the admin's only way to cancel such an order (rider unreachable,
-- customer refused delivery, stock spoiled, …): the admin got a 500 and the
-- order could not be cancelled by anyone.
--
-- Adds p_allow_driver_assigned (default false — the customer path and the
-- automatic paths are unchanged). Only the backend's admin route passes true.
-- Everything else — lock order, terminal-state checks, the writes — is
-- identical to 20261002000000. A delivered order still can't be cancelled.
--
-- The old single-argument function is dropped first: keeping it next to a
-- (uuid, boolean DEFAULT false) overload would make a one-argument call
-- ambiguous. Drop + create run in this migration's transaction.

DROP FUNCTION IF EXISTS public.cancel_customer_order(UUID);

CREATE OR REPLACE FUNCTION public.cancel_customer_order(
  p_order_id UUID,
  p_allow_driver_assigned BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order      customer_orders%ROWTYPE;
  v_has_driver BOOLEAN;
  v_store_ids  UUID[];
  v_now        TIMESTAMPTZ := now();
BEGIN
  -- 1. Offers first (lock order: see 20261002000000).
  PERFORM 1
  FROM driver_order_offers
  WHERE order_id = p_order_id AND status = 'pending'
  FOR UPDATE;

  -- 2. The order row.
  SELECT * INTO v_order
  FROM customer_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_order.status = 'order_delivered' THEN
    RAISE EXCEPTION 'ORDER_DELIVERED';
  END IF;
  IF v_order.status = 'order_cancelled' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_CANCELLED';
  END IF;

  -- 3. Store orders, locked, then the driver check against the locked state.
  PERFORM 1 FROM store_orders WHERE customer_order_id = p_order_id FOR UPDATE;

  IF NOT p_allow_driver_assigned THEN
    SELECT EXISTS (
      SELECT 1 FROM store_orders
      WHERE customer_order_id = p_order_id AND delivery_partner_id IS NOT NULL
    )
    INTO v_has_driver;

    IF v_has_driver THEN
      RAISE EXCEPTION 'DRIVER_ASSIGNED';
    END IF;
  END IF;

  -- 4. The cancellation itself — all or nothing.
  UPDATE order_store_allocations SET status = 'cancelled' WHERE order_id = p_order_id;

  UPDATE driver_order_offers
  SET status = 'expired'
  WHERE order_id = p_order_id AND status = 'pending';

  WITH cancelled AS (
    UPDATE store_orders
    SET status = 'order_cancelled', cancelled_at = v_now
    WHERE customer_order_id = p_order_id
    RETURNING store_id
  )
  SELECT array_agg(DISTINCT store_id) FILTER (WHERE store_id IS NOT NULL)
  INTO v_store_ids
  FROM cancelled;

  UPDATE customer_orders
  SET status = 'order_cancelled', cancelled_at = v_now
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- The updated order (payment fields and assigned_driver_id unchanged — Node
  -- uses them for the refund and to tell an assigned rider) plus the stores.
  RETURN to_jsonb(v_order) || jsonb_build_object('cancelled_store_ids', COALESCE(to_jsonb(v_store_ids), '[]'::jsonb));
END;
$$;

-- Backend (service_role) only, as before.
REVOKE EXECUTE ON FUNCTION public.cancel_customer_order(UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_customer_order(UUID, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(UUID, BOOLEAN) TO service_role;
