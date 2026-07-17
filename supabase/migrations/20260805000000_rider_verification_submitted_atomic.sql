-- Atomic "ready for review" flip for delivery partners, mirroring
-- mark_verification_submitted_if_ready (20260803000000) — same row-locking
-- pattern as finalize_order_if_ready/accept_driver_offer, so two concurrent
-- uploads completing a rider's last empty document slot(s) can't both fire
-- the "ready for review" admin notification.
--
-- Unlike the store version's flat count of 7, the required count here depends
-- on vehicle_type: vehicle_registration isn't required for cycle/e-bike
-- riders, so they only need 6 documents, not 7.
CREATE OR REPLACE FUNCTION mark_rider_verification_submitted_if_ready(p_partner_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_submitted BOOLEAN;
  v_vehicle_type TEXT;
  v_required_count INTEGER;
  v_uploaded_count INTEGER;
BEGIN
  SELECT (verification_submitted_at IS NOT NULL), vehicle_type
  INTO v_already_submitted, v_vehicle_type
  FROM delivery_partners
  WHERE user_id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_already_submitted THEN
    RETURN FALSE; -- already notified for this submission cycle
  END IF;

  v_required_count := CASE WHEN v_vehicle_type IN ('cycle', 'e-bike') THEN 6 ELSE 7 END;

  -- An accidentally-uploaded vehicle_registration row for a cycle/e-bike
  -- rider still counts fine here — it just isn't required, so it doesn't
  -- block reaching v_required_count for those riders.
  SELECT COUNT(*) INTO v_uploaded_count
  FROM delivery_partner_verification_documents
  WHERE partner_id = p_partner_id AND storage_path IS NOT NULL;

  IF v_uploaded_count < v_required_count THEN
    RETURN FALSE;
  END IF;

  UPDATE delivery_partners SET verification_submitted_at = now() WHERE user_id = p_partner_id;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_rider_verification_submitted_if_ready(UUID) TO service_role, authenticated, anon;
