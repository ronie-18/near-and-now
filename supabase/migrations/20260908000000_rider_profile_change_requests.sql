-- Rider-app equivalent of store_profile_change_requests (20260831000000 +
-- atomicity fix 20260901000000) — previously a rider editing their
-- name/email/address on the profile screen (app/(tabs)/profile.tsx's
-- handleSave) PATCHed delivery_partners/app_users directly and took effect
-- immediately, with zero admin visibility or review trail, unlike
-- verification documents which already go through a review queue.
--
-- name lives on app_users (shared identity table); email/address live on
-- delivery_partners — the diff/apply logic has to touch both.
--
-- Same reasoning as notifications/store_profile_change_requests: this app
-- authenticates with a custom phone/OTP session, not Supabase Auth, so all
-- access goes through the Express backend using supabaseAdmin (service
-- role). No client-facing RLS policies are needed.

CREATE TABLE IF NOT EXISTS public.rider_profile_change_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id         UUID NOT NULL REFERENCES public.delivery_partners(user_id) ON DELETE CASCADE,
  -- { "name": {"old": "...", "new": "..."}, "email": {...}, "address": {...} }
  -- — only fields that actually changed are included.
  changes          JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by      UUID,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_profile_change_requests_rider_status
  ON public.rider_profile_change_requests (rider_id, status, created_at DESC);

-- One pending request per rider, enforced at the DB level from the start —
-- learned from having to add this as a follow-up fix for
-- store_profile_change_requests (20260901000000).
CREATE UNIQUE INDEX IF NOT EXISTS idx_rider_profile_change_requests_one_pending_per_rider
  ON public.rider_profile_change_requests (rider_id)
  WHERE status = 'pending';

ALTER TABLE public.rider_profile_change_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rider_profile_change_requests TO service_role;

-- Atomically review a pending request: locks the row, re-checks status
-- under the lock, applies the diff (name -> app_users, email/address ->
-- delivery_partners) if approving, and updates the request row — all in one
-- transaction. Mirrors review_store_profile_change_request (20260901000000)
-- exactly, including the ALREADY_REVIEWED exception convention, learned
-- the hard way there: a check-then-act in Node let two concurrent reviews
-- of the same request both apply, and a two-step non-transactional write
-- could leave the underlying row changed while the request still showed
-- 'pending'. Both are structurally impossible here since everything happens
-- under one row lock in one transaction.
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

    IF (v_request.changes ? 'email') OR (v_request.changes ? 'address') THEN
      UPDATE public.delivery_partners SET
        email = COALESCE(v_request.changes -> 'email' ->> 'new', email),
        address = COALESCE(v_request.changes -> 'address' ->> 'new', address)
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
