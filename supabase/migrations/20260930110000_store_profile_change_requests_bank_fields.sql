-- Extends store_profile_change_requests / review_store_profile_change_request
-- (20260831000000 / 20260901000000) to cover bank/payout details, which
-- previously bypassed this review queue entirely — saveBillingInfo
-- (storeOwner.controller.ts) wrote stores.bank_account_number/bank_ifsc_code/
-- bank_branch_name/bank_passbook_storage_path directly, with no admin
-- review and no audit trail, even though the lower-stakes name/address/
-- phone fields already went through review. Bank account number and IFSC
-- determine where payouts actually go — higher-stakes than an identity
-- field, but had *less* protection. Found 2026-08-10 during an admin-panel
-- audit of store/rider approval flows.
--
-- Uses `changes ? 'field'` existence checks (the rider migration's pattern,
-- 20260908000000) rather than the original store migration's blind
-- COALESCE(new, existing) — existence-checked is what backend/storeOwner.
-- controller.ts's submitProfileChangeRequest()'s merge behavior actually
-- needs: a request can legitimately contain only a subset of these fields
-- (e.g. an identity change merged with a billing change, or a billing
-- change touching just the account number), and COALESCE'ing against a
-- key that was never in `changes` at all is fine either way for a scalar
-- text field, but the explicit `?` check makes the intent unambiguous and
-- matches the more recently established pattern in this codebase.
CREATE OR REPLACE FUNCTION public.review_store_profile_change_request(
  p_request_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT,
  p_reviewed_by UUID
)
RETURNS public.store_profile_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.store_profile_change_requests%ROWTYPE;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT * INTO v_request
  FROM public.store_profile_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_REVIEWED:%', v_request.status;
  END IF;

  IF p_status = 'approved' THEN
    IF (v_request.changes ? 'name') OR (v_request.changes ? 'address') OR (v_request.changes ? 'phone') THEN
      UPDATE public.stores SET
        name = COALESCE(v_request.changes -> 'name' ->> 'new', name),
        address = COALESCE(v_request.changes -> 'address' ->> 'new', address),
        phone = COALESCE(v_request.changes -> 'phone' ->> 'new', phone),
        updated_at = NOW()
      WHERE id = v_request.store_id;
    END IF;

    IF (v_request.changes ? 'bank_account_number')
      OR (v_request.changes ? 'bank_ifsc_code')
      OR (v_request.changes ? 'bank_branch_name')
      OR (v_request.changes ? 'bank_passbook_storage_path') THEN
      UPDATE public.stores SET
        bank_account_number = COALESCE(v_request.changes -> 'bank_account_number' ->> 'new', bank_account_number),
        bank_ifsc_code = COALESCE(v_request.changes -> 'bank_ifsc_code' ->> 'new', bank_ifsc_code),
        bank_branch_name = COALESCE(v_request.changes -> 'bank_branch_name' ->> 'new', bank_branch_name),
        bank_passbook_storage_path = COALESCE(v_request.changes -> 'bank_passbook_storage_path' ->> 'new', bank_passbook_storage_path),
        updated_at = NOW()
      WHERE id = v_request.store_id;
    END IF;
  END IF;

  UPDATE public.store_profile_change_requests SET
    status = p_status,
    rejection_reason = CASE WHEN p_status = 'rejected' THEN p_rejection_reason ELSE NULL END,
    reviewed_by = p_reviewed_by,
    reviewed_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

-- Ownership/grants unchanged by CREATE OR REPLACE, but restated for clarity
-- and to guard against a future migration accidentally widening this.
REVOKE ALL ON FUNCTION public.review_store_profile_change_request(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_store_profile_change_request(UUID, TEXT, TEXT, UUID) TO service_role;
