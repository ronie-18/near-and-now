-- Standard Postgres SECURITY DEFINER hardening: without SET search_path,
-- a SECURITY DEFINER function resolves unqualified table/function names
-- using whatever search_path the CALLER has session-level control over,
-- which can be abused to shadow a table/function it references and run
-- attacker-controlled code with the function owner's privileges. Same
-- pattern already applied to accept_driver_offer() in
-- 20260721000000_accept_driver_offer_eligibility_check.sql. Re-creating
-- each function below with its exact existing body (sourced from the
-- migration that most recently defined it), only adding
-- `SET search_path = public`.
--
-- is_admin_authenticated() is the most sensitive of the four here — it's
-- the sole gate for every admin_full_access RLS policy across 9 tables.

CREATE OR REPLACE FUNCTION auto_offline_stale_drivers()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE delivery_partners
  SET    is_online = false
  WHERE  is_online = true
    AND  last_seen < NOW() - INTERVAL '60 seconds';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_account_locked(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attempt_count INT;
BEGIN
  SELECT COUNT(*) INTO attempt_count
  FROM public.failed_login_attempts
  WHERE email        = lower(trim(p_email))
    AND attempted_at > NOW() - INTERVAL '15 minutes';
  RETURN attempt_count >= 5;
END;
$$;

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
    SELECT 1 FROM public.admin_sessions
    WHERE session_token = v_token
      AND expires_at > NOW()
      AND logged_out_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admin_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (type, title, message, data)
  VALUES (
    'new_order',
    'New Order Received',
    'Order ' || COALESCE(NEW.order_code, NEW.id::text) || ' placed for ₹' || ROUND(NEW.total_amount),
    jsonb_build_object('order_id', NEW.id, 'order_code', NEW.order_code, 'total_amount', NEW.total_amount)
  );
  RETURN NEW;
END;
$$;
