-- =============================================================================
-- Closes a set of unauthenticated RLS write holes found while working on the
-- admin-panel permission-enforcement fix, in the baseline snapshot migration
-- 20260813000000_baseline_missing_tables_and_types.sql: five tables had a
-- `FOR INSERT TO anon WITH CHECK (true)` policy (products additionally had an
-- equally unrestricted UPDATE policy) — meaning anyone holding the app's
-- public anon key (bundled in every client install, not a secret) could write
-- directly to these tables with zero authentication at all, admin session or
-- otherwise. RLS policies are OR'd per role, so these stood regardless of how
-- restrictive any other policy on the same table was.
--
-- order_items / store_orders: safe to just drop the anon policy outright —
-- every real insert into these already goes through the backend's
-- service-role client (database.service.ts / shopkeeper.controller.ts),
-- which bypasses RLS entirely. Nothing legitimate used the anon path.
--
-- products / categories / master_products: NOT safe to just drop — the
-- shopkeeper mobile app's real "add custom product to my store" feature
-- (near-now-store_owner/lib/storeProducts.ts) writes directly via the plain
-- anon key (that app has no real Supabase Auth session, same as the rider
-- app — custom phone-OTP + its own session token instead). Replaced the
-- blanket anon policies with ones scoped to a real, live shopkeeper session,
-- via a new x-shopkeeper-token header the app now sends (mirroring the admin
-- panel's existing x-admin-token / is_admin_authenticated() pattern).
-- =============================================================================

-- 1. order_items / store_orders — drop, no legitimate anon-key writer exists.
DROP POLICY IF EXISTS "Allow anon insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow anon insert store_orders" ON public.store_orders;

-- 2. Shopkeeper session validation, mirroring is_admin_authenticated()'s
--    header-read pattern. Matches requireShopkeeper's own session-expiry
--    check (backend/src/controllers/shopkeeper.controller.ts) so a token the
--    backend already considers expired can't still write here.
CREATE OR REPLACE FUNCTION public.shopkeeper_authenticated()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_token TEXT;
BEGIN
  BEGIN
    v_token := (current_setting('request.headers', true)::jsonb) ->> 'x-shopkeeper-token';
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.app_users
    WHERE session_token = v_token
      AND role = 'shopkeeper'
      AND (
        session_token_issued_at IS NULL
        OR session_token_issued_at > (NOW() - INTERVAL '30 days')
      )
  );
END;
$$;

-- 3. Same, plus ownership of the specific store being written to — used for
--    `products`, which is per-store inventory (unlike categories/
--    master_products, which are a shared catalog with no store to scope to).
CREATE OR REPLACE FUNCTION public.shopkeeper_owns_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_token TEXT;
BEGIN
  BEGIN
    v_token := (current_setting('request.headers', true)::jsonb) ->> 'x-shopkeeper-token';
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.app_users u
    JOIN public.stores s ON s.owner_id = u.id
    WHERE u.session_token = v_token
      AND u.role = 'shopkeeper'
      AND s.id = p_store_id
      AND (
        u.session_token_issued_at IS NULL
        OR u.session_token_issued_at > (NOW() - INTERVAL '30 days')
      )
  );
END;
$$;

-- 4. products — replace both unrestricted anon policies with store-ownership-scoped ones.
DROP POLICY IF EXISTS anon_insert_products ON public.products;
DROP POLICY IF EXISTS anon_update_products ON public.products;

CREATE POLICY "shopkeeper_own_store_write" ON public.products
  FOR INSERT
  WITH CHECK (public.shopkeeper_owns_store(store_id));

CREATE POLICY "shopkeeper_own_store_update" ON public.products
  FOR UPDATE
  USING (public.shopkeeper_owns_store(store_id))
  WITH CHECK (public.shopkeeper_owns_store(store_id));

-- 5. categories / master_products — shared catalog, no store to scope to;
--    any live shopkeeper session may add a new entry (matches the existing
--    "add custom product" feature's actual behavior — it was never scoped
--    to one store's catalog additions in the first place). Admin already has
--    full read/write via the separate admin_full_access policy on both.
DROP POLICY IF EXISTS categories_insert_anon ON public.categories;
CREATE POLICY "shopkeeper_can_add_category" ON public.categories
  FOR INSERT
  WITH CHECK (public.shopkeeper_authenticated());

DROP POLICY IF EXISTS master_products_insert_anon ON public.master_products;
CREATE POLICY "shopkeeper_can_add_master_product" ON public.master_products
  FOR INSERT
  WITH CHECK (public.shopkeeper_authenticated());
