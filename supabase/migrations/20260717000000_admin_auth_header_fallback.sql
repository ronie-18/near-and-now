-- is_admin_authenticated() only ever tried the aggregated JSON headers GUC
-- (current_setting('request.headers')::jsonb ->> 'x-admin-token'). That GUC is a
-- newer PostgREST feature; if this project's PostgREST version doesn't populate
-- it, current_setting() returns NULL, the function silently falls through to
-- FALSE (its own exception handler swallows the failure), and every
-- admin-only-gated table (customer_orders, admin_notifications, admin_sessions
-- reads for session verification, etc.) silently returns zero rows — no error,
-- just empty data, even though tables with a public_read fallback policy
-- (master_products, categories, stores) keep working and mask the problem.
--
-- Add a fallback to the individual per-header GUC (request.header.<name>),
-- which has been supported by PostgREST for far longer and is the more
-- reliable mechanism across versions.

CREATE OR REPLACE FUNCTION public.is_admin_authenticated()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
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
    SELECT 1 FROM public.admin_sessions
    WHERE session_token = v_token
      AND expires_at > NOW()
      AND logged_out_at IS NULL
  );
END;
$$;
