/**
 * Google Roads API - Snap to Roads.
 * Snaps GPS points to nearest roads and optionally interpolates path along road geometry.
 * Use when Directions API fails or for ensuring points are on actual roads.
 */

const ROADS_SNAP_URL = 'https://roads.googleapis.com/v1/snapToRoads';

function getApiKey(): string {
  // Prefer server-side API key (no referrer restrictions)
  // Fallback to VITE_ key for backward compatibility
  return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

/** Sample points along straight line, spaced ~250m for optimal snap quality */
function sampleStraightPath(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  maxPoints = 50
): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  const R = 6371000;
  const dLat = (destination.lat - origin.lat) * Math.PI / 180;
  const dLng = (destination.lng - origin.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distM = R * c;
  const stepM = Math.max(150, Math.min(300, distM / maxPoints));
  const n = Math.min(maxPoints, Math.max(10, Math.ceil(distM / stepM)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    points.push({
      lat: origin.lat + (destination.lat - origin.lat) * t,
      lng: origin.lng + (destination.lng - origin.lng) * t,
    });
  }
  return points;
}

/**
 * Snap a path to roads using Google Roads API.
 * Returns points along actual road geometry. Use interpolate=true for smooth curves.
 */
export async function snapToRoads(
  path: { lat: number; lng: number }[],
  interpolate = true
): Promise<{ lat: number; lng: number }[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('Roads API: API key not configured. Set GOOGLE_MAPS_API_KEY in backend/.env');
    console.warn('Note: Server-side API keys should NOT have HTTP referrer restrictions');
    return [];
  }
  if (path.length < 2) return path;

  if (path.length > 100) {
    path = path.filter((_, i) => i % Math.ceil(path.length / 100) === 0 || i === path.length - 1);
  }
  const pathStr = path.map((p) => `${p.lat},${p.lng}`).join('|');

  try {
    const url = new URL(ROADS_SNAP_URL);
    url.searchParams.set('path', pathStr);
    url.searchParams.set('interpolate', String(interpolate));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    const data = (await response.json()) as {
      error?: { message?: string };
      snappedPoints?: Array<{ location: { latitude: number; longitude: number } }>;
    };

    if (!response.ok) {
      const errorMsg = data?.error?.message ?? 'Unknown error';
      console.warn(`Roads API error (${response.status}):`, errorMsg);
      return [];
    }

    const snapped = data.snappedPoints as Array<{ location: { latitude: number; longitude: number } }> | undefined;
    if (!snapped || snapped.length < 2) {
      console.warn(`Roads API returned insufficient points: ${snapped?.length || 0}`);
      return [];
    }

    return snapped.map((p) => ({
      lat: p.location.latitude,
      lng: p.location.longitude,
    }));
  } catch (err) {
    console.error('Roads API fetch error:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Get road path from origin to destination.
 * Uses Roads API to snap a straight-line path to roads when Directions is not available.
 */
export async function getRoadPathViaSnap(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{ lat: number; lng: number }[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('Roads API: API key not configured for snap fallback');
    return [];
  }
  
  const path = sampleStraightPath(origin, destination);
  console.log(`Snapping ${path.length} sampled points to roads`);
  const snapped = await snapToRoads(path, true);
  
  if (snapped.length >= 2) {
    console.log(`Roads API snap successful: ${snapped.length} points`);
  } else {
    console.warn('Roads API snap returned insufficient points');
  }
  
  return snapped;
}
