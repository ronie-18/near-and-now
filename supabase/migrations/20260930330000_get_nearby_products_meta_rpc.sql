-- Companion to get_nearby_products_page() (20260930320000): ShopPage.tsx's
-- category filter dropdown and price-range slider's max value both need to
-- reflect the *whole* nearby catalog, computed once per location change and
-- staying stable while the user types a search or adjusts filters —
-- previously derived from the one full-catalog fetch (getAllProducts) that
-- page also used for its product list, now decoupled from that (paginated)
-- fetch into its own lightweight aggregate-only query. No dedup needed here
-- (DISTINCT/MAX are unaffected by the same master product appearing under
-- multiple stores), so this is a much cheaper query than the full paginated
-- listing.
CREATE OR REPLACE FUNCTION public.get_nearby_products_meta(p_store_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_store_ids uuid[];
BEGIN
  v_store_ids := COALESCE(
    p_store_ids,
    (SELECT array_agg(s.id) FROM public.stores s WHERE s.is_active = true AND s.is_approved = true)
  );

  IF v_store_ids IS NULL OR array_length(v_store_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('categories', '[]'::jsonb, 'max_price', 1000);
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'categories', COALESCE(jsonb_agg(DISTINCT mp.category ORDER BY mp.category) FILTER (WHERE mp.category IS NOT NULL), '[]'::jsonb),
      'max_price', GREATEST(
        1000,
        COALESCE(MAX(
          mp.discounted_price * (1 + (CASE WHEN mp.is_loose THEN 0 ELSE COALESCE(mp.gst_rate, 0) END) / 100.0)
        ), 1000)
      )
    )
    FROM public.products p
    JOIN public.master_products mp ON mp.id = p.master_product_id
    WHERE p.is_active = true
      AND p.store_id = ANY(v_store_ids)
      AND mp.is_active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_products_meta(uuid[]) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_nearby_products_meta(uuid[]) IS
  'Lightweight companion to get_nearby_products_page(): distinct category list and max effective (GST-inclusive) price across the whole nearby/eligible-store catalog, for ShopPage.tsx''s filter dropdown and price-range slider ceiling.';
