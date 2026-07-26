-- =============================================================================
-- Atomicity fixes for store_profile_change_requests (20260831000000), found
-- during a deep-dive review of the same session that added the table:
--
-- 1. reviewProfileChangeRequest() did a check-then-act on `status = 'pending'`
--    in Node (SELECT, check in JS, then two separate UPDATEs) — two
--    concurrent approve/reject calls on the same request could both pass the
--    check before either wrote, both applying the stores patch. Same bug
--    class already fixed elsewhere in this project via row-locked SQL
--    functions (finalize_order_if_ready, accept_driver_offer,
--    mark_verification_submitted_if_ready) — same fix shape here.
-- 2. Approving wrote to `stores` and to `store_profile_change_requests` as
--    two independent, non-transactional writes. If the second write failed
--    after the first succeeded, the store's fields were already changed but
--    the request row still showed status='pending' — a "phantom pending"
--    request an admin could later "reject" even though it had already taken
--    effect. Wrapping both writes in one PL/pgSQL function makes them atomic.
-- 3. requestProfileChange() had its own check-then-act race on the submit
--    side (SELECT for an existing pending row, then INSERT or UPDATE) — two
--    concurrent submissions could both see no existing pending row and both
--    INSERT, leaving two pending rows for the same store. A partial unique
--    index turns the second INSERT into a clean 23505 the backend already
--    retries as an UPDATE, instead of silently allowing duplicates.
-- =============================================================================

-- Enforce "one pending request per store" at the DB level — the backend was
-- only ever enforcing it via a prior SELECT, not atomically.
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_profile_change_requests_one_pending_per_store
  ON public.store_profile_change_requests (store_id)
  WHERE status = 'pending';

-- Atomically review a pending request: locks the row, re-checks status is
-- still 'pending' under that lock, applies the diff to `stores` (if
-- approving) and updates the request row, all in one transaction. Returns
-- the request row's final state (NULL if the id doesn't exist) — the caller
-- checks whether the returned status matches what was requested to tell
-- "applied" apart from "already reviewed by someone else" (still pending vs.
-- resolved is disambiguated by the returned row's own `status`/`reviewed_at`).
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

  -- Someone else already reviewed this between the caller's own fetch and
  -- this call (or a concurrent duplicate of this same call lost the race for
  -- the row lock) — a distinct exception so the caller can 409 instead of
  -- reporting a false success or silently re-sending the review notification
  -- for a write that didn't actually happen this time, even when the
  -- requested status happens to match what's already there.
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_REVIEWED:%', v_request.status;
  END IF;

  IF p_status = 'approved' THEN
    UPDATE public.stores SET
      name = COALESCE(v_request.changes -> 'name' ->> 'new', name),
      address = COALESCE(v_request.changes -> 'address' ->> 'new', address),
      phone = COALESCE(v_request.changes -> 'phone' ->> 'new', phone),
      updated_at = NOW()
    WHERE id = v_request.store_id;
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

-- Learning from this exact repeated mistake elsewhere in this project
-- (mark_rider_verification_submitted_if_ready was granted to anon/authenticated
-- by habit, then had to be revoked in 20260810000000): grant service_role only
-- from the start. This function mutates `stores` on approval — anon-callable
-- would be as serious as the already-fixed finalize_order_if_ready hole.
REVOKE ALL ON FUNCTION public.review_store_profile_change_request(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_store_profile_change_request(UUID, TEXT, TEXT, UUID) TO service_role;
