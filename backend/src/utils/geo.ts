const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in kilometers. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Lat/lng box that fully contains the circle of `radiusKm` around a point —
 * a cheap pre-filter a database index can use (`.gte/.lte` on latitude and
 * longitude) before the exact haversineKm() check. Always a superset of the
 * circle, so applying it first never changes which rows the exact check keeps;
 * it only stops shipping rows that are obviously out of range.
 * Padded by 1% so floating-point edges can't drop a point exactly on the circle.
 * Not antimeridian/pole-aware — irrelevant for this service area (India).
 */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const padded = radiusKm * 1.01;
  const dLat = (padded / EARTH_RADIUS_KM) * (180 / Math.PI);
  const cosLat = Math.max(Math.cos(toRadians(lat)), 0.01);
  const dLng = dLat / cosLat;
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
