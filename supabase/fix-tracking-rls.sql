-- =====================================================
-- FIX PERMISSIONS FOR ORDER TRACKING
-- =====================================================
-- Run this in Supabase SQL Editor.
-- Fixes "permission denied for table" (42501) for backend service_role.
-- =====================================================

-- Ensure driver_locations table exists (for simulation + map)
CREATE TABLE IF NOT EXISTS driver_locations (
  delivery_partner_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grant to service_role (backend + frontend simulation use service_role key)
GRANT SELECT, INSERT ON order_status_history TO service_role;
GRANT SELECT ON stores TO service_role;
GRANT SELECT, INSERT, UPDATE ON driver_locations TO service_role;
GRANT SELECT ON customer_orders TO service_role;
GRANT SELECT ON store_orders TO service_role;
GRANT SELECT ON order_items TO service_role;
GRANT SELECT ON app_users TO service_role;

-- Grant to anon + authenticated (for frontend direct Supabase when needed)
GRANT SELECT, INSERT ON order_status_history TO anon;
GRANT SELECT, INSERT ON order_status_history TO authenticated;
GRANT SELECT ON stores TO anon;
GRANT SELECT ON stores TO authenticated;
GRANT SELECT ON driver_locations TO anon;
GRANT SELECT ON driver_locations TO authenticated;

-- 2. order_status_history: allow read for tracking
DROP POLICY IF EXISTS "Allow read for tracking" ON order_status_history;
CREATE POLICY "Allow read for tracking"
  ON order_status_history FOR SELECT
  TO anon, authenticated
  USING (true);

-- 3. stores: allow read for active stores (map)
DROP POLICY IF EXISTS "Allow read for tracking map" ON stores;
CREATE POLICY "Allow read for tracking map"
  ON stores FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- 4. driver_locations: allow read for live map
DROP POLICY IF EXISTS "Allow read for tracking" ON driver_locations;
CREATE POLICY "Allow read for tracking"
  ON driver_locations FOR SELECT
  TO anon, authenticated
  USING (true);

-- =====================================================
-- 5. ENABLE REALTIME (live tracking updates)
-- =====================================================
-- Add tables to supabase_realtime publication so the
-- tracking page receives live updates via postgres_changes.
-- (Ignore "relation already in publication" - table is already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE customer_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE store_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_status_history;
ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
