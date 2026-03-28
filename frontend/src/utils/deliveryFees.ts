/**
 * Checkout fees: platform + handling + distance-based delivery.
 * Delivery is waived when cart subtotal is at least FREE_DELIVERY_SUBTOTAL_MIN.
 */

export const PLATFORM_FEE = 9.5;
export const HANDLING_FEE = 5.5;

/** Used when delivery coordinates are not available yet (quote only). */
export const DEFAULT_QUOTE_DISTANCE_KM = 2;

/** Subtotal at or above this → delivery component is ₹0 (platform + handling still apply). */
export const FREE_DELIVERY_SUBTOTAL_MIN = 300;

export interface DeliveryFeeBreakdown {
  deliveryFee: number;
  /** Tier charge before subtotal-based free delivery */
  rawDeliveryFee: number;
  platformFee: number;
  handlingFee: number;
  totalFees: number;
  /** Distance (km) used to pick the tier */
  distanceKm: number;
  deliveryFreeBySubtotal: boolean;
}

/**
 * Tiered delivery: ₹15 (≤1 km), ₹20 (≤2 km), ₹25 (≤3 km), ₹40 (≤4 km and beyond).
 */
export function deliveryChargeForDistanceKm(distanceKm: number): number {
  if (distanceKm <= 0) return 15;
  if (distanceKm <= 1) return 15;
  if (distanceKm <= 2) return 20;
  if (distanceKm <= 3) return 25;
  if (distanceKm <= 4) return 40;
  return 40;
}

/**
 * Full fee breakdown for checkout UI and order totals.
 * @param distanceKm Distance used for tier (use DEFAULT_QUOTE_DISTANCE_KM when unknown)
 * @param cartSubtotal Sum of item line totals before fees
 */
export function calculateFeeBreakdown(
  distanceKm: number = DEFAULT_QUOTE_DISTANCE_KM,
  cartSubtotal: number = 0
): DeliveryFeeBreakdown {
  const rawDeliveryFee = deliveryChargeForDistanceKm(distanceKm);
  const deliveryFreeBySubtotal = cartSubtotal >= FREE_DELIVERY_SUBTOTAL_MIN;
  const deliveryFee = deliveryFreeBySubtotal ? 0 : rawDeliveryFee;
  const totalFees = deliveryFee + PLATFORM_FEE + HANDLING_FEE;

  return {
    deliveryFee,
    rawDeliveryFee,
    platformFee: PLATFORM_FEE,
    handlingFee: HANDLING_FEE,
    totalFees,
    distanceKm,
    deliveryFreeBySubtotal
  };
}

export function getCheckoutOrderTotals(
  cartSubtotal: number,
  resolvedDistanceKm: number | null,
  discount = 0
) {
  const effectiveKm = resolvedDistanceKm ?? DEFAULT_QUOTE_DISTANCE_KM;
  const breakdown = calculateFeeBreakdown(effectiveKm, cartSubtotal);
  return {
    subtotal: cartSubtotal,
    discount,
    platformFee: breakdown.platformFee,
    handlingFee: breakdown.handlingFee,
    deliveryFee: breakdown.deliveryFee,
    rawDeliveryFee: breakdown.rawDeliveryFee,
    feesTotal: breakdown.totalFees,
    distanceKmUsed: breakdown.distanceKm,
    deliveryFreeBySubtotal: breakdown.deliveryFreeBySubtotal,
    orderTotal: cartSubtotal + breakdown.totalFees - discount
  };
}

/**
 * Calculate distance between two points using Haversine formula
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function isWithinDeliveryRange(distanceKm: number, maxRangeKm: number = 4): boolean {
  return distanceKm <= maxRangeKm;
}

export const DEFAULT_PRODUCT_RADIUS_KM = 2;
export const MAX_DELIVERY_RANGE_KM = 4;
