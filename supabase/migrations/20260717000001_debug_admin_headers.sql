-- TEMPORARY diagnostic function — safe to drop once the admin-auth 0-rows issue
-- is resolved. Returns exactly what Postgres sees for the incoming request so we
-- can tell whether x-admin-token is arriving at all, in which GUC form, and
-- whether it matches a live admin_sessions row — without guessing further.

CREATE OR REPLACE FUNCTION public.debug_admin_headers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_headers_raw TEXT;
  v_headers_json JSONB;
  v_token_from_json TEXT;
  v_token_from_individual TEXT;
  v_matching_session JSONB;
BEGIN
  BEGIN
    v_headers_raw := current_setting('request.headers', true);
  EXCEPTION WHEN OTHERS THEN
    v_headers_raw := NULL;
  END;

  BEGIN
    v_headers_json := v_headers_raw::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers_json := NULL;
  END;

  v_token_from_json := v_headers_json ->> 'x-admin-token';

  BEGIN
    v_token_from_individual := current_setting('request.header.x-admin-token', true);
  EXCEPTION WHEN OTHERS THEN
    v_token_from_individual := NULL;
  END;

  SELECT to_jsonb(s) INTO v_matching_session
  FROM public.admin_sessions s
  WHERE s.session_token = COALESCE(v_token_from_json, v_token_from_individual)
  LIMIT 1;

  RETURN jsonb_build_object(
    'raw_request_headers', v_headers_raw,
    'token_from_json_guc', v_token_from_json,
    'token_from_individual_guc', v_token_from_individual,
    'matching_admin_session', v_matching_session,
    'is_admin_authenticated_result', public.is_admin_authenticated()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_admin_headers() TO anon, authenticated;
