-- =============================================================================
-- admin/src/services/adminService.ts's getProductCountsByCategory() (used by
-- CategoriesPage and, via its "categories with products" count, the admin
-- Dashboard) paginated through the ENTIRE master_products table client-side
-- (45+ sequential 1000-row requests against a 44k+-row table) just to GROUP
-- BY category client-side. Confirmed live: this is unreliable enough to
-- intermittently fail outright as "Failed to fetch" from the browser, not
-- just slow. Replaced with a single server-side aggregate query.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_product_counts_by_category()
RETURNS TABLE (category TEXT, product_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT category, COUNT(*) AS product_count
  FROM public.master_products
  GROUP BY category;
$$;

-- Admin panel calls this via getAdminClient() (anon key + x-admin-token
-- header), same access model as every other admin-read RPC/table.
GRANT EXECUTE ON FUNCTION public.get_product_counts_by_category() TO anon, authenticated;
