-- is_admin_authenticated() gates every admin_full_access RLS policy across 9
-- tables (see 20260815000000_security_definer_search_path_hardening.sql's own
-- comment on this function) but only ever checked admin_sessions
-- (session_token/expires_at/logged_out_at) — never admins.status. A
-- super_admin deactivating another admin via the admin panel's
-- AdminManagementPage did not revoke that admin's already-issued session:
-- every RLS-gated table kept accepting their token until it expired on its
-- own. Backend's requireAdmin middleware (adminAuth.middleware.ts) had the
-- identical gap and was fixed alongside this migration on 2026-10-01 (see
-- PERFORMANCE_AND_BUG_FIXES.md backlog item 8 / section 6.1 finding A1).
--
-- Token-resolution logic (the two current_setting lookups) is unchanged from
-- the 20260815000000 version — only the final EXISTS check gained a join to
-- admins.status.

CREATE OR REPLACE FUNCTION public.is_admin_authenticated()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Preferred: aggregated JSON headers GUC (newer PostgREST).
  BEGIN
    v_token := (current_setting('request.headers', true)::jsonb) ->> 'x-admin-token';
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  -- Fallback: individual per-header GUC (works on older/all PostgREST versions).
  IF v_token IS NULL OR v_token = '' THEN
    BEGIN
      v_token := current_setting('request.header.x-admin-token', true);
    EXCEPTION WHEN OTHERS THEN
      v_token := NULL;
    END;
  END IF;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admin_sessions s
    JOIN public.admins a ON a.id = s.admin_id
    WHERE s.session_token = v_token
      AND s.expires_at > NOW()
      AND s.logged_out_at IS NULL
      AND a.status = 'active'
  );
END;
$$;
