-- Extends rider_profile_change_requests / review_rider_profile_change_request
-- (20260908000000) to cover upi_id, which previously bypassed this review
-- queue entirely — saveBillingInfo (deliveryPartner.controller.ts) wrote
-- delivery_partners.upi_id directly, with no admin review and no audit
-- trail, even though the lower-stakes name/email/address fields already
-- went through review. UPI ID determines where a rider's payouts actually
-- go — higher-stakes than an identity field, but had *less* protection.
-- Found 2026-08-10 during an admin-panel audit of store/rider approval
-- flows. Mirrors the matching store-side fix
-- (20260930110000_store_profile_change_requests_bank_fields.sql) exactly.
CREATE OR REPLACE FUNCTION public.review_rider_profile_change_request(
  p_request_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT,
  p_reviewed_by UUID
)
RETURNS public.rider_profile_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.rider_profile_change_requests%ROWTYPE;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT * INTO v_request
  FROM public.rider_profile_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_REVIEWED:%', v_request.status;
  END IF;

  IF p_status = 'approved' THEN
    IF v_request.changes ? 'name' THEN
      UPDATE public.app_users SET
        name = v_request.changes -> 'name' ->> 'new',
        updated_at = NOW()
      WHERE id = v_request.rider_id;
    END IF;

    IF (v_request.changes ? 'email') OR (v_request.changes ? 'address') OR (v_request.changes ? 'upi_id') THEN
      UPDATE public.delivery_partners SET
        email = COALESCE(v_request.changes -> 'email' ->> 'new', email),
        address = COALESCE(v_request.changes -> 'address' ->> 'new', address),
        upi_id = COALESCE(v_request.changes -> 'upi_id' ->> 'new', upi_id)
      WHERE user_id = v_request.rider_id;
    END IF;
  END IF;

  UPDATE public.rider_profile_change_requests SET
    status = p_status,
    rejection_reason = CASE WHEN p_status = 'rejected' THEN p_rejection_reason ELSE NULL END,
    reviewed_by = p_reviewed_by,
    reviewed_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.review_rider_profile_change_request(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_rider_profile_change_request(UUID, TEXT, TEXT, UUID) TO service_role;
