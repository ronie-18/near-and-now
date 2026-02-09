/**
 * Places Service - uses backend proxy for Google Places & Geocoding APIs.
 * Direct browser calls to Google REST APIs fail due to CORS.
 */

const API_BASE = '/api/places';

export interface LocationData {
  address: string;
  city: string;
  pincode: string;
  state: string;
  lat: number;
  lng: number;
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
