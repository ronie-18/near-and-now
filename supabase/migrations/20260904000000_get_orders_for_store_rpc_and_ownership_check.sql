-- Converts the store-owner app's untracked supabase/orders-rpc-and-rls.sql
-- into a real, tracked migration, and closes a live anon-callable data-leak
-- hole found while auditing it (2026-07-27): get_orders_for_store() already
-- existed live (confirmed via `supabase db query` against the linked
-- project) with EXECUTE granted to anon and NO caller-identity check inside
-- the function body — since it's SECURITY DEFINER (bypasses RLS on purpose,
-- to read store_orders/customer_orders/order_items regardless of RLS),
-- anyone holding the app's public anon key could call it with *any* store's
-- UUID and read that store's full order/customer/item data. Same
-- vulnerability class already fixed for finalize_order_if_ready
-- (20260810000000).
--
-- Fixed by adding an ownership check using shopkeeper_owns_store()
-- (20260820000000_close_anon_write_rls_holes.sql), which already reads the
-- x-shopkeeper-token header the app's Supabase client already attaches to
-- every request (lib/supabase.ts in near-now-store_owner) — no app-side
-- change needed. A caller without a valid token for this specific store now
-- gets an empty array instead of the store's real order data, matching how
-- the app already treats "no orders" today (this mirrors an authorization
-- check, not a business-logic error, so failing to an empty result rather
-- than raising keeps the app's existing empty-state handling correct).
--
-- anon/authenticated EXECUTE grants are kept (unlike finalize_order_if_ready,
-- which was revoked entirely) because this function IS genuinely called
-- directly from the client with the anon key — near-now-store_owner's
-- lib/orders-db.ts calls supabase.rpc('get_orders_for_store', ...) as its
-- first-choice order-loading path, not proxied through the backend.

CREATE OR REPLACE FUNCTION public.get_orders_for_store(p_store_id uuid)
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
  ) AS ordered;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_for_store(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_orders_for_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_for_store(uuid) TO service_role;

COMMENT ON FUNCTION public.get_orders_for_store(uuid) IS
  'Returns orders for a store (store_orders + customer_orders + order_items) for the store-owner app''s RPC-first order-loading path. SECURITY DEFINER to bypass RLS, gated by shopkeeper_owns_store() so only a caller with a valid session for that specific store gets real data back — an unauthorized/mismatched caller gets an empty array, not an error.';
