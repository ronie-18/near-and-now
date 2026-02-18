/**
 * Places Service - uses backend proxy for Google Places & Geocoding APIs.
 * Direct browser calls to Google REST APIs fail due to CORS.
 */

const API_ORIGIN = (import.meta.env.VITE_API_URL || window.location.origin).toString().replace(/\/$/, '');
const API_BASE = `${API_ORIGIN}/api/places`;

export interface LocationData {
  address: string;
  city: string;
  pincode: string;
  state: string;
  lat: number;
  lng: number;
  placeId?: string;
  formattedAddress?: string;
  placeData?: unknown;
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

function cleanAddress(address: string): string {
  return address
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseGeocodeResult(result: {
  formatted_address?: string;
  address_components?: Array<{ long_name: string; types: string[] }>;
  geometry?: { location: { lat: number; lng: number } };
}): LocationData {
  let city = '';
  let pincode = '';
  let state = '';

  const components = result.address_components || [];
  for (const component of components) {
    const types = component.types;
    if (types.includes('locality')) {
      city = component.long_name;
    } else if (types.includes('administrative_area_level_3') && !city) {
      city = component.long_name;
    } else if (types.includes('postal_code')) {
      pincode = component.long_name;
    } else if (types.includes('administrative_area_level_1')) {
      state = component.long_name;
    }
  }

  const loc = result.geometry?.location || { lat: 0, lng: 0 };
  const address = cleanAddress(result.formatted_address || '');

  return {
    address,
    city: city || 'Unknown',
    pincode: pincode || '000000',
    state: state || '',
    lat: Number(loc.lat),
    lng: Number(loc.lng),
  };
}

/**
 * Search for places using autocomplete (India only) via backend proxy.
 */
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  if (!query.trim()) return [];

  const url = new URL(`${API_BASE}/autocomplete`, window.location.origin);
  url.searchParams.set('input', query);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error_message ?? data?.message ?? `Search failed (${response.status})`;
    throw new Error(msg);
  }

  if (data.status === 'OK') {
    const predictions = data.predictions || [];
    return predictions.slice(0, 5).map((p: any) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text ?? p.description,
      secondaryText: p.structured_formatting?.secondary_text ?? '',
    }));
  }

  if (data.status === 'ZERO_RESULTS') return [];

  const msg = data.error_message ?? data.status ?? 'Search failed';
  throw new Error(typeof msg === 'string' ? msg : 'Search failed');
}

/**
 * Get detailed location data for a place ID via backend proxy.
 */
export async function getPlaceDetails(placeId: string): Promise<LocationData | null> {
  const url = new URL(`${API_BASE}/details`, window.location.origin);
  url.searchParams.set('place_id', placeId);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error_message ?? data?.message ?? `Place details failed (${response.status})`;
    throw new Error(msg);
  }

  if (data.status === 'OK' && data.result) {
    return parseGeocodeResult(data.result);
  }
  return null;
}

/**
 * Geocode an address to coordinates via backend proxy.
 */
export async function geocodeAddress(address: string): Promise<LocationData | null> {
  const url = new URL(`${API_BASE}/geocode`, window.location.origin);
  url.searchParams.set('address', address);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error_message ?? data?.message ?? `Geocode failed (${response.status})`;
    throw new Error(msg);
  }

  if (data.status === 'OK' && data.results?.length > 0) {
    return parseGeocodeResult(data.results[0]);
  }
  return null;
}

/**
 * Reverse geocode coordinates to address via backend proxy.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<LocationData | null> {
  const url = new URL(`${API_BASE}/reverse-geocode`, window.location.origin);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lng));

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error_message ?? data?.message ?? `Reverse geocode failed (${response.status})`;
    throw new Error(msg);
  }

  if (data.status === 'OK' && data.results?.length > 0) {
    return parseGeocodeResult(data.results[0]);
  }
  return null;
}

/**
 * Decode Google polyline encoding.
 */
function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/**
 * Extract road points from legs/steps (turn-by-turn) for accurate road-following.
 * Google Directions REST API returns { lat, lng } as plain numbers.
 */
function pointsFromLegsSteps(route: {
  legs?: Array<{
    steps?: Array<{
      start_location?: { lat: number; lng: number };
      end_location?: { lat: number; lng: number };
    }>;
  }>;
}): { lat: number; lng: number }[] {
  const result: { lat: number; lng: number }[] = [];
  for (const leg of route?.legs ?? []) {
    const steps = leg?.steps ?? [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const start = step?.start_location;
      const end = step?.end_location;
      if (i === 0 && start) result.push({ lat: start.lat, lng: start.lng });
      if (end) result.push({ lat: end.lat, lng: end.lng });
    }
  }
  return result;
}

/**
 * Fetch road route via backend - Uses Directions API + Roads API (snap to roads) fallback.
 * Returns points along actual roads; falls back to straight line only if both fail.
 */
export async function fetchDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{ lat: number; lng: number }[]> {
  const o = `${origin.lat},${origin.lng}`;
  const d = `${destination.lat},${destination.lng}`;

  // Try road-route endpoint first (uses Directions API + Roads API fallback)
  try {
    const roadUrl = `${API_BASE}/road-route?origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}`;
    const roadRes = await fetch(roadUrl);
    
    if (!roadRes.ok) {
      console.warn(`Road route API returned ${roadRes.status}, trying fallback`);
    } else {
      const roadData = await roadRes.json();
      if (roadData.points && Array.isArray(roadData.points) && roadData.points.length >= 2) {
        console.log(`Road route successful: ${roadData.points.length} points`);
        return roadData.points;
      } else {
        console.warn('Road route returned empty or invalid points, trying fallback');
      }
    }
  } catch (err) {
    console.warn('Road route request failed:', err);
    // Fall through to legacy directions
  }

  // Fallback: Try legacy directions endpoint
  try {
    const url = `${API_BASE}/directions?origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok && data.status === 'OK') {
      const route = data.routes?.[0];
      if (route) {
        // Try overview_polyline first (most accurate)
        if (route.overview_polyline?.points) {
          const poly = decodePolyline(route.overview_polyline.points);
          if (poly.length > 1) {
            console.log(`Directions polyline successful: ${poly.length} points`);
            return poly;
          }
        }
        // Fallback to step points
        const stepPoints = pointsFromLegsSteps(route);
        if (stepPoints.length > 1) {
          console.log(`Directions steps successful: ${stepPoints.length} points`);
          return stepPoints;
        }
      }
    } else {
      console.warn(`Directions API failed: ${data.status || response.status}`, data.error_message || '');
    }
  } catch (err) {
    console.error('Directions request failed:', err);
  }

  // Last resort: straight line fallback (should rarely happen)
  console.warn('All route APIs failed, using straight line fallback');
  return straightLineFallback(origin, destination);
}

function straightLineFallback(a: { lat: number; lng: number }, b: { lat: number; lng: number }): { lat: number; lng: number }[] {
  return [a, b];
}
