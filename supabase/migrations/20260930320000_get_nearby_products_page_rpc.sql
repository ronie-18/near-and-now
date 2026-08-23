-- Server-side paginated, deduped, filtered, sorted product listing for the
-- website's Shop page. `getAllProducts`/`fetchProductRows`
-- (frontend/src/services/supabase.ts) previously fetched every `products`
-- row (joined to master_products) for every nearby/eligible store, 500 at a
-- time until exhausted, deduped by master_product_id entirely in JS — for a
-- catalog of a few hundred products across nearby stores, that meant
-- downloading (and, before an earlier fix the same audit pass, rendering)
-- the whole result on every location/filter change. Found 2026-08-23,
-- deliberately deferred at the time as "customer-facing and
-- correctness-sensitive... out of scope for this pass" — revisited now.
--
-- Design choice made specifically to minimize risk on this customer-facing
-- path: the row DATA this returns is exactly what the frontend's existing,
-- unchanged `transformProductRowToProduct()` already expects (a `products`
-- row nested with its `master_products` row) — no GST-inclusive display
-- price is computed or returned here, so there is zero risk of a displayed
-- price ever diverging from what that function computes. GST-inclusive
-- price IS computed here, but *only* internally, to filter (price range,
-- "deals only") and sort (price-asc/desc) against the same effective price
-- ShopPage.tsx already filters/sorts by client-side today — mirroring
-- transformProductRowToProduct's exact formula (price = discounted_price *
-- (1 + gst_rate/100), gst_rate forced to 0 for loose items, original_price
-- the same formula against base_price). This is pure arithmetic (no
-- business-rule edge cases), verified against real rows before being wired
-- into the frontend.
--
-- Store eligibility (`p_store_ids`) is resolved entirely in JS beforehand,
-- exactly as today (getNearbyStoreIdsExpanding's radius-expansion logic is
-- untouched) — NULL here means "no location filter", mirroring
-- fetchProductRows(null)'s existing fallback to every approved+active store.
--
-- Dedup: DISTINCT ON (mp.id), tiebroken by p.id for a stable (not truly
-- meaningful) choice of which store's row wins when multiple stores stock
-- the same master product — the existing JS dedup already picked an
-- effectively arbitrary winner too (rows had no ORDER BY before reaching
-- productRowsToProducts' Map-based first-write-wins dedup), so this isn't a
-- behavior regression, just a differently-arbitrary-but-now-deterministic
-- pick. The only field that could visibly differ per winner is
-- product_name (a per-store override) — price/category/image/etc. all come
-- from master_products, identical regardless of which store's row wins.
--
-- Sort: 'default' resolves to a stable alphabetical order rather than true
-- randomization — `ORDER BY random() LIMIT x OFFSET y` is a well-known
-- pagination anti-pattern (each call re-randomizes independently, so
-- clicking "Load More" can skip or repeat items across pages). The
-- previous ShopPage.tsx behavior did a one-time client-side Fisher-Yates
-- shuffle of the *entire* fetched result per load; a paginated RPC can't
-- reproduce that without either fetching everything (defeating the point)
-- or accepting duplicate/missing items across "Load More" clicks, so this
-- deliberately trades true per-load randomization for pagination
-- correctness.
-- Drops the original 6-param version this same migration file previously
-- created earlier the same session (before deals-only/price-range filtering
-- was added) — CREATE OR REPLACE with a different argument list creates a
-- second overload rather than replacing it, which would make PostgREST's
-- RPC resolution ambiguous for any named-parameter call. Same lesson
-- already applied to get_orders_for_store's optional-limit migration
-- earlier today.
DROP FUNCTION IF EXISTS public.get_nearby_products_page(uuid[], text, text, text, int, int);

CREATE OR REPLACE FUNCTION public.get_nearby_products_page(
  p_store_ids uuid[],
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'default',
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0,
  p_deals_only boolean DEFAULT false,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL
)
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
    RETURN jsonb_build_object('products', '[]'::jsonb, 'total', 0);
  END IF;

  RETURN (
    WITH deduped AS (
      SELECT DISTINCT ON (mp.id)
        p.id AS p_id, p.store_id AS p_store_id, p.master_product_id, p.product_name, p.is_active AS p_is_active,
        mp.id AS mp_id, mp.name AS mp_name, mp.category, mp.base_price, mp.discounted_price, mp.unit,
        mp.image_url, mp.description, mp.is_loose, mp.is_active AS mp_is_active,
        mp.created_at, mp.gst_rate, mp.rating, mp.rating_count,
        -- Mirrors transformProductRowToProduct's exact formula — used only
        -- for filtering/sorting below, never returned to the client.
        (COALESCE(mp.discounted_price, 0) * (1 + (CASE WHEN mp.is_loose THEN 0 ELSE COALESCE(mp.gst_rate, 0) END) / 100.0)) AS eff_price,
        CASE WHEN mp.base_price IS NOT NULL THEN
          (mp.base_price * (1 + (CASE WHEN mp.is_loose THEN 0 ELSE COALESCE(mp.gst_rate, 0) END) / 100.0))
        ELSE NULL END AS eff_original_price
      FROM public.products p
      JOIN public.master_products mp ON mp.id = p.master_product_id
      WHERE p.is_active = true
        AND p.store_id = ANY(v_store_ids)
        AND mp.is_active = true
        AND (p_category IS NULL OR mp.category = p_category)
        AND (
          p_search IS NULL OR p_search = '' OR
          mp.name ILIKE '%' || p_search || '%' OR
          mp.category ILIKE '%' || p_search || '%' OR
          mp.description ILIKE '%' || p_search || '%'
        )
      ORDER BY mp.id, p.id
    ),
    filtered AS (
      SELECT * FROM deduped
      WHERE (NOT p_deals_only OR (eff_original_price IS NOT NULL AND eff_original_price > eff_price))
        AND (p_min_price IS NULL OR eff_price >= p_min_price)
        AND (p_max_price IS NULL OR eff_price <= p_max_price)
    ),
    counted AS (
      SELECT *, count(*) OVER() AS total_count FROM filtered
    ),
    paged AS (
      SELECT * FROM counted
      ORDER BY
        CASE WHEN p_sort = 'price-asc' THEN eff_price END ASC NULLS LAST,
        CASE WHEN p_sort = 'price-desc' THEN eff_price END DESC NULLS LAST,
        CASE WHEN p_sort = 'name-asc' THEN COALESCE(product_name, mp_name) END ASC,
        CASE WHEN p_sort = 'name-desc' THEN COALESCE(product_name, mp_name) END DESC,
        COALESCE(product_name, mp_name) ASC
      LIMIT p_limit OFFSET p_offset
    )
    SELECT jsonb_build_object(
      'products', COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', p_id,
          'store_id', p_store_id,
          'master_product_id', master_product_id,
          'product_name', product_name,
          'is_active', p_is_active,
          'master_products', jsonb_build_object(
            'id', mp_id,
            'name', mp_name,
            'category', category,
            'base_price', base_price,
            'discounted_price', discounted_price,
            'unit', unit,
            'image_url', image_url,
            'description', description,
            'is_loose', is_loose,
            'is_active', mp_is_active,
            'created_at', created_at,
            'gst_rate', gst_rate,
            'rating', rating,
            'rating_count', rating_count
          )
        )
      ), '[]'::jsonb),
      'total', COALESCE((SELECT total_count FROM counted LIMIT 1), 0)
    )
    FROM paged
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_products_page(uuid[], text, text, text, int, int, boolean, numeric, numeric) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_nearby_products_page(uuid[], text, text, text, int, int, boolean, numeric, numeric) IS
  'Server-side paginated/deduped/filtered/sorted product listing for a given set of eligible store ids (or NULL for every approved+active store). Returns rows shaped identically to the website''s existing ProductRow (products joined with master_products) so the frontend can keep using its unchanged price/GST transform for display — an internal GST-inclusive effective price is computed only for price-range/deals-only filtering and price sort, mirroring transformProductRowToProduct exactly.';
