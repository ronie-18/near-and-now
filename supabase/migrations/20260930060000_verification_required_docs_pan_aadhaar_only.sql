-- Product decision: only Aadhaar + PAN are required to get a store approved
-- for the first time. Trade License/GST/FSSAI are optional and collected
-- later, from the post-approval profile screen — see
-- ONBOARDING_REQUIRED_DOC_TYPES in backend/src/utils/verificationDocuments.ts
-- and the matching client-side constant in both apps' verificationDocuments.ts.
--
-- mark_verification_submitted_if_ready() (migration 20260803000000) still
-- hardcoded the old "all 7" completeness check, so an unapproved store that
-- had only uploaded Aadhaar + PAN would never flip verification_submitted_at
-- and admin would never get the "ready for review" notification. Lowers the
-- threshold to 4 (aadhaar_front, aadhaar_back, pan_front, pan_back) — kept as
-- a literal count here rather than reading a doc-type list from a table,
-- same "counting rows" approach as the original function, since Postgres has
-- no clean way to share the Node-side ONBOARDING_REQUIRED_DOC_TYPES constant.

CREATE OR REPLACE FUNCTION mark_verification_submitted_if_ready(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_submitted BOOLEAN;
  v_uploaded_count INTEGER;
BEGIN
  SELECT (verification_submitted_at IS NOT NULL) INTO v_already_submitted
  FROM stores
  WHERE id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_already_submitted THEN
    RETURN FALSE; -- already notified for this submission cycle
  END IF;

  -- Only the 4 onboarding-required document types count toward readiness —
  -- trade/gst/fssai uploads (optional, post-approval-only) never contribute.
  SELECT COUNT(*) INTO v_uploaded_count
  FROM store_verification_documents
  WHERE store_id = p_store_id
    AND storage_path IS NOT NULL
    AND doc_type IN ('aadhaar_front', 'aadhaar_back', 'pan_front', 'pan_back');

  IF v_uploaded_count < 4 THEN
    RETURN FALSE;
  END IF;

  UPDATE stores SET verification_submitted_at = now() WHERE id = p_store_id;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_verification_submitted_if_ready(UUID) TO service_role, authenticated, anon;

COMMENT ON COLUMN public.stores.verification_submitted_at IS
  'Set once, atomically, the moment all 4 required onboarding verification documents '
  '(Aadhaar front/back, PAN front/back) are uploaded — guards the one-time "ready for '
  'review" admin notification against firing twice under concurrent uploads. Trade '
  'License/GST/FSSAI are optional and post-approval-only, so they never affect this flag. '
  'Cleared to NULL whenever an onboarding-required document is deleted, so a later '
  're-completion notifies again.';
