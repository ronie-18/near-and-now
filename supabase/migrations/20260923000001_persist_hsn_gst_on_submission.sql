-- review_product_submission (20260923000000) inserted the admin-supplied
-- HSN/GST fields into the new master_products row but never wrote them back
-- onto the product_submissions row itself — those columns existed on the
-- table but stayed NULL forever, losing the audit trail of what was actually
-- approved. Same function, just also persists them on the final UPDATE.
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

    INSERT INTO public.products (store_id, master_product_id, is_active)
    VALUES (v_sub.store_id, v_master_id, true)
    ON CONFLICT (store_id, master_product_id) DO NOTHING;
  END IF;

  UPDATE public.product_submissions SET
    status = p_status,
    master_product_id = v_master_id,
    hsn_code = CASE WHEN p_status = 'approved' THEN btrim(p_hsn_code) ELSE hsn_code END,
    hsn_description = CASE WHEN p_status = 'approved' THEN p_hsn_description ELSE hsn_description END,
    gst_rate = CASE WHEN p_status = 'approved' THEN p_gst_rate ELSE gst_rate END,
    cgst = CASE WHEN p_status = 'approved' THEN p_cgst ELSE cgst END,
    sgst = CASE WHEN p_status = 'approved' THEN p_sgst ELSE sgst END,
    rejection_reason = CASE WHEN p_status = 'rejected' THEN p_rejection_reason ELSE NULL END,
    reviewed_by = p_reviewed_by,
    reviewed_at = NOW()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;
