-- Backlog item 4 (PERFORMANCE_AND_BUG_FIXES.md), 2026-10-02.
--
-- databaseService.cancelOrder() did its database work as five separate,
-- non-transactional statements from Node (cancel allocations → expire offers →
-- cancel store_orders → status-guarded customer_orders update), after a
-- read-then-check of driver assignment. A rider accept (or anything else)
-- landing between those steps could leave an order half-cancelled, e.g.
-- store_orders cancelled while customer_orders was claimed by a rider. The
-- exploitable acceptOrder race was closed from the accept side on 2026-10-01;
-- this makes the cancel itself all-or-nothing.
--
-- Only the database state change lives here. Refunds (Razorpay / wallet),
-- coupon release and notifications stay in Node, after this commits: they call
-- external services that can't take part in a database transaction, and they
-- must only run once the cancellation is certain.
--
-- Lock order: pending driver_order_offers rows FIRST, then customer_orders,
-- then store_orders. accept_driver_offer() (20260721000000) locks its offer row
-- (FOR UPDATE SKIP LOCKED) and then customer_orders FOR UPDATE; taking the
-- order row first here and the offer rows afterwards would be the opposite
-- order and could deadlock. With this order:
--   * if this function holds the offers, accept_driver_offer skips the locked
--     row and returns 'offer_not_found' — no wait, no deadlock;
--   * if accept got its offer first, this waits for it to commit, then sees the
--     assigned rider below and refuses with DRIVER_ASSIGNED.
-- finalize_order_if_ready() locks customer_orders first and touches no offers,
-- so it is consistent with this order too.
--
-- Errors are raised with stable codes in the message; cancelOrder() maps them
-- to the same user-facing messages it used before.

CREATE OR REPLACE FUNCTION public.cancel_customer_order(p_order_id UUID)
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
  -- 1. Offers first (see lock-order note above).
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

  -- Same rule as before (store_orders.delivery_partner_id only). Deliberately
  -- not also checking customer_orders.assigned_driver_id: this change is about
  -- atomicity, not new rules, and a stale assigned_driver_id (rejectOrder's
  -- second write is unchecked) must not make an order uncancellable.
  SELECT EXISTS (
    SELECT 1 FROM store_orders
    WHERE customer_order_id = p_order_id AND delivery_partner_id IS NOT NULL
  )
  INTO v_has_driver;

  IF v_has_driver THEN
    RAISE EXCEPTION 'DRIVER_ASSIGNED';
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

  -- The updated order (payment fields unchanged — Node uses them to decide the
  -- refund) plus the stores to notify.
  RETURN to_jsonb(v_order) || jsonb_build_object('cancelled_store_ids', COALESCE(to_jsonb(v_store_ids), '[]'::jsonb));
END;
$$;

-- Backend (service_role) only. Lesson from V1 (section 7): never grant an
-- order-state-changing SECURITY DEFINER function to anon/authenticated — with
-- the public anon key, anyone could cancel any order by id.
REVOKE EXECUTE ON FUNCTION public.cancel_customer_order(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_customer_order(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(UUID) TO service_role;
