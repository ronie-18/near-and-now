-- get_orders_for_store() (20260904000000) has always returned a store's
-- *entire* order history in one call — near-now-store_owner's
-- previous-orders.tsx polls it every 60s (lengthened from 15s in an earlier
-- fix this same audit pass) for the "Previous" tab, which only ever shows
-- terminal-state orders. Found during the 2026-08-23 performance audit:
-- unbounded, grows with every store's full lifetime order count.
--
-- Adds an optional p_limit parameter (default NULL = current, unbounded
-- behavior) rather than changing the existing signature outright — every
-- current caller (previous-orders.tsx AND payments.tsx, which both call
-- `supabase.rpc('get_orders_for_store', { p_store_id })` with no second
-- argument today) keeps working unchanged; only a caller that explicitly
-- opts in by passing p_limit gets a bounded result. payments.tsx's "All
-- Time" view genuinely needs full history for an accurate total, so it's
-- left calling this unbounded; previous-orders.tsx is updated (app-side, not
-- here) to pass a generous-but-bounded limit.
-- CREATE OR REPLACE with an extra parameter creates a *second*, overloaded
-- function rather than replacing the original uuid-only one — leaving both
-- live would make PostgREST's RPC resolution ambiguous (or silently pick
-- the old, still-unbounded one) for every existing single-argument caller.
-- Must drop the old signature first so there's exactly one function for
-- `get_orders_for_store` to resolve against, with p_limit's DEFAULT NULL
-- making the single-argument call shape still work unchanged.
DROP FUNCTION IF EXISTS public.get_orders_for_store(uuid);

CREATE OR REPLACE FUNCTION public.get_orders_for_store(p_store_id uuid, p_limit int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_store_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF NOT public.shopkeeper_owns_store(p_store_id) THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Cast status to text so we never pass '' to enum order_status (avoids "invalid input value for enum order_status: """
  WITH base AS (
    SELECT
      so.id,
      so.store_id,
      so.customer_order_id,
      so.subtotal_amount,
      so.delivery_fee,
      so.created_at,
      so.status::text AS so_status,
      co.order_code,
      co.status::text AS co_status,
      co.placed_at,
      co.total_amount AS co_total_amount,
      co.delivered_at AS co_delivered_at,
      co.cancelled_at AS co_cancelled_at,
      (coalesce(so.subtotal_amount, 0) + coalesce(so.delivery_fee, 0)) AS store_total,
      (SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'product_name', coalesce(oi.product_name, 'Item'),
          'quantity', coalesce(oi.quantity, 0),
          'unit', coalesce(oi.unit, 'pcs'),
          'image_url', oi.image_url,
          'price', oi.unit_price
        )
      ), '[]'::jsonb) FROM order_items oi WHERE oi.store_order_id = so.id) AS order_items
    FROM store_orders so
    LEFT JOIN customer_orders co ON co.id = so.customer_order_id
    WHERE so.store_id = p_store_id
  ),
  with_status AS (
    SELECT
      b.*,
      CASE
        WHEN b.co_delivered_at IS NOT NULL THEN 'delivered'
        WHEN b.co_cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN lower(replace(coalesce(b.co_status, ''), '-', '_')) IN ('order_delivered', 'delivered', 'completed', 'cancelled', 'canceled', 'rejected') THEN
          CASE lower(replace(b.co_status, '-', '_'))
            WHEN 'order_delivered' THEN 'delivered' WHEN 'delivered' THEN 'delivered' WHEN 'completed' THEN 'delivered'
            WHEN 'cancelled' THEN 'cancelled' WHEN 'canceled' THEN 'cancelled' WHEN 'rejected' THEN 'rejected'
            ELSE coalesce(b.so_status, 'pending_store')
          END
        WHEN b.so_status IS NOT NULL AND lower(replace(b.so_status, '-', '_')) = 'pending_at_store' THEN 'pending_store'
        ELSE coalesce(b.so_status, 'pending_store')
      END AS resolved_status
    FROM base b
  )
  SELECT COALESCE(jsonb_agg(obj), '[]'::jsonb)
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'store_id', store_id,
      'customer_order_id', customer_order_id,
      'order_code', coalesce(order_code, 'ORD-' || left(id::text, 8)),
      'status', resolved_status,
      'total_amount', CASE WHEN store_total > 0 THEN store_total ELSE coalesce(co_total_amount, 0) END,
      'created_at', coalesce(created_at::text, placed_at::text, (now() AT TIME ZONE 'utc')::text),
      'order_items', order_items
    ) AS obj
    FROM with_status
    ORDER BY created_at DESC NULLS LAST
    LIMIT p_limit
  ) AS ordered;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_for_store(uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_orders_for_store(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_for_store(uuid, int) TO service_role;

COMMENT ON FUNCTION public.get_orders_for_store(uuid, int) IS
  'Returns orders for a store (store_orders + customer_orders + order_items) for the store-owner app''s RPC-first order-loading path. SECURITY DEFINER to bypass RLS, gated by shopkeeper_owns_store(). p_limit is optional (NULL = unbounded, the original/default behavior) — LIMIT NULL is valid Postgres and returns all rows.';
