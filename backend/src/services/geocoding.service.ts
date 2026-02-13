/**
 * Server-side geocoding - calls Google Geocoding API.
 */

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

function getApiKey(): string {
  return process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
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
    const data = await response.json();

    if (data.status === 'OK' && data.results?.[0]?.formatted_address) {
      return String(data.results[0].formatted_address).trim();
    }
    return null;
  } catch (err) {
    console.error('Reverse geocode error:', err);
    return null;
  }
}
