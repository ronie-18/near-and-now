-- get_admin_dashboard_order_stats() (20260930380000) aggregates
-- customer_orders platform-wide (total orders, total customers, total revenue,
-- order counts by status) with no internal auth check in its body — unlike the
-- same day's admin_get_delivery_partner_push_tokens()/admin_get_customer_push_tokens()
-- (20260930290000), which both correctly RAISE EXCEPTION unless
-- is_admin_authenticated() first. 20260930390000_fix_admin_dashboard_order_stats_grant.sql
-- then granted EXECUTE to anon, authenticated (necessary — the admin panel calls
-- this via getAdminClient(), an anon-key client with an x-admin-token header, same
-- as every other admin RPC) without ever adding the matching internal check this
-- function was missing from the start.
--
-- Net effect: anyone holding just the public anon key can call
-- POST /rest/v1/rpc/get_admin_dashboard_order_stats with no session at all and read
-- live business-sensitive metrics (total revenue, customer count, order-status
-- breakdown). Confirmed live via an unauthenticated anon-key call on 2026-10-01
-- (during the deep-dive audit that produced this fix): returned real aggregated
-- data with HTTP 200, no 401/42501.
--
-- Fix: switch to plpgsql and add the same is_admin_authenticated() guard the
-- push-token accessor functions already use — the aggregation query itself is
-- unchanged.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_order_stats()
RETURNS TABLE (
  total_orders bigint,
  total_customers bigint,
  total_sales numeric,
  placed_orders bigint,
  confirmed_orders bigint,
  shipped_orders bigint,
  delivered_orders bigint,
  cancelled_orders bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_authenticated() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    count(*) AS total_orders,
    count(DISTINCT customer_id) AS total_customers,
    -- Revenue excludes cancelled orders and unpaid online-payment orders
    -- (an order abandoned mid-payment that never got auto-cancelled should
    -- not count as real revenue) — mirrors shopkeeper.controller.ts's
    -- getIncomingOrders gate: cod always counts, everything else only once paid.
    coalesce(sum(total_amount) FILTER (
      WHERE status <> 'order_cancelled'
        AND (payment_method = 'cod' OR payment_status = 'paid')
    ), 0) AS total_sales,
    count(*) FILTER (WHERE status IN ('pending_at_store', 'store_accepted')) AS placed_orders,
    count(*) FILTER (WHERE status IN ('preparing_order', 'ready_for_pickup')) AS confirmed_orders,
    count(*) FILTER (WHERE status IN ('delivery_partner_assigned', 'picking_up', 'order_picked_up', 'in_transit')) AS shipped_orders,
    count(*) FILTER (WHERE status = 'order_delivered') AS delivered_orders,
    count(*) FILTER (WHERE status = 'order_cancelled') AS cancelled_orders
  FROM public.customer_orders;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_order_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_order_stats() TO service_role, anon, authenticated;
