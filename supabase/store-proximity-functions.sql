-- Store proximity: haversine distance + get nearby store IDs
-- Run in Supabase SQL Editor
-- Used to filter products by customer's selected address (lat/lng)

-- Haversine distance in km
CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 6371 * acos(LEAST(1, GREATEST(-1,
    sin(radians(lat1)) * sin(radians(lat2)) +
    cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2 - lon1))
  )));
$$;

-- Get store IDs within radius of customer location (default 50km)
CREATE OR REPLACE FUNCTION public.get_nearby_store_ids(
  cust_lat double precision,
  cust_lng double precision,
  radius_km double precision DEFAULT 50
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM stores
  WHERE is_active = true
  AND public.haversine_km(latitude::double precision, longitude::double precision, cust_lat, cust_lng) <= radius_km;
$$;

-- Sequence for unique store phone numbers (dynamic stores)
CREATE SEQUENCE IF NOT EXISTS store_phone_seq START 990000000;

-- Ensure 5-6 stores exist near (lat, lng). Creates them on-demand if none exist.
-- Uses ~2km grid: same cluster for nearby locations; new cluster for each new area.
CREATE OR REPLACE FUNCTION public.ensure_stores_near_location(p_lat double precision, p_lng double precision)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  grid_lat double precision := round(p_lat::numeric, 2)::double precision;
  grid_lng double precision := round(p_lng::numeric, 2)::double precision;
  owner_id uuid;
  cnt int;
  offsets double precision[][] := ARRAY[
    ARRAY[0::double precision, 0::double precision],
    ARRAY[0.003, 0],
    ARRAY[0, 0.003],
    ARRAY[-0.003, 0],
    ARRAY[0, -0.003],
    ARRAY[0.002, 0.002]
  ];
  i int;
  ph text;
BEGIN
  SELECT count(*) INTO cnt
  FROM stores
  WHERE is_active = true
  AND haversine_km(latitude::double precision, longitude::double precision, grid_lat, grid_lng) <= 3;

  IF cnt >= 5 THEN
    RETURN QUERY
    SELECT id FROM stores
    WHERE is_active = true
    AND haversine_km(latitude::double precision, longitude::double precision, grid_lat, grid_lng) <= 3;
    RETURN;
  END IF;

  -- Get shopkeeper owner
  SELECT id INTO owner_id FROM app_users WHERE role = 'shopkeeper' LIMIT 1;
  IF owner_id IS NULL THEN
    INSERT INTO app_users (name, email, phone, role, is_activated)
    VALUES ('Store Owner (Dynamic)', 'storeowner@nearandnow.local', '+919999990000', 'shopkeeper', true)
    RETURNING id INTO owner_id;
  END IF;

  -- Create 6 stores around grid center (unique phones via sequence, full details)
  FOR i IN 1..6 LOOP
    ph := '+919' || lpad(nextval('store_phone_seq')::text, 9, '0');
    INSERT INTO stores (owner_id, name, phone, address, latitude, longitude, is_active)
    VALUES (
      owner_id,
      'Near & Now Store #' || i,
      ph,
      'Pickup point #' || i || ', serving your delivery area.',
      grid_lat + offsets[i][1],
      grid_lng + offsets[i][2],
      true
    );
  END LOOP;

  -- Populate products for new stores in this grid
  INSERT INTO products (store_id, master_product_id, quantity, is_active)
  SELECT s.id, mp.id, 100, true
  FROM stores s
  CROSS JOIN (SELECT id FROM master_products WHERE is_active = true) mp
  WHERE s.is_active = true
    AND haversine_km(s.latitude::double precision, s.longitude::double precision, grid_lat, grid_lng) <= 3
    AND NOT EXISTS (SELECT 1 FROM products p WHERE p.store_id = s.id AND p.master_product_id = mp.id)
  ON CONFLICT (store_id, master_product_id) DO NOTHING;

  RETURN QUERY
  SELECT id FROM stores
  WHERE is_active = true
  AND haversine_km(latitude::double precision, longitude::double precision, grid_lat, grid_lng) <= 3;
END;
$$;

GRANT EXECUTE ON FUNCTION public.haversine_km(double precision, double precision, double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.haversine_km(double precision, double precision, double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_store_ids(double precision, double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_nearby_store_ids(double precision, double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION public.ensure_stores_near_location(double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_stores_near_location(double precision, double precision) TO anon;
