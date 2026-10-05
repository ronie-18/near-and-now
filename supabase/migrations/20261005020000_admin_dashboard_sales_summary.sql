-- Admin dashboard sales figures computed in the database (2026-10-05).
--
-- The dashboard used to download every order of the last 90 days with all
-- their store orders and items (customer_orders `*`) just to draw the sales
-- chart and the top-5 products tile. This returns only what those need:
--   daily:        per calendar day (in the admin's time zone) sales and order
--                 count of the countable orders;
--   top_products: the 5 products with the highest revenue.
-- The page rebuilds exactly the same chart, totals and period comparison
-- from `daily` (admin/src/utils/dashboardSales.ts summariseSalesFromDaily,
-- proved equal to the order-based version in admin/tests/dashboardSales.test.ts).
--
-- Rules mirrored from the page (AdminDashboardPage / adminService):
--   * window: placed_at >= p_since (getOrdersSince's filter);
--   * countable: not cancelled, and cash on delivery or paid;
--   * an order's date is placed_at, else created_at; its total is
--     total_amount rounded to whole rupees (null -> 0);
--   * products are keyed by the trimmed, lower-cased item name (empty names
--     skipped); a missing/zero quantity counts as 1, a missing price as 0;
--     the shown name and image are the first seen, newest order first;
--     sold and revenue are rounded; ties keep first-seen order.
--
-- SECURITY INVOKER (the default): the caller's row-level security applies,
-- exactly as for the direct table reads it replaces (admin panel = anon key +
-- x-admin-token).

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_sales(p_since timestamptz, p_tz text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH countable AS (
    SELECT co.id,
           COALESCE(co.placed_at, co.created_at) AS at,
           round(COALESCE(co.total_amount, 0)) AS total
    FROM customer_orders co
    WHERE co.placed_at >= p_since
      AND co.status::text <> 'order_cancelled'
      AND (co.payment_method::text = 'cod' OR co.payment_status::text = 'paid')
  ),
  daily AS (
    SELECT to_char((c.at AT TIME ZONE p_tz)::date, 'YYYY-MM-DD') AS day,
           sum(c.total) AS sales,
           count(*) AS orders
    FROM countable c
    GROUP BY 1
  ),
  items AS (
    SELECT regexp_replace(oi.product_name, '^\s+|\s+$', '', 'g') AS display,
           oi.image_url,
           CASE WHEN COALESCE(oi.quantity, 0) = 0 THEN 1 ELSE oi.quantity END AS qty,
           COALESCE(oi.unit_price, 0) AS price,
           row_number() OVER (ORDER BY c.at DESC, c.id, so.created_at, so.id, oi.created_at, oi.id) AS seen
    FROM countable c
    JOIN store_orders so ON so.customer_order_id = c.id
    JOIN order_items oi ON oi.store_order_id = so.id
    WHERE oi.product_name IS NOT NULL
  ),
  products AS (
    SELECT lower(i.display) AS k,
           (array_agg(i.display ORDER BY i.seen))[1] AS name,
           (array_agg(i.image_url ORDER BY i.seen))[1] AS image,
           round(sum(i.qty)) AS sold,
           round(sum(i.price * i.qty)) AS revenue,
           min(i.seen) AS first_seen
    FROM items i
    WHERE i.display <> ''
    GROUP BY 1
  ),
  top5 AS (
    SELECT * FROM products ORDER BY revenue DESC, first_seen LIMIT 5
  )
  SELECT jsonb_build_object(
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', d.day, 'sales', d.sales, 'orders', d.orders) ORDER BY d.day) FROM daily d), '[]'::jsonb),
    'top_products', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', t.name, 'image', t.image, 'sold', t.sold, 'revenue', t.revenue) ORDER BY t.revenue DESC, t.first_seen) FROM top5 t), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_sales(timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_sales(timestamptz, text) TO anon, authenticated, service_role;
