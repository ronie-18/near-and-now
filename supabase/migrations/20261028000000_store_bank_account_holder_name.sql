-- Account holder name for store bank details (2026-10-28 Razorpay audit).
-- RazorpayX needs it to register a store's bank account (fund account) and its
-- penny-drop validation compares it with the name the bank returns; until now
-- only the account number, IFSC, branch and passbook photo were collected.
--
-- Goes through the same admin review queue as the other bank fields, so
-- review_store_profile_change_request (last defined in 20260930110000) is
-- restated with bank_account_holder_name added — otherwise approving a change
-- that carries only the holder name would silently apply nothing.
--
-- Additive only: existing rows keep NULL until the shopkeeper fills it in.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS bank_account_holder_name TEXT NULL;

COMMENT ON COLUMN public.stores.bank_account_holder_name IS
  'Name on the bank account, exactly as the bank has it. Needed for RazorpayX payouts; set via the admin-reviewed billing change request.';

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
      OR (v_request.changes ? 'bank_account_holder_name')
      OR (v_request.changes ? 'bank_passbook_storage_path') THEN
      UPDATE public.stores SET
        bank_account_number = COALESCE(v_request.changes -> 'bank_account_number' ->> 'new', bank_account_number),
        bank_ifsc_code = COALESCE(v_request.changes -> 'bank_ifsc_code' ->> 'new', bank_ifsc_code),
        bank_branch_name = COALESCE(v_request.changes -> 'bank_branch_name' ->> 'new', bank_branch_name),
        bank_account_holder_name = COALESCE(v_request.changes -> 'bank_account_holder_name' ->> 'new', bank_account_holder_name),
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

REVOKE ALL ON FUNCTION public.review_store_profile_change_request(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_store_profile_change_request(UUID, TEXT, TEXT, UUID) TO service_role;
