-- Track + harden get_nearby_store_ids (previously lived only in the DB with
-- no migration). Require stores to be both online (is_active) and verified
-- (is_approved) before their inventory is visible to customers.

CREATE OR REPLACE FUNCTION public.get_nearby_store_ids(
  cust_lat double precision,
  cust_lng double precision,
  radius_km double precision DEFAULT 4
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.stores s
  WHERE s.is_active = true
    AND s.is_approved = true
    AND s.latitude IS NOT NULL
    AND s.longitude IS NOT NULL
    AND public.haversine_km(cust_lat, cust_lng, s.latitude, s.longitude) <= radius_km;
$$;

COMMENT ON FUNCTION public.get_nearby_store_ids(double precision, double precision, double precision) IS
  'Returns store IDs within radius_km that are online (is_active) and verified (is_approved).';

GRANT EXECUTE ON FUNCTION public.get_nearby_store_ids(double precision, double precision, double precision)
  TO anon, authenticated, service_role;
