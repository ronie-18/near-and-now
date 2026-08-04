-- customer_own_orders (public.customer_orders) and customer_own_record
-- (public.app_users) both gate on auth.uid(), but the customer mobile app
-- never authenticates via Supabase Auth -- it uses its own phone-OTP JWT --
-- so auth.uid() is always NULL from that frontend and neither policy can
-- ever evaluate true. Confirmed dead code (SCHEMA_NOTES.md, 2026-08-04
-- audit): the customer app's Order Detail screen still relies on
-- customer_own_orders for a realtime subscription that consequently never
-- fires, with no polling fallback. Removing both rather than leaving them as
-- misleading dead code that looks like a working customer-self-access path.
--
-- Real access to these tables continues exactly as before this migration --
-- through the backend's service-role client and the admin panel's
-- is_admin_authenticated()-gated policies, neither of which depend on these.

DROP POLICY IF EXISTS "customer_own_orders" ON public.customer_orders;
DROP POLICY IF EXISTS customer_own_record ON public.app_users;
