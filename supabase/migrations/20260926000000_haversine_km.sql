-- Retroactively track `haversine_km`, which "lived only in the DB" the same
-- way `get_nearby_store_ids` did before 20260927000000_get_nearby_store_ids_
-- require_approved.sql — that migration calls this function, and since
-- CREATE FUNCTION ... LANGUAGE sql validates referenced objects at creation
-- time, replaying migrations against a fresh database would otherwise fail
-- here. Definition pulled verbatim from the live DB via pg_get_functiondef;
-- sequenced before 20260927000000 by timestamp.
CREATE OR REPLACE FUNCTION public.haversine_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT 6371 * acos(LEAST(1, GREATEST(-1,
    sin(radians(lat1)) * sin(radians(lat2)) +
    cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2 - lon1))
  )));
$function$;
