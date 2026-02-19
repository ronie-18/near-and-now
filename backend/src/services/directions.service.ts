/**
 * Directions Service - Fetches road path between two points.
 * Primary: Google Directions API. Fallback: Google Roads API (snap to roads).
 */

const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
import { getRoadPathViaSnap } from './roads.service.js';

function getApiKey(): string {
  // Prefer server-side API key (no referrer restrictions)
  // Fallback to VITE_ key for backward compatibility
  return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

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
 * Get road path between two points (along actual roads).
 * Uses Directions API first, then Roads API (snap to roads) as fallback.
 * Both use the API key from .env (VITE_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY).
 */
export async function fetchRoadRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{ lat: number; lng: number }[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('Directions: API key not configured. Set GOOGLE_MAPS_API_KEY (recommended) or GOOGLE_MAPS_SERVER_API_KEY in backend/.env');
    console.warn('Note: Server-side API keys should NOT have HTTP referrer restrictions');
    return [];
  }

  const originStr = `${origin.lat},${origin.lng}`;
  const destStr = `${destination.lat},${destination.lng}`;

  // 1. Try Directions API (optimal routing)
  try {
    const url = new URL(DIRECTIONS_URL);
    url.searchParams.set('origin', originStr);
    url.searchParams.set('destination', destStr);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('alternatives', 'false');
    url.searchParams.set('region', 'in');

    const response = await fetch(url.toString());
    const data = (await response.json()) as {
      status?: string;
      routes?: Array<{ overview_polyline?: { points: string }; legs?: Array<{ steps?: Array<{ start_location: { lat: number; lng: number }; end_location: { lat: number; lng: number } }> }> }>;
      error_message?: string;
    };

    if (response.ok && data.status === 'OK') {
      const route = data.routes?.[0];
      if (route) {
        // Prefer overview_polyline (most accurate road geometry)
        if (route.overview_polyline?.points) {
          const poly = decodePolyline(route.overview_polyline.points);
          if (poly.length > 1) {
            console.log(`Directions API successful: ${poly.length} points from polyline`);
            return poly;
          }
        }
        // Fallback to step points
        const stepPoints = pointsFromLegsSteps(route);
        if (stepPoints.length > 1) {
          console.log(`Directions API successful: ${stepPoints.length} points from steps`);
          return stepPoints;
        }
      }
    } else {
      console.warn(`Directions API failed: ${data?.status ?? response.status}`, data?.error_message ?? '');
    }
  } catch (err) {
    console.error('Directions API fetch error:', err);
  }

  // 2. Fallback: Roads API (snap to roads - uses same API key)
  console.log('Falling back to Roads API (snap to roads)');
  try {
    const snapped = await getRoadPathViaSnap(origin, destination);
    if (snapped.length >= 2) {
      console.log(`Roads API successful: ${snapped.length} snapped points`);
      return snapped;
    } else {
      console.warn('Roads API returned insufficient points');
    }
  } catch (err) {
    console.error('Roads API fallback error:', err);
  }

  console.warn('All routing APIs failed, returning empty array');
  return [];
}
