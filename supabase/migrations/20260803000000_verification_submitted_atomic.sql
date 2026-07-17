-- Fixes a race in the "ready for verification review" admin notification:
-- two concurrent saveVerificationDocument requests that each fill one of the
-- last 2 empty document slots could both observe "now complete" and both
-- fire the notification, since the old check-then-notify logic in Node had
-- no lock serializing the read+decide across concurrent requests.
--
-- Mirrors the row-locking pattern already used by finalize_order_if_ready()
-- (and accept_driver_offer()) — lock the store row FOR UPDATE before
-- deciding, so concurrent callers for the same store serialize and only one
-- of them ever sees "not yet submitted -> now complete" and flips the flag.
-- stores.verification_submitted_at is the flag: NULL means this submission
-- cycle hasn't notified yet; set once the 7th slot is filled, cleared again
-- whenever a document is deleted (so a later re-completion can notify again).

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.stores.verification_submitted_at IS
  'Set once, atomically, the moment all 7 required verification documents are '
  'uploaded — guards the one-time "ready for review" admin notification against '
  'firing twice under concurrent uploads. Cleared to NULL whenever a document is '
  'deleted, so a later re-completion notifies again.';

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

  -- UNIQUE(store_id, doc_type) on store_verification_documents means at most
  -- one row per doc type — 7 rows with a non-null storage_path is equivalent
  -- to "every required type is present" without needing to enumerate the
  -- doc-type list here too (kept in one place: backend/src/utils/verificationDocuments.ts).
  SELECT COUNT(*) INTO v_uploaded_count
  FROM store_verification_documents
  WHERE store_id = p_store_id AND storage_path IS NOT NULL;

  IF v_uploaded_count < 7 THEN
    RETURN FALSE;
  END IF;

  UPDATE stores SET verification_submitted_at = now() WHERE id = p_store_id;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_verification_submitted_if_ready(UUID) TO service_role, authenticated, anon;
