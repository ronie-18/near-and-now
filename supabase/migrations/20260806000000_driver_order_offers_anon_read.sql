-- driver_order_offers had RLS enabled (20260427000000) with only a
-- service_role GRANT and no policy for anon/authenticated — so the rider
-- app's Realtime subscription (a plain anon-key client, since rider auth is
-- custom phone/OTP through Express, not Supabase Auth) never received any
-- postgres_changes event on this table. Offers still showed up via the
-- app's 15s poll fallback, so this wasn't a visible error, just a silent
-- delay on new-order notifications.
--
-- Columns here are just order_id/driver_id/status/timestamps — no customer
-- PII — so a broad read policy is the same risk profile as the existing
-- "public_read" policy on stores (20260515000002_admin_data_access_rls.sql).
-- Real per-driver row scoping isn't possible via auth.uid() since riders
-- don't have a Supabase Auth session.

GRANT SELECT ON driver_order_offers TO anon, authenticated;

DROP POLICY IF EXISTS "anon_read" ON driver_order_offers;
CREATE POLICY "anon_read" ON driver_order_offers
  FOR SELECT USING (true);
