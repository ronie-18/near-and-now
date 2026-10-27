-- 2026-10-27 deep dive: what the public anon key (bundled in every app and
-- the website) could still read, run or overwrite. Each item was confirmed
-- against production before this was written (counts and no-op calls only).
--
-- 1. Coupon functions anyone could run. These were created with a GRANT to
--    service_role but no REVOKE, so PUBLIC kept its default EXECUTE
--    (proacl `=X/postgres`). As the public key:
--      - release_coupon_usage_for_order(order_id) deletes that order's
--        redemption and gives the use back, so a customer could reset their
--        own one-time coupon after every order and reuse it indefinitely;
--      - record_coupon_redemption_if_available / increment_coupon_usage_if_available
--        burn a coupon's usage_limit for everyone.
--    Only the backend (service_role, which keeps its explicit grant) calls them.
--    auto_offline_stale_drivers had the same gap (anyone could force idle
--    riders offline); also backend-only.
--    REVOKE FROM PUBLIC is enough in this project: there are no default
--    EXECUTE grants to anon/authenticated (checked: review_rider_profile_change_request,
--    revoked from PUBLIC only, answers anon with 42501).
REVOKE EXECUTE ON FUNCTION public.release_coupon_usage_for_order(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_coupon_redemption_if_available(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage_if_available(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_offline_stale_drivers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_coupon_usage_for_order(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_coupon_redemption_if_available(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage_if_available(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_offline_stale_drivers() TO service_role;

-- 2. admins: every active admin's email, name, role, permissions and last
--    login were readable without signing in. The baseline policy
--    "Allow read active admins for authentication" (anon, USING status =
--    'active') predates server-side login (POST /api/admin/login reads admins
--    with the service role) and was never dropped when 20260930220000 added
--    the token-gated "admin_read". The admin panel reads admins only through
--    getAdminClient() (x-admin-token), which "admin_read" covers. With the
--    emails public, anyone could also lock every admin out through the
--    email-keyed login rate limit.
DROP POLICY IF EXISTS "Allow read active admins for authentication" ON public.admins;

-- 3. stores: "public_read" (USING true) exposed all 66 rows — 52 never
--    approved, 50 deleted — with the owner's login phone, address, owner_id
--    and owner photo. Replaced by three narrower reads:
--      - anyone: stores customers can actually order from (approved, online,
--        not deleted) — exactly what the customer app, the website and the
--        catalogue RPCs already filter to;
--      - a shopkeeper: their own stores in any state (shopkeeper_owns_store,
--        x-shopkeeper-token) — the app's approval check reads its own row;
--      - an admin: every store (x-admin-token). Nothing granted the panel its
--        reads before except public_read itself.
--    The two older "is_active = true" policies are folded into the first.
--    Realtime cannot see the x-*-token headers, so the admin Stores page and
--    the shopkeeper approval gate now get live events only for public stores;
--    both already poll (3 min / 30 s) and refresh on focus.
--    Columns stay as granted: every client uses the anon role, so a column
--    revoke would also hide them from the admin panel.
DROP POLICY IF EXISTS "public_read" ON public.stores;
DROP POLICY IF EXISTS "anon_read_stores" ON public.stores;
DROP POLICY IF EXISTS "Allow read for tracking map" ON public.stores;

CREATE POLICY "stores_public_read" ON public.stores
  FOR SELECT TO anon, authenticated
  USING (is_active = true AND is_approved = true AND deleted_at IS NULL);

CREATE POLICY "stores_owner_read" ON public.stores
  FOR SELECT TO anon, authenticated
  USING (public.shopkeeper_owns_store(id));

-- Wrapped in a sub-select so it runs once per query (InitPlan), not per row.
CREATE POLICY "stores_admin_read" ON public.stores
  FOR SELECT TO anon, authenticated
  USING ((SELECT public.is_admin_authenticated()));

--    products.phone: fill_product_store_info copied the store owner's login
--    phone onto every product row, and products is readable by anyone
--    (anon_select_products, the catalogue). Nothing reads the column. The
--    trigger now copies the store name only, clears phone, and also runs on
--    UPDATE: shopkeeper app builds up to 1.1.x still send `phone` on both
--    insert and update, and a CHECK constraint would reject those writes.
CREATE OR REPLACE FUNCTION public.fill_product_store_info()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT s.name INTO NEW.name
  FROM public.stores s
  WHERE s.id = NEW.store_id;
  NEW.phone := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_product_store_info ON public.products;
CREATE TRIGGER trg_fill_product_store_info
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fill_product_store_info();

-- Existing rows: clear the phone and refresh the copied store name (only 9 of
-- 250 still matched). updated_at is left alone — nothing about the product
-- itself changed.
ALTER TABLE public.products DISABLE TRIGGER update_products_updated_at;
UPDATE public.products p
SET phone = NULL, name = s.name
FROM public.stores s
WHERE s.id = p.store_id
  AND (p.phone IS NOT NULL OR p.name IS DISTINCT FROM s.name);
ALTER TABLE public.products ENABLE TRIGGER update_products_updated_at;

-- 4. Categories: master_products.category referenced categories(name) ON
--    DELETE CASCADE, so deleting a category would delete every product in it
--    and, since 20261005000000, every store's listing of those products. The
--    admin panel refuses to delete a non-empty category (live count right
--    before the delete), but any other path — SQL editor, a future endpoint —
--    would cascade. RESTRICT makes the database refuse instead, which is what
--    adminService.deleteCategory's comment already anticipates.
ALTER TABLE public.master_products DROP CONSTRAINT IF EXISTS master_products_category_fkey;
ALTER TABLE public.master_products
  ADD CONSTRAINT master_products_category_fkey
  FOREIGN KEY (category) REFERENCES public.categories(name) ON DELETE RESTRICT;

-- 5. Storage. The public key could overwrite or delete any object in
--    product-images (the catalogue photos), and do anything in the four
--    store/owner/rider photo buckets. The mobile apps upload straight to
--    those buckets with the anon key (upsert: true needs SELECT + INSERT +
--    UPDATE), and Storage policies cannot see the apps' x-*-token headers, so
--    writes stay open until uploads move behind the backend. What no client
--    uses is closed now:
--      - product-images: the admin uploads with upsert: false (INSERT only)
--        and never deletes through Storage (deleteProductImage has no caller);
--        the backend writes with the service role. Drop anon UPDATE + DELETE.
--      - store-images, store-owner-images, delivery_partner_image,
--        delivery_partner_vehicle: no client ever deletes. The anon ALL
--        policies become SELECT + INSERT + UPDATE (no DELETE).
DROP POLICY IF EXISTS "ALLOW  16wiy3a_2" ON storage.objects; -- product-images UPDATE
DROP POLICY IF EXISTS "ALLOW  16wiy3a_3" ON storage.objects; -- product-images DELETE

DO $$
DECLARE
  b TEXT;
BEGIN
  FOREACH b IN ARRAY ARRAY['store-images', 'store-owner-images', 'delivery_partner_image', 'delivery_partner_vehicle'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'anon write ' || b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'anon read ' || b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'anon upload ' || b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'anon update ' || b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO anon USING (bucket_id = %L)', 'anon read ' || b, b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = %L)', 'anon upload ' || b, b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO anon USING (bucket_id = %L) WITH CHECK (bucket_id = %L)', 'anon update ' || b, b, b);
  END LOOP;
END $$;
