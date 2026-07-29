-- =============================================================================
-- Admin-review gate for shopkeeper "Add Custom Product" submissions.
--
-- Previously (20260820000000_close_anon_write_rls_holes.sql) any live
-- shopkeeper session could INSERT directly into the shared `master_products`
-- catalog via the mobile app's Supabase client (near-now-store_owner/
-- lib/storeProducts.ts addCustomMasterProduct) — no review, no store scoping,
-- and the mobile form never collects hsn_code/gst_rate/cgst/sgst at all, so
-- every custom product silently got gst_rate = NULL, which
-- invoice.service.ts's `info?.gst_rate ?? 0` coerces to 0% GST on real
-- invoices — a tax-compliance bug, not just a review gap.
--
-- This table is a staging area: shopkeeper submissions land here as
-- 'pending' and are only ever promoted into master_products (+ linked into
-- the submitting store's `products` row) once an admin reviews and supplies
-- the HSN/GST fields the shopkeeper never provides. Modeled directly on
-- store_profile_change_requests (20260831000000) + its atomicity fix
-- (20260901000000) — same row-locked "one function does the check + both
-- dependent writes" shape, same service_role-only access (all reads/writes
-- go through the Express backend, matching store_profile_change_requests'
-- reasoning: this app has no real Supabase Auth session to hang RLS off of).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  submitted_by      UUID NOT NULL REFERENCES public.app_users(id),

  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  brand             TEXT,
  description       TEXT,
  image_url         TEXT NOT NULL,
  base_price        NUMERIC NOT NULL,
  discounted_price  NUMERIC NOT NULL,
  unit              TEXT NOT NULL,
  is_loose          BOOLEAN NOT NULL DEFAULT false,
  min_quantity      NUMERIC NOT NULL DEFAULT 1,
  max_quantity      NUMERIC NOT NULL DEFAULT 100,

  -- Filled in by the admin at review time — the shopkeeper form never
  -- collects these, so they must not be trusted from the submission itself.
  hsn_code          TEXT,
  hsn_description   TEXT,
  gst_rate          NUMERIC(5,2),
  cgst              NUMERIC(5,2),
  sgst              NUMERIC(5,2),

  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason  TEXT,
  reviewed_by       UUID,
  reviewed_at       TIMESTAMPTZ,
  -- Set once approved, pointing at the row created in master_products.
  master_product_id UUID REFERENCES public.master_products(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (base_price >= 0),
  CHECK (discounted_price >= 0),
  CHECK (discounted_price <= base_price),
  CHECK (min_quantity > 0),
  CHECK (max_quantity >= min_quantity)
);

CREATE INDEX IF NOT EXISTS idx_product_submissions_store_status
  ON public.product_submissions (store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_submissions_status
  ON public.product_submissions (status, created_at DESC);

ALTER TABLE public.product_submissions ENABLE ROW LEVEL SECURITY;

-- service_role only — no client-facing RLS policy is added on purpose. Both
-- the shopkeeper submit/list endpoints and the admin review endpoints go
-- through the Express backend using supabaseAdmin, same as
-- store_profile_change_requests / order_addition_requests.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_submissions TO service_role;

-- Atomically review a pending submission: locks the row, re-checks it's
-- still 'pending' under that lock (same race this project has hit and fixed
-- before — see store_profile_change_requests' own atomicity migration), and
-- on approval: ensures the category row exists, inserts the new
-- master_products row (using the admin-supplied HSN/GST fields — required,
-- never NULL, closing the tax-compliance gap above), links it into the
-- submitting store's `products` catalog, and marks the submission reviewed —
-- all in one transaction. On rejection, just marks it reviewed.
CREATE OR REPLACE FUNCTION public.review_product_submission(
  p_submission_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT,
  p_reviewed_by UUID,
  p_hsn_code TEXT,
  p_hsn_description TEXT,
  p_gst_rate NUMERIC,
  p_cgst NUMERIC,
  p_sgst NUMERIC
)
RETURNS public.product_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.product_submissions%ROWTYPE;
  v_master_id UUID;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT * INTO v_sub
  FROM public.product_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Someone else already reviewed this between the caller's own fetch and
  -- this call — distinct exception so the caller 409s instead of silently
  -- re-promoting an already-resolved submission.
  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_REVIEWED:%', v_sub.status;
  END IF;

  IF p_status = 'approved' THEN
    IF p_gst_rate IS NULL OR p_hsn_code IS NULL OR btrim(p_hsn_code) = '' THEN
      RAISE EXCEPTION 'HSN_GST_REQUIRED';
    END IF;

    INSERT INTO public.categories (name, display_order)
    VALUES (v_sub.category, 0)
    ON CONFLICT (name) DO NOTHING;

    INSERT INTO public.master_products (
      name, category, brand, description, image_url,
      base_price, discounted_price, unit, is_loose,
      min_quantity, max_quantity, is_active,
      hsn_code, hsn_description, gst_rate, cgst, sgst
    ) VALUES (
      v_sub.name, v_sub.category, v_sub.brand, v_sub.description, v_sub.image_url,
      v_sub.base_price, v_sub.discounted_price, v_sub.unit, v_sub.is_loose,
      v_sub.min_quantity, v_sub.max_quantity, true,
      btrim(p_hsn_code), p_hsn_description, p_gst_rate, p_cgst, p_sgst
    )
    RETURNING id INTO v_master_id;

    -- Links it into the submitting shopkeeper's own store — the intent of
    -- "add custom product" was always to sell it, not just add it to the
    -- shared catalog for someone else to pick up later.
    INSERT INTO public.products (store_id, master_product_id, is_active)
    VALUES (v_sub.store_id, v_master_id, true)
    ON CONFLICT (store_id, master_product_id) DO NOTHING;
  END IF;

  UPDATE public.product_submissions SET
    status = p_status,
    master_product_id = v_master_id,
    rejection_reason = CASE WHEN p_status = 'rejected' THEN p_rejection_reason ELSE NULL END,
    reviewed_by = p_reviewed_by,
    reviewed_at = NOW()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;

REVOKE ALL ON FUNCTION public.review_product_submission(UUID, TEXT, TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_product_submission(UUID, TEXT, TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) TO service_role;

-- Shopkeepers no longer write master_products directly — every custom
-- product now goes through product_submissions above instead. The mobile
-- app's insert target changes accordingly (lib/storeProducts.ts).
DROP POLICY IF EXISTS "shopkeeper_can_add_master_product" ON public.master_products;
