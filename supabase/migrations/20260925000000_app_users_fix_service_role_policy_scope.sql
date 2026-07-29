-- =============================================================================
-- Fixes a live, currently-exploitable RLS hole on `app_users`: a policy named
-- "Allow all for service role" (cmd: ALL, qual: true, with_check: true) is
-- scoped to roles: {public} instead of {service_role} — same misconfiguration
-- already found and fixed on `stores` (20260921000000_stores_fix_service_role_
-- policy_scope.sql). Because the role list was never actually restricted, it
-- grants full unconditional read/write to every role, including anon —
-- confirmed live via a plain anon-key curl with no session/auth header at
-- all: successfully read a real customer's name/email, and confirmed
-- session_token is also selectable the same way, meaning any active
-- customer's/shopkeeper's/rider's session could be hijacked by anyone
-- holding the (intentionally public) anon key. See bug_fixes_2026-07-23.md,
-- Supabase schema & migrations -> Critical, for the full writeup.
--
-- Verified safe to fix before applying, via a full repo grep across every
-- app/repo in the monorepo:
--   - Only two direct `.from('app_users')` call sites exist outside the
--     backend/admin panel: frontend/src/services/authService.ts's
--     updateCustomerProfile (a WRITE — fixed in this same session to route
--     through the backend's PATCH /api/customers/me instead of writing to
--     app_users/customers directly from the browser) and
--     frontend/src/services/supabase.ts's phone-lookup fallback inside
--     getUserAddresses (a READ, but only reachable when shouldUseBackendApi()
--     is false — dead code in this deployment, since VITE_API_URL is always
--     set — see .env). Neither near-now-store_owner, NAT_Near-Now_Rider-,
--     nor nearandnowcustomerapp touch app_users directly at all; every
--     session/profile operation in those apps already goes through the
--     backend's supabaseAdmin (service_role), unaffected by this fix either
--     way.
--   - admin_full_access (gated on is_admin_authenticated()) and the
--     dead-by-design customer_own_record (auth.uid() always NULL — this app
--     never uses Supabase Auth for customers) are untouched, unaffected.
--   - SECURITY DEFINER functions referencing app_users
--     (shopkeeper_authenticated, shopkeeper_owns_store,
--     ensure_stores_near_location) run as their owning role and already
--     bypass RLS internally, independent of this policy.
--   - One real regression found and fixed in this same migration:
--     fill_product_store_info (a trigger on public.products, populating the
--     denormalized name/phone columns via a stores/app_users join) was NOT
--     SECURITY DEFINER — it runs as whichever role fired the trigger, which
--     for the shopkeeper app's anon-key "add product to store" flow
--     (lib/storeProducts.ts's upsertStoreProduct) is anon/authenticated, not
--     service_role. It currently only works at all because of this same
--     RLS hole; once closed, its app_users join would silently return no
--     rows for that role (RLS filters, doesn't error), leaving
--     products.phone NULL for every new row. Fixed by making it SECURITY
--     DEFINER (matching this codebase's established pattern for exactly
--     this class of cross-table read), so it keeps working under its own
--     elevated privilege regardless of the calling role.
--
-- Fix: correct the policy's roles to {service_role}, matching its own name
-- and evident intent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fill_product_store_info()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT s.name, u.phone
  INTO   NEW.name, NEW.phone
  FROM   public.stores s
  JOIN   public.app_users u ON u.id = s.owner_id
  WHERE  s.id = NEW.store_id;

  RETURN NEW;
END;
$$;

ALTER POLICY "Allow all for service role" ON public.app_users
  TO service_role;
