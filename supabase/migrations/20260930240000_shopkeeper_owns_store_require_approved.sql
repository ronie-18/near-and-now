-- shopkeeper_owns_store() (20260820000000_close_anon_write_rls_holes.sql)
-- checks store ownership only, never is_approved. The app's real
-- "add/update product" write path (lib/storeProducts.ts's upsertStoreProduct
-- / updateProductActiveState) writes straight to Supabase, gated by this
-- function via the `products` table's INSERT/UPDATE policies — so a
-- suspended store's owner could still insert/update `products` rows
-- directly via the anon-key client, even after the two backend routes
-- (deleteStoreProduct/updateProductQuantity, storeOwner.controller.ts) were
-- tightened in the same pass to require is_approved. Found 2026-08-13
-- during a full-codebase audit — this is the RLS-layer instance of the
-- same gap.
--
-- Deliberately a *new* function rather than editing shopkeeper_owns_store()
-- in place: that function is also used by get_orders_for_store()
-- (20260904000000) to gate a read-only order-history RPC, where a suspended
-- shopkeeper legitimately still needs to see their own past orders (the
-- backend's own getIncomingOrders reads work the same way, unrestricted by
-- approval) — tightening the shared function would have silently regressed
-- that read path instead of just closing the write gap this migration
-- targets.
CREATE OR REPLACE FUNCTION public.shopkeeper_owns_approved_store(p_store_id UUID)
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
      AND s.is_approved = true
      AND s.is_active = true
      AND (
        u.session_token_issued_at IS NULL
        OR u.session_token_issued_at > (NOW() - INTERVAL '30 days')
      )
  );
END;
$$;

DROP POLICY IF EXISTS "shopkeeper_own_store_write" ON public.products;
DROP POLICY IF EXISTS "shopkeeper_own_store_update" ON public.products;

CREATE POLICY "shopkeeper_own_approved_store_write" ON public.products
  FOR INSERT
  WITH CHECK (public.shopkeeper_owns_approved_store(store_id));

CREATE POLICY "shopkeeper_own_approved_store_update" ON public.products
  FOR UPDATE
  USING (public.shopkeeper_owns_approved_store(store_id))
  WITH CHECK (public.shopkeeper_owns_approved_store(store_id));
