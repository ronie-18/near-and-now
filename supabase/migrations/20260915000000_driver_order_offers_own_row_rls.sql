-- Closes the anon-open gap documented in 20260806000000: at the time, real
-- per-driver row scoping via auth.uid() wasn't possible since riders had no
-- Supabase Auth session at all. That's since changed — 20260819000000 added
-- delivery_partners.auth_user_id and a bridge session minted at login solely
-- to give Realtime's RLS check a real auth.uid() to evaluate (see
-- backend/src/services/riderAuthBridge.service.ts, lib/riderRealtimeAuth.ts).
-- An unconditional USING(true) is no longer the only option, so this scopes
-- each driver to their own offer rows the same way partner_own_record scopes
-- delivery_partners. Confirmed via a full repo grep that every non-Realtime
-- reader/writer of this table (backend controllers, delivery simulation)
-- already goes through supabaseAdmin (service_role, bypasses RLS) — the only
-- client-side consumer is the rider app's own Realtime subscription.
DROP POLICY IF EXISTS "anon_read" ON driver_order_offers;
CREATE POLICY "driver_own_offers" ON driver_order_offers
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM delivery_partners dp
      WHERE dp.user_id = driver_order_offers.driver_id
        AND dp.auth_user_id = auth.uid()
    )
  );
