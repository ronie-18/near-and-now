-- editProductSubmission (backend/src/controllers/productSubmissions.controller.ts)
-- now lets an admin save hsn_code/gst_rate/etc. onto a pending submission
-- ahead of time via Edit, same as any other field. But review_product_submission
-- only ever looked at the hsn/gst values passed directly to THIS call, so an
-- approve request that didn't re-send them failed with HSN_GST_REQUIRED even
-- though the row already had them saved. Falls back to the submission's own
-- stored values (COALESCE) so approving doesn't require re-supplying values
-- that were already set — same fields, same required-ness check, just
-- sourced from either place.
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
  v_hsn_code TEXT;
  v_hsn_description TEXT;
  v_gst_rate NUMERIC;
  v_cgst NUMERIC;
  v_sgst NUMERIC;
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

  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_REVIEWED:%', v_sub.status;
  END IF;

  v_hsn_code := COALESCE(NULLIF(btrim(p_hsn_code), ''), v_sub.hsn_code);
  v_hsn_description := COALESCE(p_hsn_description, v_sub.hsn_description);
  v_gst_rate := COALESCE(p_gst_rate, v_sub.gst_rate);
  v_cgst := COALESCE(p_cgst, v_sub.cgst);
  v_sgst := COALESCE(p_sgst, v_sub.sgst);

  IF p_status = 'approved' THEN
    IF v_gst_rate IS NULL OR v_hsn_code IS NULL OR btrim(v_hsn_code) = '' THEN
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
      btrim(v_hsn_code), v_hsn_description, v_gst_rate, v_cgst, v_sgst
    )
    RETURNING id INTO v_master_id;

    INSERT INTO public.products (store_id, master_product_id, is_active)
    VALUES (v_sub.store_id, v_master_id, true)
    ON CONFLICT (store_id, master_product_id) DO NOTHING;
  END IF;

  UPDATE public.product_submissions SET
    status = p_status,
    master_product_id = v_master_id,
    hsn_code = CASE WHEN p_status = 'approved' THEN btrim(v_hsn_code) ELSE hsn_code END,
    hsn_description = CASE WHEN p_status = 'approved' THEN v_hsn_description ELSE hsn_description END,
    gst_rate = CASE WHEN p_status = 'approved' THEN v_gst_rate ELSE gst_rate END,
    cgst = CASE WHEN p_status = 'approved' THEN v_cgst ELSE cgst END,
    sgst = CASE WHEN p_status = 'approved' THEN v_sgst ELSE sgst END,
    rejection_reason = CASE WHEN p_status = 'rejected' THEN p_rejection_reason ELSE NULL END,
    reviewed_by = p_reviewed_by,
    reviewed_at = NOW()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;
