/**
 * Directions Service - Fetches road path between two points.
 * Primary: Google Directions API. Fallback: Google Roads API (snap to roads).
 */

const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
import { getRoadPathViaSnap } from './roads.service.js';

function getApiKey(): string {
  return process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
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
    console.warn('Directions: API key not configured. Set VITE_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY in .env');
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
    const data = await response.json();

    if (response.ok && data.status === 'OK') {
      const route = data.routes?.[0];
      if (route?.overview_polyline?.points) {
        const poly = decodePolyline(route.overview_polyline.points);
        if (poly.length > 1) return poly;
      }
      const stepPoints = pointsFromLegsSteps(route || {});
      if (stepPoints.length > 1) return stepPoints;
    }
  } catch (err) {
    console.error('Directions fetch error:', err);
  }

  // 2. Fallback: Roads API (snap to roads - uses same API key)
  const snapped = await getRoadPathViaSnap(origin, destination);
  if (snapped.length >= 2) return snapped;

  return [];
}
