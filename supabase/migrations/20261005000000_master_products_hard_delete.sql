-- Let an admin permanently delete a master product, even one that stores
-- stock and customers have ordered (2026-10-05, product-owner decision:
-- "delete entirely, not archive").
--
-- What blocked it:
--   * products.master_product_id → master_products  ON DELETE RESTRICT
--     (any store listing of the product blocked the delete);
--   * order_items.product_id → products               ON DELETE RESTRICT
--     (a store listing that was ever ordered could not go either);
--   * product_submissions.master_product_id → master_products (NO ACTION).
--
-- After this migration, deleting a master_products row:
--   * deletes every store's listing of it (products, CASCADE);
--   * keeps every past order intact: order_items already snapshots
--     product_name / unit / image_url / unit_price, its product_id just
--     becomes NULL (SET NULL), and the line's tax data (HSN, GST rate, loose
--     flag) is copied onto the line first (trigger below) so invoices for
--     those orders stay correct;
--   * unlinks approved product submissions (SET NULL) — the submission row
--     and its own copy of the product details stay;
--   * deletes its wishlist entries, reviews, images, attributes, details and
--     variants (those were already ON DELETE CASCADE).
--
-- Reads that join order_items to products already tolerate a missing row
-- (no inner joins); the backend changes shipped with this migration handle a
-- NULL order_items.product_id explicitly.

-- 1. Tax snapshot columns on order lines (filled only when the product goes).
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_hsn_code TEXT,
  ADD COLUMN IF NOT EXISTS product_gst_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS product_is_loose BOOLEAN;

COMMENT ON COLUMN public.order_items.product_hsn_code IS
  'HSN code of the product at the time its catalogue row was deleted (NULL while the product exists — read it via products → master_products).';
COMMENT ON COLUMN public.order_items.product_gst_rate IS
  'GST rate of the product at the time its catalogue row was deleted (see product_hsn_code).';
COMMENT ON COLUMN public.order_items.product_is_loose IS
  'Loose-product flag at the time the catalogue row was deleted (see product_hsn_code).';

-- 2. The snapshot itself. Two triggers, because a master delete removes the
--    store rows via CASCADE *after* the master row is gone (so the products
--    trigger can't read it then), while a direct delete of one store row still
--    has its master. SECURITY DEFINER: the admin panel deletes through the
--    anon role (RLS + x-admin-token), which has no UPDATE on order_items.
CREATE OR REPLACE FUNCTION public.snapshot_order_item_tax_before_master_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.order_items oi
  SET product_hsn_code = COALESCE(oi.product_hsn_code, OLD.hsn_code),
      product_gst_rate = COALESCE(oi.product_gst_rate, OLD.gst_rate),
      product_is_loose = COALESCE(oi.product_is_loose, OLD.is_loose)
  FROM public.products p
  WHERE p.master_product_id = OLD.id
    AND oi.product_id = p.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_order_item_tax_before_product_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.order_items oi
  SET product_hsn_code = COALESCE(oi.product_hsn_code, m.hsn_code),
      product_gst_rate = COALESCE(oi.product_gst_rate, m.gst_rate),
      product_is_loose = COALESCE(oi.product_is_loose, m.is_loose)
  FROM public.master_products m
  WHERE m.id = OLD.master_product_id
    AND oi.product_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_order_item_tax_before_master_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.snapshot_order_item_tax_before_product_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS snapshot_order_item_tax ON public.master_products;
CREATE TRIGGER snapshot_order_item_tax
  BEFORE DELETE ON public.master_products
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_tax_before_master_delete();

DROP TRIGGER IF EXISTS snapshot_order_item_tax ON public.products;
CREATE TRIGGER snapshot_order_item_tax
  BEFORE DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_tax_before_product_delete();

-- 3. Order lines outlive their product row.
ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- 4. A master product takes its store listings with it.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_master_product_id_fkey;
ALTER TABLE public.products
  ADD CONSTRAINT products_master_product_id_fkey
  FOREIGN KEY (master_product_id) REFERENCES public.master_products(id) ON DELETE CASCADE;

-- 5. Product submissions are unlinked, not blocking. The constraint was
--    declared inline, so its name is looked up rather than assumed.
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.product_submissions'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.master_products'::regclass
      AND a.attname = 'master_product_id'
  LOOP
    EXECUTE format('ALTER TABLE public.product_submissions DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE public.product_submissions
  ADD CONSTRAINT product_submissions_master_product_id_fkey
  FOREIGN KEY (master_product_id) REFERENCES public.master_products(id) ON DELETE SET NULL;

-- 6. Anything else in the live database that would still block the delete
--    (a constraint created outside tracked migrations). Reported, not
--    changed: its right ON DELETE behaviour can't be guessed here. If this
--    warns, a delete of an affected product fails with that constraint's
--    name, and it needs its own follow-up.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname, c.confrelid::regclass AS ref
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid IN ('public.master_products'::regclass, 'public.products'::regclass)
      AND c.confdeltype IN ('a', 'r') -- NO ACTION / RESTRICT
  LOOP
    RAISE WARNING 'Still blocks deleting from %: % on %', r.ref, r.conname, r.tbl;
  END LOOP;
END $$;
