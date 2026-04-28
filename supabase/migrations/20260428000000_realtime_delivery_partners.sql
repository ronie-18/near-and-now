-- Enable Supabase Realtime for delivery_partners and driver_locations
-- so the DriverApp and admin dashboard see live is_online / location changes.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE delivery_partners;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;
