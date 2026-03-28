/**
 * Checkout fees (platform + handling + delivery).
 * Delivery is a fixed standard rate for now; distance-based calculation will plug in later.
 */

export const PLATFORM_FEE = 9.5;
export const HANDLING_FEE = 5.5;
/** Standard delivery charge until distance-based pricing is wired up */
export const STANDARD_DELIVERY_FEE = 15;

export interface DeliveryFeeBreakdown {
  deliveryFee: number;
  platformFee: number;
  handlingFee: number;
  totalFees: number;
  /** Reserved for future distance-based delivery; unused while flat ₹15 applies */
  distance: number;
}

/**
 * Delivery charge only (flat ₹15 for now).
 * @param _distanceKm Ignored until distance-based section is implemented
 */
export function calculateDeliveryFee(_distanceKm?: number): number {
  return STANDARD_DELIVERY_FEE;
}

/** Platform + handling + standard delivery */
export function getCheckoutFeesTotal(): number {
  return PLATFORM_FEE + HANDLING_FEE + STANDARD_DELIVERY_FEE;
}

/**
 * Full fee breakdown for checkout UI and order totals.
 * @param distanceKm Optional; stored for future use when delivery varies by distance
 */
export function calculateFeeBreakdown(distanceKm: number = 0): DeliveryFeeBreakdown {
  const deliveryFee = calculateDeliveryFee(distanceKm);
  const totalFees = deliveryFee + PLATFORM_FEE + HANDLING_FEE;

  return {
    deliveryFee,
    platformFee: PLATFORM_FEE,
    handlingFee: HANDLING_FEE,
    totalFees,
    distance: distanceKm
  };
}

/**
 * Calculate distance between two points using Haversine formula
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Determine if a product/store is within delivery range
 * @param distanceKm Distance in kilometers
 * @param maxRangeKm Maximum delivery range (default 4km)
 * @returns true if within range
 */
export function isWithinDeliveryRange(distanceKm: number, maxRangeKm: number = 4): boolean {
  return distanceKm <= maxRangeKm;
}

/**
 * Get the default display radius for products (2km as per requirements)
 */
export const DEFAULT_PRODUCT_RADIUS_KM = 2;

/**
 * Get the maximum delivery range (4km as per requirements)
 */
export const MAX_DELIVERY_RANGE_KM = 4;
