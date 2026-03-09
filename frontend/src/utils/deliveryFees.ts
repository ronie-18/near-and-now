/**
 * Delivery Fee Calculation Utility
 * 
 * Revenue Plan:
 * - Platform fee: ₹9.50
 * - Handling fee: ₹5.50
 * - Delivery fee (distance-based):
 *   - 0-1 km: ₹15
 *   - 1-2 km: ₹20
 *   - 2-3 km: ₹25
 *   - 3-4 km: ₹30 (exceptional, not more than this range)
 */

export const PLATFORM_FEE = 9.50;
export const HANDLING_FEE = 5.50;

export interface DeliveryFeeBreakdown {
  deliveryFee: number;
  platformFee: number;
  handlingFee: number;
  totalFees: number;
  distance: number;
}

/**
 * Calculate delivery fee based on distance in kilometers
 * @param distanceKm Distance in kilometers
 * @returns Delivery fee amount
 */
export function calculateDeliveryFee(distanceKm: number): number {
  if (distanceKm <= 1) {
    return 15;
  } else if (distanceKm <= 2) {
    return 20;
  } else if (distanceKm <= 3) {
    return 25;
  } else if (distanceKm <= 4) {
    return 30;
  } else {
    // Beyond 4km is exceptional - return 30 as max
    return 30;
  }
}

/**
 * Calculate complete fee breakdown including platform and handling fees
 * @param distanceKm Distance in kilometers
 * @returns Complete fee breakdown
 */
export function calculateFeeBreakdown(distanceKm: number): DeliveryFeeBreakdown {
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
