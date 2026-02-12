-- =====================================================
-- ENABLE REALTIME FOR ORDER TRACKING
-- =====================================================
-- Run this SQL in Supabase SQL Editor to enable real-time
-- updates for order status, delivery partner assignment,
-- and driver location tracking.
--
-- After running, the tracking page will receive live updates
-- when: order status changes, delivery partner is assigned,
-- or driver location updates (GPS).
-- =====================================================

-- Add tables to supabase_realtime publication
-- (Skip if table is already in publication - harmless to run)
ALTER PUBLICATION supabase_realtime ADD TABLE customer_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE store_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_status_history;
ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;

-- =====================================================
-- NOTE: If you get "relation already in publication" error,
-- that table is already enabled. You can safely ignore it.
-- =====================================================
