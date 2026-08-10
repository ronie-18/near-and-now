-- order_items and store_orders each have a policy named "Allow all for
-- service role" (cmd: ALL, qual: true) scoped to `roles: {public}` instead
-- of `{service_role}` — the same misconfigured-policy-scope bug class
-- already found and fixed on `app_users` (20260925000000) and `stores`
-- (20260921000000). Since `roles: {public}` means every role including
-- `anon`, this lets any client holding the public anon key read or write
-- any row in either table directly against Supabase, bypassing the backend
-- entirely (no auth, no ownership check).
--
-- Verified safe before applying: no live client (website, customer app,
-- store-owner app, rider app) reads or writes order_items/store_orders via
-- an anon-key Supabase client on any reachable code path — the only direct
-- call site (frontend/src/services/supabase.ts::getUserOrders) has zero
-- callers anywhere in the app (order history goes through the backend API,
-- GET /api/orders/customer/:customerId, instead). The live-tracking realtime
-- hooks (frontend's useOrderTrackingRealtime, customer app's
-- useOrderTracking) subscribe to store_orders for a refresh *trigger* only —
-- the actual data on refresh comes from the backend API
-- (fetchOrderTrackingFull), and every real status transition also inserts an
-- order_status_history row (left untouched here, still anon/authenticated
-- readable via "Allow read for tracking"), so those subscriptions keep
-- working via that channel regardless of this change. The backend always
-- uses supabaseAdmin (service_role), which bypasses RLS entirely and is
-- unaffected by narrowing this policy's role scope.

ALTER POLICY "Allow all for service role" ON public.order_items TO service_role;
ALTER POLICY "Allow all for service role" ON public.store_orders TO service_role;
