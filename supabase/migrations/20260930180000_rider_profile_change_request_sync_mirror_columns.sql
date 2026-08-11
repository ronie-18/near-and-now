-- review_rider_profile_change_request() only ever wrote each approved field
-- to ONE of the two tables that mirror it:
--   - name change  -> app_users.name only          (delivery_partners.name left stale)
--   - email change -> delivery_partners.email only (app_users.email left stale)
-- Rider app's own profile screen reads name/email from app_users, while the
-- admin panel reads name/email/address from delivery_partners. So any rider
-- who ever had a name or email change approved ended up with a stale value
-- on one side or the other — invisible for brand-new riders (both tables are
-- written together at signup) but permanent for existing riders who edit
-- their profile. This makes both writes update both tables on approval.

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

      UPDATE public.delivery_partners SET
        name = v_request.changes -> 'name' ->> 'new',
        updated_at = NOW()
      WHERE user_id = v_request.rider_id;
    END IF;

    IF (v_request.changes ? 'email') OR (v_request.changes ? 'address') THEN
      UPDATE public.delivery_partners SET
        email = COALESCE(v_request.changes -> 'email' ->> 'new', email),
        address = COALESCE(v_request.changes -> 'address' ->> 'new', address),
        updated_at = NOW()
      WHERE user_id = v_request.rider_id;

      IF v_request.changes ? 'email' THEN
        UPDATE public.app_users SET
          email = v_request.changes -> 'email' ->> 'new',
          updated_at = NOW()
        WHERE id = v_request.rider_id;
      END IF;
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

-- One-off backfill: sync existing rows where the two mirror tables have
-- already diverged from past approvals under the old (single-table) logic.
UPDATE public.delivery_partners dp
SET name = au.name, updated_at = NOW()
FROM public.app_users au
WHERE dp.user_id = au.id
  AND dp.name IS DISTINCT FROM au.name;

UPDATE public.app_users au
SET email = dp.email, updated_at = NOW()
FROM public.delivery_partners dp
WHERE au.id = dp.user_id
  AND dp.email IS NOT NULL
  AND au.email IS DISTINCT FROM dp.email;
