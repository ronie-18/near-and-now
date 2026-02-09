-- Seed: Shopkeeper + optional initial 6 stores (Bangalore)
-- Run after: app-users-schema, seed-master-products, store-proximity-functions.sql
-- Note: ensure_stores_near_location creates 5-6 stores on-demand for ANY location the customer selects.

-- 1. Create a shopkeeper app_user for store ownership (if not exists)
INSERT INTO app_users (id, name, email, phone, role, is_activated)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'Store Owner (Seed)',
  'storeowner@nearandnow.local',
  '+919999990001',
  'shopkeeper',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Use the shopkeeper id (adjust if your app_users use different ids)
DO $$
DECLARE
  owner_uuid uuid;
BEGIN
  SELECT id INTO owner_uuid FROM app_users WHERE role = 'shopkeeper' LIMIT 1;
  IF owner_uuid IS NULL THEN
    owner_uuid := 'a1111111-1111-1111-1111-111111111111';
    INSERT INTO app_users (id, name, email, phone, role, is_activated)
    VALUES (owner_uuid, 'Store Owner (Seed)', 'storeowner@nearandnow.local', '+919999990001', 'shopkeeper', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 2. Insert 6 dummy stores (Bangalore area, ~2-3km spread around center)
  -- Customer can select any address; stores within 25km radius will have products
  INSERT INTO stores (owner_id, name, phone, address, latitude, longitude, is_active) VALUES
    (owner_uuid, 'Near & Now Store Koramangala', '+919876543201', '80 Feet Road, Koramangala, Bangalore 560034', 12.9352, 77.6245, true),
    (owner_uuid, 'Near & Now Store Indiranagar', '+919876543202', '100 Feet Road, Indiranagar, Bangalore 560038', 12.9784, 77.6408, true),
    (owner_uuid, 'Near & Now Store HSR Layout', '+919876543203', '27th Main, HSR Layout, Bangalore 560102', 12.9114, 77.6382, true),
    (owner_uuid, 'Near & Now Store JP Nagar', '+919876543204', '25th Main, JP Nagar, Bangalore 560078', 12.9067, 77.5851, true),
    (owner_uuid, 'Near & Now Store Whitefield', '+919876543205', 'ITPL Road, Whitefield, Bangalore 560066', 12.9698, 77.7499, true),
    (owner_uuid, 'Near & Now Store Malleshwaram', '+919876543206', 'Sampige Road, Malleshwaram, Bangalore 560003', 13.0035, 77.5647, true)
  ON CONFLICT (phone) DO NOTHING;
END $$;

-- 3. Populate products: each master_product in ALL 6 stores
-- Ensures every product is available at every store; createOrder can use any nearby store
INSERT INTO products (store_id, master_product_id, quantity, is_active)
SELECT s.id, mp.id, 100, true
FROM master_products mp
CROSS JOIN (SELECT id FROM stores WHERE is_active = true) s
WHERE mp.is_active = true
ON CONFLICT (store_id, master_product_id) DO NOTHING;
