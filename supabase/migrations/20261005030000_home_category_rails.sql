-- Website home page category rails, computed in the database (2026-10-05).
--
-- The home page downloaded every product row of every nearby store (with its
-- master product, description included) to show at most 6 products per
-- category. This returns just those rows plus each category's total, so
-- "See all" still appears exactly when a category has more than 6.
--
-- Same rules as the page's previous getAllProducts() path
-- (frontend/src/services/supabase.ts fetchProductRows + productRowsToProducts):
--   * a row counts when products.is_active and master_products.is_active and
--     its store is one of p_store_ids;
--   * one entry per master product: its row with the lowest products.id;
--   * catalogue order is that row's products.id, ascending;
--   * a category's rail is its first p_per_category entries in that order.
-- Rows come back in the same shape the page already maps (products row +
-- nested master_products with the same columns), so price/GST mapping is
-- shared with every other catalogue read.
--
-- SECURITY INVOKER (the default): the caller's row-level security applies,
-- as for the direct catalogue reads it replaces.

CREATE OR REPLACE FUNCTION public.get_home_category_rails(p_store_ids uuid[], p_per_category integer DEFAULT 6)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH eligible AS (
    SELECT p.id, p.store_id, p.master_product_id, p.product_name, p.is_active, m.category,
           row_number() OVER (PARTITION BY p.master_product_id ORDER BY p.id) AS rn_master
    FROM products p
    JOIN master_products m ON m.id = p.master_product_id
    WHERE p.is_active AND m.is_active AND p.store_id = ANY (p_store_ids)
  ),
  entries AS (
    SELECT e.*,
           row_number() OVER (PARTITION BY e.category ORDER BY e.id) AS rn_cat
    FROM eligible e
    WHERE e.rn_master = 1
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', x.id,
               'store_id', x.store_id,
               'master_product_id', x.master_product_id,
               'product_name', x.product_name,
               'is_active', x.is_active,
               'master_products', (
                 SELECT to_jsonb(mm) FROM (
                   SELECT m.id, m.name, m.category, m.base_price, m.discounted_price, m.unit, m.image_url,
                          m.description, m.is_loose, m.is_active, m.created_at, m.updated_at, m.gst_rate,
                          m.rating, m.rating_count
                   FROM master_products m WHERE m.id = x.master_product_id
                 ) mm)
             ) ORDER BY x.id)
      FROM entries x
      WHERE x.rn_cat <= p_per_category
    ), '[]'::jsonb),
    'totals', COALESCE((
      SELECT jsonb_object_agg(t.category, t.n)
      FROM (SELECT category, count(*) AS n FROM entries WHERE category IS NOT NULL GROUP BY category) t
    ), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_home_category_rails(uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_home_category_rails(uuid[], integer) TO anon, authenticated, service_role;
