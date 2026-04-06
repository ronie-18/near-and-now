/**
 * Server-side geocoding - calls Google Geocoding API.
 */

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

function getApiKey(): string {
  // Prefer server-side API key (no referrer restrictions)
  // Fallback to VITE_ key for backward compatibility
  return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

/**
 * Reverse geocode (lat, lng) to formatted address.
 * Returns null if API key missing or request fails.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    const data = (await response.json()) as { status?: string; results?: Array<{ formatted_address?: string }> };

    if (data.status === 'OK' && data.results?.[0]?.formatted_address) {
      return String(data.results[0].formatted_address).trim();
    }
    return null;
  } catch (err) {
    console.error('Reverse geocode error:', err);
    return null;
  }
}

/**
 * Forward geocode a free-text address to coordinates.
 * Returns null if API key missing or no result.
 */
export async function forwardGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = getApiKey();
  const q = String(address || '').trim();
  if (!apiKey || !q) return null;

  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('address', q);
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    const data = (await response.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };

    const loc = data.results?.[0]?.geometry?.location;
    if (data.status === 'OK' && loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  } catch (err) {
    console.error('Forward geocode error:', err);
    return null;
  }
}
