-- Mock delivery partners for demo simulation
-- Run in Supabase SQL Editor BEFORE testing the delivery flow
-- Required for: delivery simulation (Thank You → Track page auto-redirect + live demo)
-- driver_locations will be populated by the simulation at runtime

INSERT INTO app_users (id, name, email, phone, role, is_activated)
VALUES
  ('d1111111-1111-1111-1111-111111111111', 'Demo Driver 1', 'driver1@demo.local', '+919876543301', 'delivery_partner', true),
  ('d2222222-2222-2222-2222-222222222222', 'Demo Driver 2', 'driver2@demo.local', '+919876543302', 'delivery_partner', true),
  ('d3333333-3333-3333-3333-333333333333', 'Demo Driver 3', 'driver3@demo.local', '+919876543303', 'delivery_partner', true)
ON CONFLICT (id) DO NOTHING;
